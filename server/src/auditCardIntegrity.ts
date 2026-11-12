import "./config.js";
import { createHash } from "node:crypto";
import mongoose from "mongoose";
import {
  Card,
  CardClassificationOverride,
  CollectionItem,
  Pokemon,
  PokemonCard,
  Set as CardSet,
} from "./models.js";
import { buildCardIntegrityPlan } from "./cardIntegrity.js";
import { SPECIAL_ART_CATEGORIES } from "./classification.js";

const INCLUDED = new Set<string>(SPECIAL_ART_CATEGORIES);

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

async function main(): Promise<void> {
  const mongoUri = process.env.MONGODB_URI;
  if (!mongoUri) throw new Error("MONGODB_URI is required for the read-only audit.");
  const database = new URL(mongoUri).pathname.replace(/^\/+/, "").split("/")[0];
  if (database !== "Pokedex") throw new Error(`Refusing to audit database "${database || "(missing)"}"; expected Pokedex.`);

  mongoose.set("autoIndex", false);
  mongoose.set("autoCreate", false);
  await mongoose.connect(mongoUri, { serverSelectionTimeoutMS: 10_000 });
  if (mongoose.connection.db?.databaseName !== "Pokedex") {
    throw new Error(`Connected to unexpected database "${mongoose.connection.db?.databaseName ?? "(missing)"}".`);
  }

  try {
    const [cards, pokemon, links, overrides, collectionItems, cardDuplicates, setDuplicates] = await Promise.all([
      Card.find().lean(),
      Pokemon.find().select("_id nationalDex name").lean(),
      PokemonCard.find().lean(),
      CardClassificationOverride.find().lean(),
      CollectionItem.find().sort({ _id: 1 }).lean(),
      duplicateGroupCount(Card),
      duplicateGroupCount(CardSet),
    ]);

    const pokemonById = new Map(pokemon.map((item) => [String(item._id), item]));
    const pokemonIds = new Set(pokemon.map((item) => item.nationalDex));
    const overridesByCard = new Map(overrides.map((item) => [String(item.card), item.classification]));
    const cardRecords = cards.map((card) => {
      const sourceData = objectRecord(card.sourceData);
      const sourceCategory = typeof sourceData.category === "string" ? sourceData.category : undefined;
      const category = card.category?.trim() || sourceCategory;
      const dexIds = numberArray(card.dexIds).length > 0
        ? numberArray(card.dexIds)
        : numberArray(sourceData.dexId);
      const cameoDexIds = numberArray(card.cameoDexIds).length > 0
        ? numberArray(card.cameoDexIds)
        : numberArray(sourceData.cameoDexIds);
      return {
        id: String(card._id),
        category,
        sourceCategory,
        rarity: card.rarity,
        image: card.image,
        name: card.name,
        setId: card.setId,
        setName: card.setName,
        localId: card.localId,
        dexIds,
        cameoDexIds,
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
    const cardById = new Map(cards.map((card) => [String(card._id), card]));
    const linksForPlan = links.flatMap((link) => {
      const linkedPokemon = pokemonById.get(String(link.pokemon));
      return linkedPokemon
        ? [{
          cardId: String(link.card),
          pokemonDexId: linkedPokemon.nationalDex,
          currentVerificationStatus: link.verificationStatus,
          currentSourceField: link.sourceField,
          currentReviewReason: link.reviewReason,
        }]
        : [{
          cardId: String(link.card),
          pokemonDexId: -1,
          currentVerificationStatus: link.verificationStatus,
          currentSourceField: link.sourceField,
          currentReviewReason: link.reviewReason,
        }];
    });
    const plan = buildCardIntegrityPlan(cardRecords, linksForPlan, pokemonIds);
    const planByCard = new Map(plan.cards.map((item) => [item.id, item]));
    const currentClassificationCounts = new Map<string, number>();
    const cardTypeCounts = new Map<string, number>();
    const classificationCounts = new Map<string, number>();
    const reviewReasonCounts = new Map<string, number>();
    const plannedByTypeAndClassification = new Map<string, number>();
    const currentIncludedTrainerCards = new Set<string>();
    const currentIncludedTrainerLinks: Array<Record<string, unknown>> = [];
    const currentMultipleRelationshipCards = new Set<string>();
    const plannedVerifiedRelationCounts = new Map<string, number>();
    const relationsByCard = new Map<string, Set<number>>();
    let cardsMissingStoredCategory = 0;
    let cardsRecoveredCategoryFromSource = 0;
    let newIllustrationRare = 0;
    let newSpecialIllustrationRare = 0;
    let newAlternateArt = 0;
    let newFullArt = 0;
    let newSpecialArtPromo = 0;
    for (const link of links) {
      const id = String(link.card);
      const related = relationsByCard.get(id) ?? new Set<number>();
      const linkedPokemon = pokemonById.get(String(link.pokemon));
      if (linkedPokemon) related.add(linkedPokemon.nationalDex);
      relationsByCard.set(id, related);
    }

    for (const card of cards) {
      const cardId = String(card._id);
      const planCard = planByCard.get(cardId);
      const plannedType = planCard?.classification.cardType ?? "UNKNOWN";
      const plannedClassification = planCard?.classification.classification ?? "NEEDS_REVIEW";
      if (!card.category?.trim()) {
        cardsMissingStoredCategory += 1;
        if (typeof objectRecord(card.sourceData).category === "string" && objectRecord(card.sourceData).category) {
          cardsRecoveredCategoryFromSource += 1;
        }
      }
      currentClassificationCounts.set(card.classification, (currentClassificationCounts.get(card.classification) ?? 0) + 1);
      cardTypeCounts.set(plannedType, (cardTypeCounts.get(plannedType) ?? 0) + 1);
      classificationCounts.set(
        plannedClassification,
        (classificationCounts.get(plannedClassification) ?? 0) + 1,
      );
      const pair = `${plannedType}/${plannedClassification}`;
      plannedByTypeAndClassification.set(pair, (plannedByTypeAndClassification.get(pair) ?? 0) + 1);
      if (plannedClassification === "NEEDS_REVIEW") {
        const reason = planCard?.classification.classificationReason ?? "Unknown";
        const reasonGroup = reason.includes("no source artwork URL")
          ? "explicit special rarity but artwork URL missing"
          : reason.includes("Rarity is missing or unspecified")
            ? "rarity missing or unspecified"
            : reason.includes("category is missing") || reason.includes("category fields conflict")
              ? "category missing or conflicting"
              : "rarity/art evidence is ambiguous or unsupported";
        reviewReasonCounts.set(reasonGroup, (reviewReasonCounts.get(reasonGroup) ?? 0) + 1);
      }
      if (plannedType === "POKEMON" && INCLUDED.has(plannedClassification)) {
        const hadSameClassification = card.classification === plannedClassification;
        if (!hadSameClassification) {
          if (plannedClassification === "ILLUSTRATION_RARE") newIllustrationRare += 1;
          if (plannedClassification === "SPECIAL_ILLUSTRATION_RARE") newSpecialIllustrationRare += 1;
          if (plannedClassification === "ALTERNATE_ART") newAlternateArt += 1;
          if (plannedClassification === "FULL_ART") newFullArt += 1;
          if (plannedClassification === "SPECIAL_ART_PROMO") newSpecialArtPromo += 1;
        }
      }
      const sourceData = objectRecord(card.sourceData);
      const dexIds = numberArray(card.dexIds).length > 0 ? numberArray(card.dexIds) : numberArray(sourceData.dexId);
      const sourceCategory = typeof sourceData.category === "string" ? sourceData.category.toLowerCase() : "";
      const cardTypeSource = (card.category || sourceCategory).toLowerCase();
      const isTrainerCard = cardTypeSource === "trainer" || plannedType === "TRAINER";
      if (isTrainerCard && INCLUDED.has(card.classification) && (relationsByCard.get(cardId)?.size ?? 0) > 0) {
        currentIncludedTrainerCards.add(cardId);
        for (const dexId of relationsByCard.get(cardId) ?? []) {
          currentIncludedTrainerLinks.push({
            name: card.name,
            set: card.setName,
            sourceId: card.sourceId,
            rarity: card.rarity,
            pokemon: pokemon.find((item) => item.nationalDex === dexId)?.name ?? "Unknown Pokémon",
            nationalDex: dexId,
          });
        }
      }
      if ((relationsByCard.get(cardId)?.size ?? 0) > 1) currentMultipleRelationshipCards.add(cardId);
      const official = new Set(dexIds);
      const validRelations = [...(relationsByCard.get(cardId) ?? [])].filter(
        (nationalDex) => plannedType === "POKEMON" && official.has(nationalDex),
      );
      if (validRelations.length > 1) plannedVerifiedRelationCounts.set(cardId, validRelations.length);
    }

    const suspiciousLinks = links.flatMap((link) => {
      const cardId = String(link.card);
      const card = cardById.get(cardId);
      const linkedPokemon = pokemonById.get(String(link.pokemon));
      if (!card || !linkedPokemon) {
        return [{
          name: card?.name ?? "Missing card",
          sourceId: card?.sourceId ?? "missing",
          set: card?.setName ?? "",
          category: card?.category || "UNKNOWN",
          nationalDex: linkedPokemon?.nationalDex ?? null,
          pokemon: linkedPokemon?.name ?? "Missing Pokémon",
          sourceField: "legacy",
          reason: !card ? "Card record is missing." : "Pokémon record is missing.",
        }];
      }
      const planCard = planByCard.get(cardId);
      const sourceData = objectRecord(card.sourceData);
      const officialDexIds = numberArray(card.dexIds).length > 0
        ? numberArray(card.dexIds)
        : numberArray(sourceData.dexId);
      const isVerifiedSourceRelation = planCard?.classification.cardType === "POKEMON"
        && officialDexIds.includes(linkedPokemon.nationalDex);
      if (isVerifiedSourceRelation) return [];
      const cameoIds = numberArray(card.cameoDexIds).length > 0
        ? numberArray(card.cameoDexIds)
        : numberArray(sourceData.cameoDexIds);
      const cameo = cameoIds.includes(linkedPokemon.nationalDex);
      return [{
        name: card.name,
        sourceId: card.sourceId,
        set: card.setName,
        category: card.category || "UNKNOWN",
        nationalDex: linkedPokemon.nationalDex,
        pokemon: linkedPokemon.name,
        sourceField: cameo ? "tcgdex.cameoDexIds" : "legacy/unmatched",
        reason: planCard?.classification.cardType !== "POKEMON"
          ? `${planCard?.classification.cardType ?? "UNKNOWN"} source category is not eligible.`
          : cameo
            ? "cameoDexIds semantics are not documented; keep for review only."
            : "Relationship is absent from documented dexId values.",
      }];
    });

    const explicitRarityLabels = [...new Set(cards.map((card) => card.rarity).filter((rarity) =>
      /alternate|full art|illustration rare|art rare|special art|character (super )?rare/i.test(rarity ?? ""),
    ))].sort();
    const ambiguousArtCandidates = cards.filter((card) => {
      const planCard = planByCard.get(String(card._id));
      return planCard?.classification.cardType === "POKEMON"
        && planCard.classification.classification === "NEEDS_REVIEW"
        && /^(ultra rare|secret rare|promo)$/i.test(card.rarity ?? "");
    });
    const collectionHash = createHash("sha256").update(JSON.stringify(collectionItems)).digest("hex");
    const output = {
      database: mongoose.connection.db?.databaseName,
      mode: "read-only dry run; no MongoDB records modified",
      cards: {
        total: cards.length,
        byCardType: Object.fromEntries([...cardTypeCounts].sort(([a], [b]) => a.localeCompare(b))),
        currentClassification: Object.fromEntries([...currentClassificationCounts].sort(([a], [b]) => a.localeCompare(b))),
        plannedClassification: Object.fromEntries([...classificationCounts].sort(([a], [b]) => a.localeCompare(b))),
        plannedTypeAndClassification: Object.fromEntries([...plannedByTypeAndClassification].sort(([a], [b]) => a.localeCompare(b))),
        plannedNeedsReviewReasons: Object.fromEntries([...reviewReasonCounts].sort(([a], [b]) => a.localeCompare(b))),
        classificationValueChanges: plan.cards.filter((item) => item.classificationChanged).length,
        classificationEvidenceUpdates: plan.cards.filter((item) => item.metadataChanged).length,
        manualOverrides: overrides.length,
        storedCategoryMissing: cardsMissingStoredCategory,
        categoryRecoveredFromSourceData: cardsRecoveredCategoryFromSource,
        newlyIncludedArtCategories: {
          illustrationRare: newIllustrationRare,
          specialIllustrationRare: newSpecialIllustrationRare,
          alternateArt: newAlternateArt,
          fullArt: newFullArt,
          specialArtPromo: newSpecialArtPromo,
        },
        explicitSpecialArtRarityLabels: explicitRarityLabels,
        ambiguousUltraSecretPromoCardsForReview: ambiguousArtCandidates.length,
      },
      relationships: {
        currentTotal: links.length,
        currentUnsupported: suspiciousLinks.length,
        currentIncludedTrainerCards: currentIncludedTrainerCards.size,
        currentIncludedTrainerLinks: currentIncludedTrainerLinks.length,
        currentCardsAssociatedWithMultiplePokemon: currentMultipleRelationshipCards.size,
        plannedVerifiedMultiPokemonCards: plannedVerifiedRelationCounts.size,
        relationshipStatusUpdates: plan.relationshipUpdates.length,
        newVerifiedRelationships: plan.relationshipAdditions.length,
        examplesToReview: suspiciousLinks.slice(0, 15),
        trainerExamples: currentIncludedTrainerLinks.slice(0, 12),
      },
      safety: {
        collectionItems: collectionItems.length,
        collectionSnapshotSha256: collectionHash,
        duplicateCardLanguageSourceIdGroups: cardDuplicates,
        duplicateSetLanguageSourceIdGroups: setDuplicates,
        manualOverridesRemainSeparate: true,
        migrationDeletesCardsOrCollectionItems: false,
        migrationChangesCollectionItems: false,
      },
    };
    console.log(JSON.stringify(output, null, 2));
  } finally {
    await mongoose.disconnect();
  }
}

main().catch((error: unknown) => {
  console.error("Card integrity dry-run failed:", error);
  process.exitCode = 1;
});
