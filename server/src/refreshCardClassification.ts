import "./config.js";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { statSync } from "node:fs";
import mongoose from "mongoose";
import {
  applyClassificationOverride,
  classifyCard,
  getSpecialArtDecisionStatus,
  SPECIAL_ART_CATEGORIES,
  type CardClassification,
} from "./classification.js";
import {
  Card,
  CardClassificationOverride,
  CollectionItem,
  SyncStatus,
} from "./models.js";

const BATCH_SIZE = 500;
const EXPECTED_CARDS = 45_620;
const EXPECTED_COLLECTION_ITEMS = 1;
const EXPECTED_COLLECTION_HASH = "bb46bc35a040afa653e79534132787c68e3df38c976a8072665af69f883d2f6a";

function objectRecord(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function isClassification(value: string): value is CardClassification {
  return [
    ...SPECIAL_ART_CATEGORIES,
    "EXCLUDED",
    "NEEDS_REVIEW",
  ].includes(value as CardClassification);
}

function collectionHash(items: unknown[]): string {
  return createHash("sha256").update(JSON.stringify(items)).digest("hex");
}

async function main(): Promise<void> {
  const apply = process.argv.includes("--apply");
  const backupFlag = process.argv.indexOf("--backup");
  const backupPath = backupFlag >= 0 ? process.argv[backupFlag + 1] : undefined;
  if (apply && !backupPath) throw new Error("--backup <archive> is required with --apply.");
  if (backupPath) {
    const backup = statSync(backupPath);
    if (!backup.isFile() || backup.size < 1_000_000) {
      throw new Error("The specified database backup is missing or unexpectedly small.");
    }
    console.info(execFileSync("mongorestore", ["--dryRun", "--gzip", `--archive=${backupPath}`], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    }).trim());
  }

  const mongoUri = process.env.MONGODB_URI;
  if (!mongoUri) throw new Error("MONGODB_URI is required.");
  const configuredDatabase = new URL(mongoUri).pathname.replace(/^\/+/, "").split("/")[0];
  if (configuredDatabase !== "Pokedex") throw new Error(`Refusing database "${configuredDatabase || "(missing)"}".`);
  mongoose.set("autoIndex", false);
  mongoose.set("autoCreate", false);
  await mongoose.connect(mongoUri, { serverSelectionTimeoutMS: 10_000 });
  if (mongoose.connection.db?.databaseName !== "Pokedex") {
    throw new Error("Connected database is not Pokedex.");
  }

  try {
    const status = await SyncStatus.findOne({ key: "main" }).lean();
    const activeLocales = Object.entries(status?.localeProgress ?? {})
      .filter(([, value]) => objectRecord(value).status === "running")
      .map(([language]) => language);
    if (status?.status === "running" || activeLocales.length > 0) {
      throw new Error(`Refusing classification refresh during active sync (${activeLocales.join(", ") || "main"}).`);
    }
    if (status?.tcgDexStatus === "running") {
      console.warn("Top-level TCGdex status is stale; verified all locale statuses are idle/completed.");
    }

    const [cards, overrides, collectionItems] = await Promise.all([
      Card.find().sort({ _id: 1 }).lean(),
      CardClassificationOverride.find().lean(),
      CollectionItem.find().sort({ _id: 1 }).lean(),
    ]);
    const beforeHash = collectionHash(collectionItems);
    if (
      cards.length !== EXPECTED_CARDS
      || collectionItems.length !== EXPECTED_COLLECTION_ITEMS
      || beforeHash !== EXPECTED_COLLECTION_HASH
    ) {
      throw new Error("Database differs from the backed-up and approved card/collection baseline; refusing to write.");
    }
    const overridesByCard = new Map(overrides.map((override) => [String(override.card), override.classification]));
    const planned = cards.map((card) => {
      const sourceData = objectRecord(card.sourceData);
      const sourceCategory = typeof sourceData.category === "string" ? sourceData.category : undefined;
      const automatic = classifyCard({
        category: card.category?.trim() || sourceCategory,
        sourceCategory,
        rarity: card.rarity,
        hasArtwork: Boolean(card.image || sourceData.image),
        name: card.name,
        setId: card.setId,
        setName: card.setName,
        localId: card.localId,
      });
      const manual = overridesByCard.get(String(card._id));
      const result = manual && isClassification(manual)
        ? applyClassificationOverride(automatic, manual)
        : automatic;
      return {
        card,
        result,
        changed: card.cardType !== result.cardType
          || card.classification !== result.classification
          || card.isSpecialArt !== result.isSpecialArt
          || card.classificationConfidence !== result.classificationConfidence
          || card.classificationReason !== result.classificationReason
          || card.classificationSource !== result.classificationSource
          || card.classificationReviewed !== result.classificationReviewed,
      };
    });
    const typeCounts = new Map<string, number>();
    const categoryCounts = new Map<string, number>();
    const classificationTransitions = new Map<string, number>();
    const languageCounts = new Map<string, {
      cards: number;
      classificationUpdates: number;
      classificationTransitions: Map<string, number>;
      cardTypes: Map<string, number>;
      classifications: Map<string, number>;
      specialArtDecisions: Map<string, number>;
    }>();
    for (const { card, result, changed: hasChanged } of planned) {
      typeCounts.set(result.cardType, (typeCounts.get(result.cardType) ?? 0) + 1);
      categoryCounts.set(result.classification, (categoryCounts.get(result.classification) ?? 0) + 1);
      const language = card.language || "en";
      const counts = languageCounts.get(language) ?? {
        cards: 0,
        classificationUpdates: 0,
        classificationTransitions: new Map<string, number>(),
        cardTypes: new Map<string, number>(),
        classifications: new Map<string, number>(),
        specialArtDecisions: new Map<string, number>(),
      };
      counts.cards += 1;
      if (hasChanged) counts.classificationUpdates += 1;
      if (card.classification !== result.classification) {
        const transition = `${card.classification}->${result.classification}`;
        classificationTransitions.set(transition, (classificationTransitions.get(transition) ?? 0) + 1);
        counts.classificationTransitions.set(transition, (counts.classificationTransitions.get(transition) ?? 0) + 1);
      }
      counts.cardTypes.set(result.cardType, (counts.cardTypes.get(result.cardType) ?? 0) + 1);
      counts.classifications.set(result.classification, (counts.classifications.get(result.classification) ?? 0) + 1);
      const decision = getSpecialArtDecisionStatus(result.cardType, result.classification);
      counts.specialArtDecisions.set(decision, (counts.specialArtDecisions.get(decision) ?? 0) + 1);
      languageCounts.set(language, counts);
    }
    const changed = planned.filter((item) => item.changed);
    console.log(JSON.stringify({
      database: "Pokedex",
      mode: apply ? "apply" : "read-only dry run",
      cards: cards.length,
      classificationUpdates: changed.length,
      cardTypes: Object.fromEntries(typeCounts),
      classifications: Object.fromEntries(categoryCounts),
      classificationTransitions: Object.fromEntries(classificationTransitions),
      specialArtDecisions: {
        CONFIRMED_SPECIAL_ART: SPECIAL_ART_CATEGORIES.reduce((sum, label) => sum + (categoryCounts.get(label) ?? 0), 0),
        NEEDS_REVIEW: categoryCounts.get("NEEDS_REVIEW") ?? 0,
        NOT_SPECIAL_ART: categoryCounts.get("EXCLUDED") ?? 0,
      },
      byLanguage: Object.fromEntries([...languageCounts.entries()].map(([language, counts]) => [language, {
        cards: counts.cards,
        classificationUpdates: counts.classificationUpdates,
        classificationTransitions: Object.fromEntries(counts.classificationTransitions),
        cardTypes: Object.fromEntries(counts.cardTypes),
        classifications: Object.fromEntries(counts.classifications),
        specialArtDecisions: Object.fromEntries(counts.specialArtDecisions),
      }])),
      manualOverrides: overrides.length,
      collectionItems: collectionItems.length,
      collectionSnapshotSha256: beforeHash,
    }, null, 2));
    if (!apply) return;

    for (let offset = 0; offset < changed.length; offset += BATCH_SIZE) {
      const batch = changed.slice(offset, offset + BATCH_SIZE);
      await Card.bulkWrite(batch.map(({ card, result }) => ({
        updateOne: {
          filter: { _id: card._id },
          update: {
            $set: {
              cardType: result.cardType,
              classification: result.classification,
              isSpecialArt: result.isSpecialArt,
              classificationConfidence: result.classificationConfidence,
              classificationReason: result.classificationReason,
              classificationSource: result.classificationSource,
              classificationReviewed: result.classificationReviewed,
            },
          },
        },
      })), { ordered: true });
    }

    const [updatedCards, collectionAfter] = await Promise.all([
      Card.find().select("cardType classification").lean(),
      CollectionItem.find().sort({ _id: 1 }).lean(),
    ]);
    const actualTypes = new Map<string, number>();
    const actualClasses = new Map<string, number>();
    updatedCards.forEach((card) => {
      actualTypes.set(card.cardType, (actualTypes.get(card.cardType) ?? 0) + 1);
      actualClasses.set(card.classification, (actualClasses.get(card.classification) ?? 0) + 1);
    });
    const afterHash = collectionHash(collectionAfter);
    if (updatedCards.length !== cards.length || afterHash !== beforeHash) {
      throw new Error("Post-write verification failed: collection snapshot or card count changed.");
    }
    console.log(JSON.stringify({
      applied: true,
      classificationUpdates: changed.length,
      cardTypes: Object.fromEntries(actualTypes),
      classifications: Object.fromEntries(actualClasses),
      collectionItemsPreserved: collectionAfter.length === collectionItems.length && afterHash === beforeHash,
      collectionSnapshotSha256: afterHash,
    }, null, 2));
  } finally {
    await mongoose.disconnect();
  }
}

main().catch((error: unknown) => {
  console.error("Card classification refresh failed:", error);
  process.exitCode = 1;
});
