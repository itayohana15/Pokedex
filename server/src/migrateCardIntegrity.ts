import "./config.js";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { statSync } from "node:fs";
import mongoose from "mongoose";
import {
  Card,
  CardClassificationOverride,
  CollectionItem,
  Pokemon,
  PokemonCard,
  Set as CardSet,
  SyncStatus,
} from "./models.js";
import { buildCardIntegrityPlan } from "./cardIntegrity.js";

const APPROVED_BASELINE = {
  cards: 45_620,
  relationships: 36_722,
  collectionItems: 1,
  collectionHash: "bb46bc35a040afa653e79534132787c68e3df38c976a8072665af69f883d2f6a",
  cardClassificationChanges: 9_274,
  relationshipUpdates: 36_722,
  relationshipAdditions: 0,
  verifiedRelationships: 34_630,
  reviewRelationships: 2_092,
};
const BATCH_SIZE = 500;
const EXPECTED_CARD_TYPES = {
  POKEMON: 37_707,
  TRAINER: 6_807,
  ENERGY: 1_106,
};
const EXPECTED_CLASSIFICATIONS = {
  EXCLUDED: 31_746,
  ILLUSTRATION_RARE: 626,
  NEEDS_REVIEW: 13_032,
  SPECIAL_ILLUSTRATION_RARE: 216,
};

function objectRecord(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function numberArray(value: unknown): number[] {
  return Array.isArray(value)
    ? value.filter((item): item is number => typeof item === "number" && Number.isInteger(item) && item > 0)
    : [];
}

async function duplicateGroupCount(model: typeof Card | typeof CardSet): Promise<number> {
  const [result] = await model.aggregate<{ count: number }>([
    {
      $group: {
        _id: { language: "$language", sourceId: "$sourceId" },
        count: { $sum: 1 },
      },
    },
    { $match: { count: { $gt: 1 } } },
    { $count: "count" },
  ]);
  return result?.count ?? 0;
}

async function duplicateRelationshipGroupCount(): Promise<number> {
  const [result] = await PokemonCard.aggregate<{ count: number }>([
    { $group: { _id: { card: "$card", pokemon: "$pokemon" }, count: { $sum: 1 } } },
    { $match: { count: { $gt: 1 } } },
    { $count: "count" },
  ]);
  return result?.count ?? 0;
}

function chunk<T>(values: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let index = 0; index < values.length; index += size) {
    chunks.push(values.slice(index, index + size));
  }
  return chunks;
}

async function writeBatches<T>(
  values: T[],
  write: (batch: T[]) => Promise<unknown>,
): Promise<void> {
  for (const batch of chunk(values, BATCH_SIZE)) await write(batch);
}

async function main(): Promise<void> {
  if (!process.argv.includes("--apply")) {
    throw new Error("This command writes to MongoDB. Re-run only with --apply and an explicit --backup <archive> path.");
  }
  const backupFlag = process.argv.indexOf("--backup");
  const backupPath = backupFlag >= 0 ? process.argv[backupFlag + 1] : undefined;
  if (!backupPath) throw new Error("--backup <archive> is required.");
  const backup = statSync(backupPath);
  if (!backup.isFile() || backup.size !== 23_298_558) {
    throw new Error(`Backup archive size does not match the verified snapshot (${backup.size} bytes).`);
  }

  const mongoUri = process.env.MONGODB_URI;
  if (!mongoUri) throw new Error("MONGODB_URI is required.");
  const database = new URL(mongoUri).pathname.replace(/^\/+/, "").split("/")[0];
  if (database !== "Pokedex") throw new Error(`Refusing to modify database "${database || "(missing)"}"; expected Pokedex.`);

  const archiveCheck = execFileSync("mongorestore", ["--dryRun", "--gzip", `--archive=${backupPath}`], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  console.info(archiveCheck.trim());

  mongoose.set("autoIndex", false);
  mongoose.set("autoCreate", false);
  await mongoose.connect(mongoUri, { serverSelectionTimeoutMS: 10_000 });
  if (mongoose.connection.db?.databaseName !== "Pokedex") {
    throw new Error(`Connected to unexpected database "${mongoose.connection.db?.databaseName ?? "(missing)"}".`);
  }

  try {
    const syncStatus = await SyncStatus.findOne({ key: "main" }).lean();
    const runningLocales = Object.entries(syncStatus?.localeProgress ?? {})
      .filter(([, value]) => objectRecord(value).status === "running")
      .map(([language]) => language);
    if (syncStatus?.status === "running" || runningLocales.length > 0) {
      throw new Error(`Refusing to migrate during active sync. Running locales: ${runningLocales.join(", ") || "none"}.`);
    }

    const [
      cards,
      pokemon,
      links,
      overrides,
      collectionItems,
      cardDuplicates,
      setDuplicates,
      relationshipDuplicates,
    ] = await Promise.all([
      Card.find().lean(),
      Pokemon.find().select("_id nationalDex").lean(),
      PokemonCard.find().lean(),
      CardClassificationOverride.find().lean(),
      CollectionItem.find().sort({ _id: 1 }).lean(),
      duplicateGroupCount(Card),
      duplicateGroupCount(CardSet),
      duplicateRelationshipGroupCount(),
    ]);
    const collectionHash = createHash("sha256").update(JSON.stringify(collectionItems)).digest("hex");
    if (
      cards.length !== APPROVED_BASELINE.cards
      || links.length !== APPROVED_BASELINE.relationships
      || collectionItems.length !== APPROVED_BASELINE.collectionItems
      || collectionHash !== APPROVED_BASELINE.collectionHash
      || overrides.length !== 0
      || cardDuplicates !== 0
      || setDuplicates !== 0
      || relationshipDuplicates !== 0
    ) {
      throw new Error("Database no longer matches the approved Dry Run baseline; no migration writes were made.");
    }

    const pokemonById = new Map(pokemon.map((item) => [String(item._id), item]));
    const pokemonByDexId = new Map(pokemon.map((item) => [item.nationalDex, item]));
    const overridesByCard = new Map(overrides.map((item) => [String(item.card), item.classification]));
    const cardRecords = cards.map((card) => {
      const sourceData = objectRecord(card.sourceData);
      const sourceCategory = typeof sourceData.category === "string" ? sourceData.category : undefined;
      return {
        id: String(card._id),
        category: card.category?.trim() || sourceCategory,
        sourceCategory,
        rarity: card.rarity,
        image: card.image,
        name: card.name,
        setId: card.setId,
        setName: card.setName,
        localId: card.localId,
        dexIds: numberArray(card.dexIds).length > 0 ? numberArray(card.dexIds) : numberArray(sourceData.dexId),
        cameoDexIds: numberArray(card.cameoDexIds).length > 0
          ? numberArray(card.cameoDexIds)
          : numberArray(sourceData.cameoDexIds),
        currentCardType: card.cardType,
        currentClassification: card.classification,
        currentIsSpecialArt: card.isSpecialArt,
        currentClassificationConfidence: card.classificationConfidence,
        currentClassificationReason: card.classificationReason,
        currentClassificationSource: card.classificationSource,
        currentClassificationReviewed: card.classificationReviewed,
        currentRelationshipStatus: card.pokemonRelationshipStatus,
        currentRelationshipReason: card.pokemonRelationshipReason,
        manualOverride: overridesByCard.get(String(card._id)),
      };
    });
    const linksForPlan = links.map((link) => ({
      cardId: String(link.card),
      pokemonDexId: pokemonById.get(String(link.pokemon))?.nationalDex ?? -1,
      currentVerificationStatus: link.verificationStatus,
      currentSourceField: link.sourceField,
      currentReviewReason: link.reviewReason,
    }));
    const plan = buildCardIntegrityPlan(
      cardRecords,
      linksForPlan,
      new Set(pokemon.map((item) => item.nationalDex)),
    );
    const classificationChanges = plan.cards.filter((card) => card.classificationChanged).length;
    if (
      classificationChanges > APPROVED_BASELINE.cardClassificationChanges
      || plan.relationshipUpdates.length > APPROVED_BASELINE.relationshipUpdates
      || plan.relationshipAdditions.length !== APPROVED_BASELINE.relationshipAdditions
    ) {
      throw new Error("Computed migration plan differs from the approved Dry Run; no migration writes were made.");
    }
    const plannedCardTypes = new Map<string, number>();
    const plannedClassifications = new Map<string, number>();
    for (const item of plan.cards) {
      const cardType = item.classification.cardType;
      const classification = item.classification.classification;
      plannedCardTypes.set(cardType, (plannedCardTypes.get(cardType) ?? 0) + 1);
      plannedClassifications.set(classification, (plannedClassifications.get(classification) ?? 0) + 1);
    }
    const hasExpectedCounts = (actual: Map<string, number>, expected: Record<string, number>) =>
      Object.entries(expected).every(([key, count]) => actual.get(key) === count)
      && [...actual.keys()].every((key) => key in expected);
    if (
      !hasExpectedCounts(plannedCardTypes, EXPECTED_CARD_TYPES)
      || !hasExpectedCounts(plannedClassifications, EXPECTED_CLASSIFICATIONS)
    ) {
      throw new Error("Classification totals differ from the approved Dry Run; no migration writes were made.");
    }

    const cardsById = new Map(cards.map((card) => [String(card._id), card]));
    const cardOperations = plan.cards.filter((item) => item.metadataChanged).flatMap((item) => {
      const card = cardsById.get(item.id);
      if (!card) throw new Error(`Card ${item.id} disappeared while preparing migration.`);
      return [{
        updateOne: {
          filter: { _id: card._id },
          update: {
            $set: {
              cardType: item.classification.cardType,
              classification: item.classification.classification,
              isSpecialArt: item.classification.isSpecialArt,
              classificationConfidence: item.classification.classificationConfidence,
              classificationReason: item.classification.classificationReason,
              classificationSource: item.classification.classificationSource,
              classificationReviewed: item.classification.classificationReviewed,
              pokemonRelationshipStatus: item.pokemonRelationshipStatus,
              pokemonRelationshipReason: item.pokemonRelationshipReason,
            },
          },
        },
      }];
    });
    await writeBatches(cardOperations, (batch) => Card.bulkWrite(batch, { ordered: true }));

    const linksByKey = new Map<string, Array<typeof links[number]>>();
    links.forEach((link, index) => {
      const planLink = linksForPlan[index];
      const key = `${planLink.cardId}:${planLink.pokemonDexId}`;
      const matchingLinks = linksByKey.get(key) ?? [];
      matchingLinks.push(link);
      linksByKey.set(key, matchingLinks);
    });
    const relationshipOperations = plan.relationshipUpdates.flatMap((item) => {
      const existing = linksByKey.get(`${item.cardId}:${item.pokemonDexId}`)?.shift();
      if (!existing) throw new Error(`Relationship ${item.cardId}:${item.pokemonDexId} disappeared during migration.`);
      return [{
        updateOne: {
          filter: { _id: existing._id },
          update: {
            $set: {
              verificationStatus: item.verificationStatus,
              sourceField: item.sourceField,
              reviewReason: item.reviewReason,
            },
          },
        },
      }];
    });
    const relationshipAdditions = plan.relationshipAdditions.map((item) => {
      const card = cardsById.get(item.cardId);
      const linkedPokemon = pokemonByDexId.get(item.pokemonDexId);
      if (!card || !linkedPokemon) {
        throw new Error(`Cannot resolve new verified relationship ${item.cardId}:${item.pokemonDexId}.`);
      }
      return {
        updateOne: {
          filter: { card: card._id, pokemon: linkedPokemon._id },
          update: {
            $set: {
              verificationStatus: item.verificationStatus,
              sourceField: item.sourceField,
              reviewReason: item.reviewReason,
            },
            $setOnInsert: { card: card._id, pokemon: linkedPokemon._id },
          },
          upsert: true,
        },
      };
    });
    await writeBatches([...relationshipOperations, ...relationshipAdditions], (batch) =>
      PokemonCard.bulkWrite(batch, { ordered: true }),
    );

    const [cardCountAfter, relationshipCountAfter, collectionAfter, collectionCountAfter] = await Promise.all([
      Card.countDocuments(),
      PokemonCard.countDocuments(),
      CollectionItem.find().sort({ _id: 1 }).lean(),
      CollectionItem.countDocuments(),
    ]);
    const collectionHashAfter = createHash("sha256").update(JSON.stringify(collectionAfter)).digest("hex");
    const [verifiedRelationships, reviewRelationships, cardTypeCounts, classificationCounts] = await Promise.all([
      PokemonCard.countDocuments({ verificationStatus: "VERIFIED" }),
      PokemonCard.countDocuments({ verificationStatus: "NEEDS_REVIEW" }),
      Card.aggregate([{ $group: { _id: "$cardType", count: { $sum: 1 } } }]),
      Card.aggregate([{ $group: { _id: "$classification", count: { $sum: 1 } } }]),
    ]);
    if (
      cardCountAfter !== APPROVED_BASELINE.cards
      || relationshipCountAfter !== APPROVED_BASELINE.relationships
      || collectionCountAfter !== APPROVED_BASELINE.collectionItems
      || collectionHashAfter !== APPROVED_BASELINE.collectionHash
      || verifiedRelationships !== APPROVED_BASELINE.verifiedRelationships
      || reviewRelationships !== APPROVED_BASELINE.reviewRelationships
      || !hasExpectedCounts(
        new Map(cardTypeCounts.map((item) => [item._id, item.count])),
        EXPECTED_CARD_TYPES,
      )
      || !hasExpectedCounts(
        new Map(classificationCounts.map((item) => [item._id, item.count])),
        EXPECTED_CLASSIFICATIONS,
      )
    ) {
      throw new Error("Post-migration integrity checks failed. Collection data was not modified; review the reported state before retrying.");
    }

    console.log(JSON.stringify({
      database: "Pokedex",
      applied: true,
      cardClassificationChanges: classificationChanges,
      cardMetadataUpdates: plan.cards.length,
      relationshipUpdates: relationshipOperations.length,
      relationshipAdditions: relationshipAdditions.length,
      cardsAfter: cardCountAfter,
      relationshipsAfter: relationshipCountAfter,
      verifiedRelationships,
      relationshipsNeedingReview: reviewRelationships,
      cardTypeCounts: Object.fromEntries(cardTypeCounts.map((item) => [item._id, item.count])),
      classificationCounts: Object.fromEntries(classificationCounts.map((item) => [item._id, item.count])),
      collectionItemsBefore: collectionItems.length,
      collectionItemsAfter: collectionCountAfter,
      collectionSnapshotPreserved: collectionHashAfter === collectionHash,
      collectionSnapshotSha256: collectionHashAfter,
      manualOverridesPreserved: overrides.length,
      cardSourceDuplicateGroups: cardDuplicates,
      setSourceDuplicateGroups: setDuplicates,
    }, null, 2));
  } finally {
    await mongoose.disconnect();
  }
}

main().catch((error: unknown) => {
  console.error("Card integrity migration failed:", error);
  process.exitCode = 1;
});
