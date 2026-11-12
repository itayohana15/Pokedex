export type ClassificationReviewReason =
  | "rarity_missing"
  | "rarity_ambiguous"
  | "alternate_art_possible"
  | "full_art_possible"
  | "special_promo_possible"
  | "metadata_missing"
  | "image_missing"
  | "source_insufficient";

export interface ClassificationReviewCard {
  _id?: unknown;
  sourceId?: string;
  name?: string;
  image?: string;
  setId?: string;
  setName?: string;
  localId?: string;
  rarity?: string;
  language?: string;
  category?: string;
  cardType?: string;
  artist?: string;
  variants?: unknown;
  dexIds?: number[];
  classification?: string;
  classificationReason?: string;
  classificationConfidence?: number;
  sourceUpdatedAt?: Date | string | null;
  syncedAt?: Date | string | null;
  sourceData?: unknown;
}

export interface ClassificationReviewEvidenceField {
  field: string;
  value: unknown;
  source: "TCGdex";
  sourceId: string;
  sourceUrl: string;
  checkedAt: string | null;
  sourceUpdatedAt: string | null;
  confidence: "direct-source-field";
  note?: string;
}

export function recordOf(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function hasText(value: unknown): boolean {
  return text(value).length > 0;
}

function validUrl(value: unknown): boolean {
  if (typeof value !== "string") return false;
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

function sourceCategory(card: ClassificationReviewCard): string {
  return text(card.category) || text(recordOf(card.sourceData).category);
}

function sourceRarity(card: ClassificationReviewCard): string {
  return text(card.rarity) || text(recordOf(card.sourceData).rarity);
}

function sourceImage(card: ClassificationReviewCard): string {
  return text(card.image) || text(recordOf(card.sourceData).image);
}

export function getReviewMetadataCompleteness(card: ClassificationReviewCard) {
  const source = recordOf(card.sourceData);
  const sourceSet = recordOf(source.set);
  const sourceId = text(card.sourceId) || text(source.id);
  const fields = [
    { field: "cardName", present: hasText(card.name) || hasText(source.name) },
    { field: "setId", present: hasText(card.setId) || hasText(sourceSet.id) },
    { field: "setName", present: hasText(card.setName) || hasText(sourceSet.name) },
    { field: "localId", present: hasText(card.localId) || hasText(source.localId) },
    { field: "language", present: hasText(card.language) },
    { field: "category", present: hasText(sourceCategory(card)) },
    { field: "rarity", present: hasText(sourceRarity(card)) && !/^(none|unknown)$/i.test(sourceRarity(card)) },
    { field: "sourceId", present: sourceId.length > 0 },
  ];
  const present = fields.filter((field) => field.present).length;
  return {
    score: Math.round((present / fields.length) * 100),
    present,
    total: fields.length,
    missingFields: fields.filter((field) => !field.present).map((field) => field.field),
  };
}

export function getReviewReasonGroups(card: ClassificationReviewCard): ClassificationReviewReason[] {
  const groups: ClassificationReviewReason[] = [];
  const rarity = sourceRarity(card);
  const rarityUnknown = !rarity || /^(none|unknown)$/i.test(rarity);
  const rarityLower = rarity.toLocaleLowerCase();
  const name = (text(card.name) || text(recordOf(card.sourceData).name)).toLocaleLowerCase();
  const variants = recordOf(card.variants);
  const sourceVariants = recordOf(recordOf(card.sourceData).variants);
  const metadata = getReviewMetadataCompleteness(card);

  if (rarityUnknown) groups.push("rarity_missing");
  if (/alternate\s*art|alt\s*art/.test(`${rarityLower} ${name}`)) groups.push("alternate_art_possible");
  if (/full\s*art/.test(`${rarityLower} ${name}`)) groups.push("full_art_possible");
  if (/promo/.test(rarityLower) || variants.wPromo === true || sourceVariants.wPromo === true) {
    groups.push("special_promo_possible");
  }
  if (!rarityUnknown && !groups.includes("alternate_art_possible")
    && !groups.includes("full_art_possible") && !groups.includes("special_promo_possible")) {
    groups.push("rarity_ambiguous");
  }
  if (metadata.missingFields.length > 0) groups.push("metadata_missing");
  if (!validUrl(card.image)) groups.push("image_missing");
  // These records are in NEEDS_REVIEW precisely because source metadata has not
  // established Special Art eligibility. This is a review flag, never an action.
  groups.push("source_insufficient");
  return groups;
}

export function getPrimaryReviewReason(card: ClassificationReviewCard): ClassificationReviewReason {
  const groups = getReviewReasonGroups(card);
  const priority: ClassificationReviewReason[] = [
    "rarity_missing",
    "metadata_missing",
    "alternate_art_possible",
    "full_art_possible",
    "special_promo_possible",
    "rarity_ambiguous",
    "source_insufficient",
  ];
  return priority.find((reason) => groups.includes(reason)) ?? "source_insufficient";
}

function isoDate(value: unknown): string | null {
  if (value instanceof Date && Number.isFinite(value.getTime())) return value.toISOString();
  if (typeof value === "string" && Number.isFinite(Date.parse(value))) return new Date(value).toISOString();
  return null;
}

export function getTcgDexCardSourceUrl(card: ClassificationReviewCard): string | null {
  const language = text(card.language);
  const sourceId = text(card.sourceId) || (text(card.setId) && text(card.localId) ? `${text(card.setId)}-${text(card.localId)}` : "");
  return language && sourceId
    ? `https://api.tcgdex.net/v2/${encodeURIComponent(language)}/cards/${encodeURIComponent(sourceId)}`
    : null;
}

export function buildClassificationEvidence(card: ClassificationReviewCard): ClassificationReviewEvidenceField[] {
  const sourceId = text(card.sourceId) || `${text(card.setId)}-${text(card.localId)}`;
  const sourceUrl = getTcgDexCardSourceUrl(card);
  if (!sourceId || !sourceUrl) return [];
  const source = recordOf(card.sourceData);
  const sourceSet = recordOf(source.set);
  const checkedAt = isoDate(card.syncedAt);
  const sourceUpdatedAt = isoDate(card.sourceUpdatedAt) ?? isoDate(source.updated);
  const values: Array<{ field: string; value: unknown; note?: string }> = [
    { field: "cardName", value: text(card.name) || source.name },
    { field: "setId", value: text(card.setId) || sourceSet.id },
    { field: "setName", value: text(card.setName) || sourceSet.name },
    { field: "localId", value: text(card.localId) || source.localId },
    { field: "language", value: text(card.language) },
    { field: "category", value: text(card.category) || source.category },
    { field: "rarity", value: text(card.rarity) || source.rarity },
    { field: "artist", value: text(card.artist) || source.illustrator },
    { field: "image", value: validUrl(card.image) ? card.image : source.image, note: "Image availability does not prove Special Art eligibility." },
    { field: "variants", value: card.variants ?? source.variants },
    { field: "dexIds", value: card.dexIds?.length ? card.dexIds : source.dexId },
  ];
  return values.filter((entry) => entry.value !== undefined && entry.value !== null && entry.value !== "")
    .map((entry) => ({
      ...entry,
      source: "TCGdex" as const,
      sourceId,
      sourceUrl,
      checkedAt,
      sourceUpdatedAt,
      confidence: "direct-source-field" as const,
    }));
}

export function getReviewEvidenceCompleteness(card: ClassificationReviewCard): number {
  return buildClassificationEvidence(card).length;
}

export function summarizeClassificationReview(cards: ClassificationReviewCard[]) {
  const groups: Record<ClassificationReviewReason, number> = {
    rarity_missing: 0,
    rarity_ambiguous: 0,
    alternate_art_possible: 0,
    full_art_possible: 0,
    special_promo_possible: 0,
    metadata_missing: 0,
    image_missing: 0,
    source_insufficient: 0,
  };
  const primaryReasons: Record<ClassificationReviewReason, number> = { ...groups };
  const byLanguage: Record<string, number> = {};
  const bySet: Record<string, { setId: string; setName: string; language: string; count: number }> = {};
  const byRarity: Record<string, number> = {};
  const byCategory: Record<string, number> = {};
  let imageUrlCount = 0;
  let completeMetadataCount = 0;
  let confidenceTotal = 0;

  for (const card of cards) {
    const cardGroups = getReviewReasonGroups(card);
    for (const group of cardGroups) groups[group] += 1;
    primaryReasons[getPrimaryReviewReason(card)] += 1;
    const language = text(card.language) || "(missing)";
    byLanguage[language] = (byLanguage[language] ?? 0) + 1;
    const setKey = `${text(card.language)}|${text(card.setId)}`;
    const setEntry = bySet[setKey] ?? { setId: text(card.setId), setName: text(card.setName), language, count: 0 };
    setEntry.count += 1;
    bySet[setKey] = setEntry;
    const rarity = sourceRarity(card) || "(missing)";
    byRarity[rarity] = (byRarity[rarity] ?? 0) + 1;
    const category = sourceCategory(card) || "(missing)";
    byCategory[category] = (byCategory[category] ?? 0) + 1;
    if (validUrl(sourceImage(card))) imageUrlCount += 1;
    if (getReviewMetadataCompleteness(card).missingFields.length === 0) completeMetadataCount += 1;
    confidenceTotal += Number.isFinite(card.classificationConfidence) ? Number(card.classificationConfidence) : 0;
  }

  return {
    total: cards.length,
    imageUrlCount,
    imageUrlMissing: cards.length - imageUrlCount,
    completeMetadataCount,
    incompleteMetadataCount: cards.length - completeMetadataCount,
    averageClassificationConfidence: cards.length ? Math.round(confidenceTotal / cards.length) : 0,
    reasonGroupCounts: groups,
    primaryReasonCounts: primaryReasons,
    byLanguage,
    bySet: Object.values(bySet).sort((left, right) => left.setName.localeCompare(right.setName) || left.language.localeCompare(right.language)),
    byRarity,
    byCategory,
    note: "Reason groups overlap; image/source-insufficient flags are cross-cutting. No review action is inferred from these groups.",
  };
}
