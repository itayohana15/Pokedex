import {
  applyClassificationOverride,
  classifyCard,
  getRelationshipReviewReason,
  getVerifiedDexIds,
  type CardClassification,
  type CardClassificationResult,
} from "./classification.js";

export interface IntegrityCardInput {
  id: string;
  category?: string;
  sourceCategory?: string;
  rarity?: string;
  image?: string;
  name?: string;
  setId?: string;
  setName?: string;
  localId?: string;
  dexIds?: number[];
  cameoDexIds?: number[];
  currentCardType?: string;
  currentClassification?: string;
  currentIsSpecialArt?: boolean;
  currentClassificationConfidence?: number;
  currentClassificationReason?: string;
  currentClassificationSource?: string;
  currentClassificationReviewed?: boolean;
  currentRelationshipStatus?: string;
  currentRelationshipReason?: string;
  manualOverride?: CardClassification;
}

export interface IntegrityLinkInput {
  cardId: string;
  pokemonDexId: number;
  currentVerificationStatus?: string;
  currentSourceField?: string;
  currentReviewReason?: string;
}

export interface IntegrityLinkUpdate {
  cardId: string;
  pokemonDexId: number;
  verificationStatus: "VERIFIED" | "NEEDS_REVIEW";
  sourceField: "tcgdex.dexId" | "tcgdex.cameoDexIds" | "legacy";
  reviewReason: string;
}

export interface IntegrityCardPlan {
  id: string;
  classification: CardClassificationResult;
  pokemonRelationshipStatus: "VERIFIED" | "NEEDS_REVIEW" | "NOT_APPLICABLE";
  pokemonRelationshipReason: string;
  classificationChanged: boolean;
  metadataChanged: boolean;
}

export interface CardIntegrityPlan {
  cards: IntegrityCardPlan[];
  relationshipUpdates: IntegrityLinkUpdate[];
  relationshipAdditions: IntegrityLinkUpdate[];
}

export function buildCardIntegrityPlan(
  cards: IntegrityCardInput[],
  links: IntegrityLinkInput[],
  localPokemonIds: Set<number>,
): CardIntegrityPlan {
  const cardsById = new Map<string, IntegrityCardInput>();
  const plans = new Map<string, IntegrityCardPlan>();
  for (const card of cards) {
    cardsById.set(card.id, card);
    const automatic = classifyCard({
      category: card.category,
      sourceCategory: card.sourceCategory,
      rarity: card.rarity,
      hasArtwork: Boolean(card.image),
      name: card.name,
      setId: card.setId,
      setName: card.setName,
      localId: card.localId,
    });
    const classification = card.manualOverride
      ? applyClassificationOverride(automatic, card.manualOverride)
      : automatic;
    const dexIds = card.dexIds ?? [];
    const cameoDexIds = card.cameoDexIds ?? [];
    const relationshipReason = getRelationshipReviewReason(
      classification.cardType,
      dexIds,
      cameoDexIds,
      localPokemonIds,
    ) ?? "";
    const relationshipStatus = classification.cardType !== "POKEMON"
      ? classification.cardType === "UNKNOWN" ? "NEEDS_REVIEW" : "NOT_APPLICABLE"
      : relationshipReason ? "NEEDS_REVIEW" : "VERIFIED";
    const classificationChanged = card.currentClassification !== classification.classification;
    const metadataChanged = card.currentCardType !== classification.cardType
      || card.currentIsSpecialArt !== classification.isSpecialArt
      || card.currentClassificationConfidence !== classification.classificationConfidence
      || card.currentClassificationReason !== classification.classificationReason
      || card.currentClassificationSource !== classification.classificationSource
      || card.currentClassificationReviewed !== classification.classificationReviewed
      || card.currentRelationshipStatus !== relationshipStatus
      || card.currentRelationshipReason !== relationshipReason;
    plans.set(card.id, {
      id: card.id,
      classification,
      pokemonRelationshipStatus: relationshipStatus,
      pokemonRelationshipReason: relationshipReason,
      classificationChanged,
      metadataChanged,
    });
  }

  const linksByKey = new Map<string, IntegrityLinkInput>();
  for (const link of links) linksByKey.set(`${link.cardId}:${link.pokemonDexId}`, link);

  const relationshipUpdates: IntegrityLinkUpdate[] = [];
  for (const link of links) {
    const card = cardsById.get(link.cardId);
    const cardPlan = plans.get(link.cardId);
    const officialDexIds = card && cardPlan
      ? getVerifiedDexIds(cardPlan.classification.cardType, card.dexIds ?? [])
      : [];
    const isDocumentedDexRelationship = Boolean(
      card
      && cardPlan?.classification.cardType === "POKEMON"
      && officialDexIds.includes(link.pokemonDexId)
      && localPokemonIds.has(link.pokemonDexId),
    );
    const sourceField = card?.dexIds?.includes(link.pokemonDexId)
      ? "tcgdex.dexId"
      : card?.cameoDexIds?.includes(link.pokemonDexId)
        ? "tcgdex.cameoDexIds"
        : "legacy";
    const reviewReason = isDocumentedDexRelationship
      ? ""
      : !card
        ? "Linked card does not exist in the source catalog."
        : !cardPlan || cardPlan.classification.cardType !== "POKEMON"
          ? `${cardPlan?.classification.cardType.toLocaleLowerCase() ?? "unknown"} cards cannot be linked to Pokémon pages.`
          : sourceField === "tcgdex.cameoDexIds"
            ? "Only cameoDexIds identify this Pokémon; TCGdex does not document them as primary Pokémon relationships."
            : "This relationship is not present in the card's documented TCGdex dexId values.";
    const update: IntegrityLinkUpdate = {
      cardId: link.cardId,
      pokemonDexId: link.pokemonDexId,
      verificationStatus: isDocumentedDexRelationship ? "VERIFIED" : "NEEDS_REVIEW",
      sourceField,
      reviewReason,
    };
    if (
      link.currentVerificationStatus !== update.verificationStatus
      || link.currentSourceField !== update.sourceField
      || link.currentReviewReason !== update.reviewReason
    ) relationshipUpdates.push(update);
  }

  const relationshipAdditions: IntegrityLinkUpdate[] = [];
  for (const card of cards) {
    const cardPlan = plans.get(card.id);
    if (!cardPlan || cardPlan.classification.cardType !== "POKEMON") continue;
    for (const pokemonDexId of getVerifiedDexIds(cardPlan.classification.cardType, card.dexIds ?? [])) {
      if (!localPokemonIds.has(pokemonDexId)) continue;
      if (linksByKey.has(`${card.id}:${pokemonDexId}`)) continue;
      relationshipAdditions.push({
        cardId: card.id,
        pokemonDexId,
        verificationStatus: "VERIFIED",
        sourceField: "tcgdex.dexId",
        reviewReason: "",
      });
    }
  }

  return {
    cards: [...plans.values()],
    relationshipUpdates,
    relationshipAdditions,
  };
}
