export type CardClassification =
  | "ILLUSTRATION_RARE"
  | "SPECIAL_ILLUSTRATION_RARE"
  | "ALTERNATE_ART"
  | "FULL_ART"
  | "BLACK_WHITE_RARE"
  | "AMAZING_RARE"
  | "GALLERY_ART"
  | "V_SPECIAL_ART"
  | "VMAX_SPECIAL_ART"
  | "VSTAR_SPECIAL_ART"
  | "SPECIAL_ART_PROMO"
  | "EXCLUDED"
  | "NEEDS_REVIEW";

export type CardType = "POKEMON" | "TRAINER" | "ENERGY" | "OTHER" | "UNKNOWN";
export type RelationshipStatus = "VERIFIED" | "NEEDS_REVIEW" | "NOT_APPLICABLE";
export type SpecialArtDecisionStatus = "CONFIRMED_SPECIAL_ART" | "NEEDS_REVIEW" | "NOT_SPECIAL_ART";

export const SPECIAL_ART_CATEGORIES: CardClassification[] = [
  "ILLUSTRATION_RARE",
  "SPECIAL_ILLUSTRATION_RARE",
  "ALTERNATE_ART",
  "FULL_ART",
  "BLACK_WHITE_RARE",
  "AMAZING_RARE",
  "GALLERY_ART",
  "V_SPECIAL_ART",
  "VMAX_SPECIAL_ART",
  "VSTAR_SPECIAL_ART",
  "SPECIAL_ART_PROMO",
];

export interface CardClassificationResult {
  cardType: CardType;
  classification: CardClassification;
  isSpecialArt: boolean;
  classificationConfidence: number;
  classificationReason: string;
  classificationSource: "tcgdex" | "manual";
  classificationReviewed: boolean;
}

export interface CardClassificationInput {
  category?: string | null;
  sourceCategory?: string | null;
  rarity?: string | null;
  hasArtwork?: boolean;
  name?: string | null;
  setId?: string | null;
  setName?: string | null;
  localId?: string | null;
}

function normalizeLabel(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLocaleLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function cardTypeFromCategory(category: string | null | undefined): CardType {
  switch (normalizeLabel(category ?? "")) {
    case "pokemon":
      return "POKEMON";
    case "trainer":
      return "TRAINER";
    case "energy":
      return "ENERGY";
    case "unknown":
      return "UNKNOWN";
    case "other":
      return "OTHER";
    case "":
      return "UNKNOWN";
    default:
      return "OTHER";
  }
}

function result(
  cardType: CardType,
  classification: CardClassification,
  classificationConfidence: number,
  classificationReason: string,
  classificationSource: CardClassificationResult["classificationSource"] = "tcgdex",
  classificationReviewed = false,
): CardClassificationResult {
  return {
    cardType,
    classification,
    isSpecialArt: SPECIAL_ART_CATEGORIES.includes(classification),
    classificationConfidence,
    classificationReason,
    classificationSource,
    classificationReviewed,
  };
}

function hasLabel(label: string, aliases: string[]): boolean {
  return aliases.some((alias) =>
    label === alias || (alias.includes(" ") && label.includes(alias)),
  );
}

export function classifyCard(input: CardClassificationInput): CardClassificationResult {
  const category = cardTypeFromCategory(input.category);
  const sourceCategory = input.sourceCategory === undefined
    ? category
    : cardTypeFromCategory(input.sourceCategory);
  const cardType = category === sourceCategory ? category : "UNKNOWN";

  if (cardType === "UNKNOWN") {
    return result(
      cardType,
      "NEEDS_REVIEW",
      0,
      category !== sourceCategory
        ? "TCGdex category fields conflict or do not identify a supported card type."
        : "TCGdex card category is missing; Pokémon eligibility cannot be established.",
    );
  }
  if (cardType !== "POKEMON") {
    return result(cardType, "EXCLUDED", 100, `${cardType.toLocaleLowerCase()} cards are not Pokémon collectibles.`);
  }

  const rarity = normalizeLabel(input.rarity ?? "");
  const isGalleryCard = input.setId?.toLocaleLowerCase() === "swsh12.5gg"
    && /^gg\d+$/i.test(input.localId?.trim() ?? "");
  const cardName = normalizeLabel(input.name ?? "");
  let classification: CardClassification | null = null;
  if (isGalleryCard && /\bvstar\b/.test(cardName)) {
    classification = "VSTAR_SPECIAL_ART";
  } else if (isGalleryCard && /\bvmax\b/.test(cardName)) {
    classification = "VMAX_SPECIAL_ART";
  } else if (isGalleryCard && /\bv\b/.test(cardName)) {
    classification = "V_SPECIAL_ART";
  } else if (isGalleryCard) {
    classification = "GALLERY_ART";
  } else if (hasLabel(rarity, ["amazing rare"])) {
    classification = "AMAZING_RARE";
  } else if (hasLabel(rarity, ["black white rare", "black and white rare"])) {
    classification = "BLACK_WHITE_RARE";
  } else if (hasLabel(rarity, ["special art promo", "special art rare promo"])) {
    classification = "SPECIAL_ART_PROMO";
  } else if (hasLabel(rarity, ["special illustration rare", "special art rare", "sir", "sar", "character super rare", "csr"])) {
    classification = "SPECIAL_ILLUSTRATION_RARE";
  } else if (hasLabel(rarity, ["illustration rare", "art rare", "ir", "ar", "character rare", "chr"])) {
    classification = "ILLUSTRATION_RARE";
  } else if (hasLabel(rarity, ["alternate art", "alt art"])) {
    classification = "ALTERNATE_ART";
  }

  if (classification) {
    return result(
      cardType,
      classification,
      95,
      isGalleryCard
        ? `TCGdex set ID ${input.setId} and gallery card number ${input.localId} identify a Pokémon Gallery printing; card name supports ${classification}.`
        : `TCGdex card category is Pokémon and the explicit source rarity "${input.rarity?.trim()}" supports ${classification}.`,
    );
  }

  if (!rarity || rarity === "none" || rarity === "unknown") {
    return result(cardType, "NEEDS_REVIEW", 0, "Rarity is missing or unspecified; special-art eligibility is unknown.");
  }

  if (hasLabel(rarity, ["full art", "full art promo"])) {
    return result(
      cardType,
      "NEEDS_REVIEW",
      35,
      `TCGdex rarity "${input.rarity?.trim()}" alone does not establish whether this Full Art Pokémon belongs in the Special Art collection.`,
    );
  }

  const ordinaryRarities = new Set([
    "common",
    "uncommon",
    "rare",
    "double rare",
    "triple rare",
    "holo rare",
    "holo rare ex",
    "holo rare v",
    "holo rare vmax",
    "holo rare vstar",
    "rare holo",
    "rare holo ex",
    "rare holo lv x",
    "rare prime",
    "legend",
  ]);
  if (ordinaryRarities.has(rarity)) {
    return result(
      cardType,
      "EXCLUDED",
      90,
      `TCGdex rarity "${input.rarity?.trim()}" has no explicit special-art designation.`,
    );
  }

  return result(
    cardType,
    "NEEDS_REVIEW",
    20,
    `TCGdex rarity "${input.rarity?.trim()}" does not establish whether this card is special art; manual review is required.`,
  );
}

export function applyClassificationOverride(
  automatic: CardClassificationResult,
  classification: CardClassification,
): CardClassificationResult {
  if (automatic.cardType !== "POKEMON" && classification !== "EXCLUDED") {
    return result(
      automatic.cardType,
      automatic.cardType === "UNKNOWN" ? "NEEDS_REVIEW" : "EXCLUDED",
      100,
      "Manual Special Art overrides cannot include cards that are not verified Pokémon cards.",
      "manual",
      true,
    );
  }
  return result(
    automatic.cardType,
    classification,
    100,
    `Manual classification override: ${classification}.`,
    "manual",
    true,
  );
}

export function getSpecialArtDecisionStatus(
  cardType: CardType,
  classification: CardClassification,
): SpecialArtDecisionStatus {
  if (cardType !== "POKEMON" || classification === "EXCLUDED") return "NOT_SPECIAL_ART";
  if (classification === "NEEDS_REVIEW") return "NEEDS_REVIEW";
  return SPECIAL_ART_CATEGORIES.includes(classification) ? "CONFIRMED_SPECIAL_ART" : "NEEDS_REVIEW";
}

export function getVerifiedDexIds(cardType: CardType, dexIds: number[]): number[] {
  if (cardType !== "POKEMON") return [];
  return [...new Set(dexIds.filter((id) => Number.isInteger(id) && id > 0))];
}

export function getRelationshipReviewReason(
  cardType: CardType,
  dexIds: number[],
  cameoDexIds: number[],
  knownPokemonIds: Set<number>,
): string | null {
  if (cardType !== "POKEMON") return `${cardType.toLocaleLowerCase()} cards cannot be linked to Pokémon pages.`;
  const verifiedIds = getVerifiedDexIds(cardType, dexIds);
  const missingPokemon = verifiedIds.filter((id) => !knownPokemonIds.has(id));
  if (missingPokemon.length > 0) {
    return `TCGdex dexId values are missing from the local Pokédex: ${missingPokemon.join(", ")}.`;
  }
  if (verifiedIds.length > 0) return null;
  if (cameoDexIds.length > 0) {
    return "Only cameoDexIds are present; TCGdex does not document these as primary Pokémon relationships.";
  }
  return "TCGdex provides no verified dexId relationship for this card.";
}
