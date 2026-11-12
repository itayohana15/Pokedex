import { Router, type NextFunction, type Request, type Response } from "express";
import mongoose from "mongoose";
import {
  cardNumberVariants,
  collectrRecordIdentity,
  collectrRecordKey,
  collectrRecordKeyVariants,
  matchingLanguages,
  matchesRecordLanguage,
  normalizeCardName,
  normalizeCardNumber,
  normalizeRarity,
  recordLanguageOptions,
  recordLanguageMatches,
} from "./cardMatching.js";
import { classifyCard, SPECIAL_ART_CATEGORIES, type CardType } from "./classification.js";
import {
  buildClassificationEvidence,
  getPrimaryReviewReason,
  getReviewEvidenceCompleteness,
  getReviewMetadataCompleteness,
  getReviewReasonGroups,
  getTcgDexCardSourceUrl,
  recordOf,
  summarizeClassificationReview,
  type ClassificationReviewCard,
} from "./classificationReview.js";
import { buildCatalogCoverageReport } from "./catalogCoverageReport.js";
import { verifiedReviewImageCandidate, verifiedReviewImageCandidates } from "./visualReviewImageSources.js";
import { parseCollectrText, type CollectrRecord } from "./collectr.js";
import { runSync, runTcgDexSync, TCGDEX_LANGUAGES } from "./integrations.js";
import {
  Card,
  CardClassificationOverride,
  CardReviewAction,
  CollectionItem,
  CollectrMatchOverride,
  ImportHistory,
  Pokemon,
  PokemonCard,
  Set as CardSet,
  SyncStatus,
  UserSettings,
} from "./models.js";

const router = Router();
const INCLUDED: readonly string[] = SPECIAL_ART_CATEGORIES;
export const DISPLAY_CARD_LANGUAGES = ["en", "ja", "zh-cn", "zh-tw"] as const;
const displayLanguageSet = new Set<string>(DISPLAY_CARD_LANGUAGES);
const POKEMON_CARD_TYPE_FILTER = {
  $or: [
    { cardType: "POKEMON" },
    {
      cardType: { $exists: false },
      category: "Pokemon",
      $or: [{ "sourceData.category": { $exists: false } }, { "sourceData.category": "Pokemon" }],
    },
    {
      cardType: { $exists: false },
      category: { $in: ["", null] },
      "sourceData.category": "Pokemon",
    },
  ],
};
const POKEMON_SPECIAL_CARD_FILTER = {
  $and: [
    POKEMON_CARD_TYPE_FILTER,
    { classification: { $in: INCLUDED } },
    { language: { $in: DISPLAY_CARD_LANGUAGES } },
  ],
};

function isDisplayCardLanguage(language: unknown): language is typeof DISPLAY_CARD_LANGUAGES[number] {
  return typeof language === "string" && displayLanguageSet.has(language);
}

function displaySyncStatus<T extends Record<string, unknown> | null | undefined>(status: T): T {
  if (!status) return status;
  const result = { ...status };
  const localeProgress = result.localeProgress;
  if (isObjectRecord(localeProgress)) {
    result.localeProgress = Object.fromEntries(
      Object.entries(localeProgress).filter(([language]) => isDisplayCardLanguage(language)),
    );
  }
  if (result.currentSetLanguage && !isDisplayCardLanguage(result.currentSetLanguage)) {
    delete result.currentSetLanguage;
    delete result.currentSetId;
    delete result.currentSetName;
  }
  return result as T;
}

function displaySafeFilters(filters: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(filters).map(([scope, value]) => {
    if (!isObjectRecord(value) || typeof value.language !== "string" || value.language === "") {
      return [scope, value];
    }
    return [scope, isDisplayCardLanguage(value.language) ? value : { ...value, language: "" }];
  }));
}

function sourceDataOf(card: { sourceData?: unknown }): Record<string, unknown> {
  return isObjectRecord(card.sourceData) ? card.sourceData : {};
}

function numberArray(value: unknown): number[] {
  return Array.isArray(value)
    ? value.filter((id): id is number => typeof id === "number" && Number.isInteger(id) && id > 0)
    : [];
}

function isCardType(value: string): value is CardType {
  return ["POKEMON", "TRAINER", "ENERGY", "OTHER", "UNKNOWN"].includes(value);
}

function verifiedDexIdsOf(card: { dexIds?: number[]; sourceData?: unknown }): number[] {
  const sourceDexIds = numberArray(sourceDataOf(card).dexId);
  const values = Array.isArray(card.dexIds) && card.dexIds.length > 0 ? card.dexIds : sourceDexIds;
  return [...new Set(values.filter((id) => Number.isInteger(id) && id > 0))];
}

function sourceCardType(
  card: { cardType?: string; category?: string; rarity?: string; image?: string; sourceData?: unknown },
): CardType {
  const sourceCategory = sourceDataOf(card).category;
  const category = card.category?.trim() || (typeof sourceCategory === "string" ? sourceCategory : undefined);
  const inferredType = classifyCard({
    category,
    sourceCategory: typeof sourceCategory === "string" ? sourceCategory : category,
    rarity: card.rarity,
    hasArtwork: Boolean(card.image),
  }).cardType;
  return card.cardType && card.cardType !== "UNKNOWN" && isCardType(card.cardType)
    ? card.cardType
    : inferredType;
}

type ReviewSnapshot = {
  cards: Array<Record<string, unknown> & { _id: mongoose.Types.ObjectId }>;
  actionsByCard: Map<string, Array<Record<string, unknown>>>;
  latestActionByCard: Map<string, Record<string, unknown>>;
};

let reviewSnapshotCache: { expiresAt: number; value: ReviewSnapshot } | null = null;
let reviewSnapshotPending: Promise<ReviewSnapshot> | null = null;

export function invalidateReviewSnapshot(): void {
  reviewSnapshotCache = null;
  reviewSnapshotPending = null;
}

async function loadReviewSnapshot(): Promise<ReviewSnapshot> {
  if (reviewSnapshotCache && reviewSnapshotCache.expiresAt > Date.now()) return reviewSnapshotCache.value;
  if (reviewSnapshotPending) return reviewSnapshotPending;
  reviewSnapshotPending = (async () => {
    const cards = await Card.find({ classification: "NEEDS_REVIEW", language: { $in: DISPLAY_CARD_LANGUAGES } })
      .select("sourceId name image setId setName localId rarity language category cardType artist variants dexIds classification classificationReason classificationConfidence classificationSource classificationReviewed sourceUpdatedAt syncedAt sourceData.category sourceData.set sourceData.variants sourceData.updated sourceData.illustrator sourceData.image sourceData.dexId")
      .lean();
    const actions = cards.length === 0 ? [] : await CardReviewAction.find({ card: { $in: cards.map((card) => card._id) } })
      .sort({ createdAt: -1 })
      .lean();
    const actionsByCard = new Map<string, Array<Record<string, unknown>>>();
    const latestActionByCard = new Map<string, Record<string, unknown>>();
    for (const action of actions) {
      const key = String(action.card);
      const existing = actionsByCard.get(key) ?? [];
      existing.push(action as unknown as Record<string, unknown>);
      actionsByCard.set(key, existing);
      if (!latestActionByCard.has(key)) latestActionByCard.set(key, action as unknown as Record<string, unknown>);
    }
    const value = {
      cards: cards as unknown as ReviewSnapshot["cards"],
      actionsByCard,
      latestActionByCard,
    };
    reviewSnapshotCache = { expiresAt: Date.now() + 30_000, value };
    return value;
  })();
  try {
    return await reviewSnapshotPending;
  } finally {
    reviewSnapshotPending = null;
  }
}

function reviewSourceCategory(card: Record<string, unknown>): string {
  return typeof card.category === "string" && card.category.trim()
    ? card.category.trim()
    : typeof recordOf(card.sourceData).category === "string"
      ? String(recordOf(card.sourceData).category)
      : "";
}

function reviewCardResponse(
  card: Record<string, unknown>,
  actions: Array<Record<string, unknown>>,
  extra: Record<string, unknown> = {},
): Record<string, unknown> {
  const reviewCard = card as unknown as ClassificationReviewCard;
  const sourceData = recordOf(card.sourceData);
  return {
    _id: String(card._id),
    sourceId: card.sourceId,
    name: card.name,
    image: card.image || sourceData.image || "",
    setId: card.setId,
    setName: card.setName,
    localId: card.localId,
    rarity: card.rarity || sourceData.rarity || "",
    language: card.language,
    category: reviewSourceCategory(card),
    cardType: sourceCardType(card as unknown as { cardType?: string; category?: string; rarity?: string; image?: string; sourceData?: unknown }),
    artist: card.artist || sourceData.illustrator || "",
    variants: card.variants ?? sourceData.variants ?? {},
    dexIds: verifiedDexIdsOf(card as unknown as { dexIds?: number[]; sourceData?: unknown }),
    classificationReason: card.classificationReason || "",
    classificationConfidence: Number(card.classificationConfidence ?? 0),
    classificationSource: card.classificationSource || "tcgdex",
    reasonGroups: getReviewReasonGroups(reviewCard),
    primaryReason: getPrimaryReviewReason(reviewCard),
    metadataCompleteness: getReviewMetadataCompleteness(reviewCard),
    evidenceCount: getReviewEvidenceCompleteness(reviewCard),
    evidence: buildClassificationEvidence(reviewCard),
    sourceUrl: getTcgDexCardSourceUrl(reviewCard),
    reviewHistory: actions.map((action) => ({
      action: action.action,
      classification: action.classification ?? null,
      note: action.note ?? "",
      actor: action.actor ?? "local user",
      applied: action.applied !== false,
      createdAt: action.createdAt,
    })),
    ...extra,
  };
}

function visualPromoCard(card: Record<string, unknown>): boolean {
  const sourceData = recordOf(card.sourceData);
  const rarity = String(card.rarity ?? sourceData.rarity ?? "").trim();
  const category = reviewSourceCategory(card).toLocaleLowerCase();
  return isDisplayCardLanguage(card.language)
    && /^promo$/i.test(rarity)
    && category === "pokemon"
    && sourceCardType(card as { cardType?: string; category?: string; rarity?: string; image?: string; sourceData?: unknown }) === "POKEMON";
}

function visualReviewDecision(action: Record<string, unknown> | undefined): "UNDECIDED" | "CONFIRMED" | "REJECTED" {
  if (action?.action === "CONFIRM_SPECIAL_ART") return "CONFIRMED";
  if (action?.action === "MARK_NOT_SPECIAL_ART") return "REJECTED";
  return "UNDECIDED";
}

async function loadVisualPromoSnapshot(): Promise<{
  cards: Array<Record<string, unknown> & { _id: mongoose.Types.ObjectId }>;
  actionsByCard: Map<string, Array<Record<string, unknown>>>;
  latestActionByCard: Map<string, Record<string, unknown>>;
}> {
  const reviewedIds = await CardReviewAction.distinct("card");
  const cards = await Card.find({
    language: { $in: DISPLAY_CARD_LANGUAGES },
    $and: [
      { $or: [{ rarity: /^promo$/i }, { "sourceData.rarity": /^promo$/i }] },
      { $or: [{ category: "Pokemon" }, { "sourceData.category": "Pokemon" }, { cardType: "POKEMON" }] },
      { $or: [{ classification: "NEEDS_REVIEW" }, { _id: { $in: reviewedIds } }] },
    ],
  }).select("sourceId name image setId setName localId rarity language category cardType artist variants dexIds classification classificationReason classificationConfidence classificationSource classificationReviewed sourceUpdatedAt syncedAt sourceData.category sourceData.rarity sourceData.variants sourceData.updated sourceData.illustrator sourceData.image sourceData.dexId").lean();
  const eligibleCards = cards.filter((card) => visualPromoCard(card as unknown as Record<string, unknown>)) as unknown as Array<Record<string, unknown> & { _id: mongoose.Types.ObjectId }>;
  const actions = eligibleCards.length === 0 ? [] : await CardReviewAction.find({ card: { $in: eligibleCards.map((card) => card._id) } })
    .sort({ createdAt: -1, _id: -1 })
    .lean();
  const actionsByCard = new Map<string, Array<Record<string, unknown>>>();
  const latestActionByCard = new Map<string, Record<string, unknown>>();
  for (const action of actions) {
    const key = String(action.card);
    const existing = actionsByCard.get(key) ?? [];
    existing.push(action as unknown as Record<string, unknown>);
    actionsByCard.set(key, existing);
    if (!latestActionByCard.has(key)) latestActionByCard.set(key, action as unknown as Record<string, unknown>);
  }
  return { cards: eligibleCards, actionsByCard, latestActionByCard };
}

const CLASSIFICATION_REVIEW_REASONS = [
  "rarity_missing", "rarity_ambiguous", "alternate_art_possible", "full_art_possible",
  "special_promo_possible", "metadata_missing", "image_missing", "source_insufficient",
] as const;

function reviewQueryString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function reviewImageAvailable(card: ClassificationReviewCard): boolean {
  const image = typeof card.image === "string" ? card.image : recordOf(card.sourceData).image;
  if (typeof image !== "string") return false;
  try {
    const url = new URL(image);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}

function latestReviewAction(snapshot: ReviewSnapshot, cardId: unknown): Record<string, unknown> | undefined {
  return snapshot.latestActionByCard.get(String(cardId));
}

function reviewActionHistory(snapshot: ReviewSnapshot, cardId: unknown): Array<Record<string, unknown>> {
  return snapshot.actionsByCard.get(String(cardId)) ?? [];
}

async function recordClassificationReviewAction(
  card: mongoose.HydratedDocument<unknown> & Record<string, unknown>,
  action: "CONFIRM_SPECIAL_ART" | "MARK_NOT_SPECIAL_ART" | "KEEP_NEEDS_REVIEW" | "SKIP",
  classification?: string,
  note = "",
  previousClassification?: string,
): Promise<void> {
  const evidence = buildClassificationEvidence(card.toObject() as unknown as ClassificationReviewCard);
  await CardReviewAction.create({
    card: card._id,
    action,
    ...(classification ? { classification } : {}),
    previousClassification: previousClassification ?? String(card.classification ?? ""),
    resultingClassification: String(card.classification ?? ""),
    evidence,
    sourceId: String(card.sourceId ?? ""),
    sourceUrl: getTcgDexCardSourceUrl(card.toObject() as unknown as ClassificationReviewCard) ?? "",
    note: note.slice(0, 1000),
  });
}

function isEligiblePokemonCard(
  card: { cardType?: string; category?: string; rarity?: string; image?: string; classification?: string; sourceData?: unknown; language?: string },
): boolean {
  return sourceCardType(card) === "POKEMON"
    && INCLUDED.includes(card.classification ?? "")
    && isDisplayCardLanguage(card.language);
}

function collectrCandidateEligibilityReason(
  card: { cardType?: string; category?: string; rarity?: string; image?: string; classification?: string; sourceData?: unknown; language?: string },
  language?: string | Pick<CollectrRecord, "language" | "languageCandidates">,
): string | null {
  const cardType = sourceCardType(card);
  if (cardType === "TRAINER" || cardType === "ENERGY") return "Not a Pokémon card; Trainer and Energy cards cannot be imported.";
  if (cardType !== "POKEMON") return "Card type is unknown and requires review.";
  if (!isDisplayCardLanguage(card.language)) return `Unsupported language ${card.language}; only ${DISPLAY_CARD_LANGUAGES.join(", ")} can be imported.`;
  if (card.classification === "NEEDS_REVIEW") return "Special Art classification needs review before import.";
  if (!INCLUDED.includes(card.classification ?? "")) return "Card is not classified as eligible Pokémon Special Art.";
  if (language && !(typeof language === "string"
    ? recordLanguageMatches(language, card.language ?? "")
    : matchesRecordLanguage(language, card.language ?? ""))) {
    return "Language does not match the Collectr printing.";
  }
  return null;
}

function cardCountValue(set: { cardCount?: unknown }, key: "official" | "total"): number | undefined {
  const counts = set.cardCount;
  if (!isObjectRecord(counts)) return undefined;
  const value = counts[key];
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function normalizedLocalIdNumber(value: string): number | undefined {
  const localId = value.split("/")[0]?.trim().replace(/^0+(?=\d)/, "") ?? "";
  if (!/^\d+$/.test(localId)) return undefined;
  const parsed = Number(localId);
  return Number.isSafeInteger(parsed) ? parsed : undefined;
}

async function findVerifiedPokemonCardLinks(filter: Record<string, unknown>) {
  const links = await PokemonCard.find(filter).select("pokemon card verificationStatus").lean();
  if (links.length === 0) return links;
  const [cards, pokemon] = await Promise.all([
    Card.find({ _id: { $in: links.map((link) => link.card) } })
      .select("_id cardType category rarity image dexIds sourceData")
      .lean(),
    Pokemon.find({ _id: { $in: links.map((link) => link.pokemon) } }).select("_id nationalDex").lean(),
  ]);
  const cardsById = new Map(cards.map((card) => [String(card._id), card]));
  const pokemonById = new Map(pokemon.map((item) => [String(item._id), item]));
  return links.filter((link) => {
    if (link.verificationStatus === "NEEDS_REVIEW") return false;
    const card = cardsById.get(String(link.card));
    const linkedPokemon = pokemonById.get(String(link.pokemon));
    return Boolean(
      card
      && linkedPokemon
      && sourceCardType(card) === "POKEMON"
      && verifiedDexIdsOf(card).includes(linkedPokemon.nationalDex),
    );
  });
}

type AsyncHandler = (req: Request, res: Response, next: NextFunction) => Promise<void>;
const asyncRoute = (handler: AsyncHandler) => (req: Request, res: Response, next: NextFunction) => {
  void handler(req, res, next).catch(next);
};

interface CollectrPreviewCard {
  _id: unknown;
  sourceId: string;
  name: string;
  setName: string;
  setId: string;
  localId: string;
  rarity: string;
  language: string;
  classification: string;
  image: string;
  cardType?: string;
  eligibleForImport?: boolean;
  ineligibleReason?: string | null;
  confidenceScore?: number;
  suggestionReason?: string;
}

interface CollectrPreviewItem {
  index: number;
  record: CollectrRecord;
  candidates: CollectrPreviewCard[];
  match: {
    cardId: string;
    confidence: string;
    confidenceScore: number;
    explanation: string | null;
  } | null;
  status: "matched" | "needs-review" | "unmatched";
  reason: string | null;
  automaticStatus: "matched" | "needs-review" | "unmatched";
  automaticMatch: CollectrPreviewItem["match"];
  manualDecision?: {
    cardId: string | null;
    ignored: boolean;
    source?: string;
    updatedAt?: Date;
  };
  selectedCard?: CollectrPreviewCard;
}

async function mapLimit<T, R>(values: T[], limit: number, mapper: (value: T, index: number) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(values.length);
  let nextIndex = 0;
  await Promise.all(Array.from({ length: Math.min(limit, values.length) }, async () => {
    while (true) {
      const index = nextIndex++;
      if (index >= values.length) return;
      results[index] = await mapper(values[index], index);
    }
  }));
  return results;
}

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function referencedId(value: unknown): string {
  if (isObjectRecord(value) && "_id" in value) return String(value._id);
  return String(value);
}

function flexibleIdentityRegex(value: string): RegExp {
  const words = value.normalize("NFKD").replace(/\p{M}/gu, "").match(/[\p{L}\p{N}]+/gu) ?? [];
  return new RegExp(`^${words.map((word) => word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("[\\s\\p{P}\\p{S}]*")}$`, "iu");
}

async function getPokemonProgress(pokemonIds: string[]) {
  const progress = new Map<string, { totalCards: number; ownedCards: number; progress: number }>();
  if (pokemonIds.length === 0) return progress;

  const specialCards = await Card.find(POKEMON_SPECIAL_CARD_FILTER).select("_id language").lean();
  const cardIds = specialCards.map((card) => card._id);
  const languageByCard = new Map(specialCards.map((card) => [String(card._id), card.language]));
  const [links, ownedItems] = await Promise.all([
    findVerifiedPokemonCardLinks({
      pokemon: { $in: pokemonIds },
      card: { $in: cardIds },
    }),
    CollectionItem.find({ card: { $in: cardIds }, language: { $in: DISPLAY_CARD_LANGUAGES }, quantity: { $gt: 0 } }).select("card language").lean(),
  ]);
  const cardIdsByPokemon = new Map<string, Set<string>>();
  for (const link of links) {
    const key = String(link.pokemon);
    const linkedCards = cardIdsByPokemon.get(key) ?? new Set<string>();
    linkedCards.add(String(link.card));
    cardIdsByPokemon.set(key, linkedCards);
  }
  const ownedKeys = new Set(ownedItems
    .filter((item) => languageByCard.get(String(item.card)) === item.language)
    .map((item) => `${String(item.card)}:${item.language}`));
  for (const pokemonId of pokemonIds) {
    const linkedCards = cardIdsByPokemon.get(pokemonId) ?? new Set<string>();
    const ownedCount = [...linkedCards].filter((cardId) =>
      ownedKeys.has(`${cardId}:${languageByCard.get(cardId) ?? ""}`),
    ).length;
    const totalCards = linkedCards.size;
    progress.set(pokemonId, {
      totalCards,
      ownedCards: ownedCount,
      progress: totalCards === 0 ? 0 : Math.round((ownedCount / totalCards) * 1000) / 10,
    });
  }
  return progress;
}

router.get("/health", (_req, res) => {
  const connected = mongoose.connection.readyState === 1;
  res.status(connected ? 200 : 503).json({
    ok: connected,
    database: connected ? "connected" : "disconnected",
    databaseName: mongoose.connection.db?.databaseName ?? null,
  });
});

router.get("/sync/status", asyncRoute(async (_req, res) => {
  const status = await SyncStatus.findOne({ key: "main" }).lean();
  res.json(displaySyncStatus(status) ?? {
    status: "idle",
    pokemonProcessed: 0,
    pokemonTotal: 0,
    cardsProcessed: 0,
    cardsTotal: 0,
  });
}));

router.post("/sync", asyncRoute(async (_req, res) => {
  const current = await SyncStatus.findOne({ key: "main" }).lean();
  if (current?.status === "running") {
    res.status(409).json({ error: "A synchronization is already running." });
    return;
  }
  void runSync().catch((error: unknown) => {
    console.error("Synchronization failed:", error);
  });
  res.status(202).json({ message: "Synchronization started." });
}));

router.post("/sync/tcgdex/:language?", asyncRoute(async (req, res) => {
  const language = typeof req.params.language === "string" ? req.params.language : "en";
  if (!TCGDEX_LANGUAGES.includes(language as typeof TCGDEX_LANGUAGES[number])) {
    res.status(400).json({ error: `Unsupported TCGdex language "${language}".` });
    return;
  }
  const current = await SyncStatus.findOne({ key: "main" }).lean();
  if (current?.status === "running") {
    res.status(409).json({ error: "A synchronization is already running." });
    return;
  }
  void runTcgDexSync(language as typeof TCGDEX_LANGUAGES[number]).catch((error: unknown) => {
    console.error(`TCGdex ${language} synchronization failed:`, error);
  });
  res.status(202).json({ message: `TCGdex ${language} synchronization started.`, language });
}));

router.post("/sync/tcgdex/:language/sets/:setId", asyncRoute(async (req, res) => {
  const language = req.params.language;
  const setId = req.params.setId;
  if (!TCGDEX_LANGUAGES.includes(language as typeof TCGDEX_LANGUAGES[number])) {
    res.status(400).json({ error: `Unsupported TCGdex language "${language}".` });
    return;
  }
  const localSet = await CardSet.findOne({ sourceId: setId, language }).select("_id").lean();
  if (!localSet) {
    res.status(404).json({ error: `Set ${setId} is not present in the local ${language} catalog.` });
    return;
  }
  const current = await SyncStatus.findOne({ key: "main" }).lean();
  if (current?.status === "running") {
    res.status(409).json({ error: "A synchronization is already running." });
    return;
  }
  void runTcgDexSync(language as typeof TCGDEX_LANGUAGES[number], setId).catch((error: unknown) => {
    console.error(`TCGdex ${language} set ${setId} synchronization failed:`, error);
  });
  res.status(202).json({ message: `TCGdex ${language} set ${setId} synchronization started.`, language, setId });
}));

router.get("/settings/catalog-coverage", asyncRoute(async (_req, res) => {
  const report = await buildCatalogCoverageReport();
  res.json({
    ...report,
    byLanguage: Object.fromEntries(Object.entries(report.byLanguage).filter(([language]) => isDisplayCardLanguage(language))),
  });
}));

router.get("/pokemon", asyncRoute(async (req, res) => {
  const filter: Record<string, unknown> = {};
  const generation = Number(req.query.generation);
  if (Number.isInteger(generation) && generation >= 1 && generation <= 9) filter.generation = generation;
  if (typeof req.query.type === "string" && req.query.type.length > 0) {
    filter.types = { $in: req.query.type.split(",").filter(Boolean) };
  }
  if (typeof req.query.search === "string" && req.query.search.trim()) {
    const search = req.query.search.trim().slice(0, 80);
    if (/^\d+$/.test(search)) filter.nationalDex = Number(search);
    else filter.name = { $regex: search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), $options: "i" };
  }

  const pokemonList = await Pokemon.find(filter).sort({ nationalDex: 1 }).lean();
  const pokemonIds = pokemonList.map((item) => item._id);
  const links = await findVerifiedPokemonCardLinks({
    pokemon: { $in: pokemonIds },
  });
  const cardIds = [...new Set(links.map((link) => String(link.card)))];
  const cards = await Card.find({ _id: { $in: cardIds }, ...POKEMON_SPECIAL_CARD_FILTER })
    .select("classification language setName localId name image")
    .lean();
  const includedCardIds = new Set(cards.map((card) => String(card._id)));
  const collectionItems = await CollectionItem.find({
    card: { $in: cards.map((card) => card._id) },
    language: { $in: DISPLAY_CARD_LANGUAGES },
    quantity: { $gt: 0 },
  }).select("card language quantity").lean();
  const ownedByCard = new Map<string, number>();
  const unknownLanguageOwned = new Set<string>();
  for (const item of collectionItems) {
    if (item.language === "unknown") {
      unknownLanguageOwned.add(String(item.card));
    } else {
      const key = `${String(item.card)}:${item.language}`;
      ownedByCard.set(key, (ownedByCard.get(key) ?? 0) + item.quantity);
    }
  }
  const cardsByPokemon = new Map<string, typeof cards>();
  for (const link of links) {
    const cardId = String(link.card);
    if (!includedCardIds.has(cardId)) continue;
    const key = String(link.pokemon);
    const items = cardsByPokemon.get(key) ?? [];
    const card = cards.find((entry) => String(entry._id) === cardId);
    if (card && !items.some((entry) => String(entry._id) === cardId)) items.push(card);
    cardsByPokemon.set(key, items);
  }

  const result = pokemonList.map((pokemon) => {
    const cardsForPokemon = cardsByPokemon.get(String(pokemon._id)) ?? [];
    const ownedCount = cardsForPokemon.filter((card) =>
      unknownLanguageOwned.has(String(card._id))
      || (ownedByCard.get(`${String(card._id)}:${card.language}`) ?? 0) > 0,
    ).length;
    const total = cardsForPokemon.length;
    const progress = total === 0 ? 0 : Math.round((ownedCount / total) * 1000) / 10;
    const status = total > 0 && ownedCount === total ? "completed" : ownedCount > 0 ? "owned" : "missing";
    return { ...pokemon, totalCards: total, ownedCards: ownedCount, progress, collectionStatus: status };
  });

  const statusFilter = req.query.status;
  const filtered = statusFilter === "no-cards"
    ? result.filter((item) => item.totalCards === 0)
    : ["owned", "missing", "completed"].includes(String(statusFilter))
      ? result.filter((item) => item.collectionStatus === statusFilter)
      : result;
  res.json(filtered);
}));

router.get("/pokemon/:nationalDex", asyncRoute(async (req, res) => {
  const nationalDex = Number(req.params.nationalDex);
  if (!Number.isInteger(nationalDex) || nationalDex < 1) {
    res.status(400).json({ error: "National Pokédex number must be a positive integer." });
    return;
  }
  const pokemon = await Pokemon.findOne({ nationalDex }).lean();
  if (!pokemon) {
    res.status(404).json({ error: "Pokémon not found. Sync the data sources first." });
    return;
  }
  const links = await findVerifiedPokemonCardLinks({
    pokemon: pokemon._id,
  });
  const cards = await Card.find({
    _id: { $in: links.map((link) => link.card) },
    ...POKEMON_SPECIAL_CARD_FILTER,
  }).populate("set", "name logo").sort({ setName: 1, localId: 1 }).lean();
  const items = await CollectionItem.find({
    card: { $in: cards.map((card) => card._id) },
    language: { $in: DISPLAY_CARD_LANGUAGES },
    quantity: { $gt: 0 },
  }).lean();
  const byCard = new Map<string, typeof items>();
  for (const item of items) {
    const key = String(item.card);
    const current = byCard.get(key) ?? [];
    current.push(item);
    byCard.set(key, current);
  }
  res.json({
    pokemon,
    cards: cards.map((card) => ({
      ...card,
      collection: (byCard.get(String(card._id)) ?? []).filter((item) => item.language === card.language),
    })),
  });
}));

router.get("/collection", asyncRoute(async (_req, res) => {
  const eligibleCards = await Card.find(POKEMON_SPECIAL_CARD_FILTER).select("_id").lean();
  const collection = await CollectionItem.find({
    quantity: { $gt: 0 },
    language: { $in: DISPLAY_CARD_LANGUAGES },
    card: { $in: eligibleCards.map((card) => card._id) },
  })
    .populate({ path: "card", populate: { path: "set", select: "name logo" } })
    .sort({ updatedAt: -1 })
    .lean();
  const visibleCollection = collection.filter((item) =>
    isObjectRecord(item.card)
    && typeof item.card.language === "string"
    && item.language === item.card.language,
  );
  const cardIds = visibleCollection.map((item) => referencedId(item.card));
  const links = await findVerifiedPokemonCardLinks({
    card: { $in: cardIds },
  });
  const pokemonIds = [...new Set(links.map((link) => String(link.pokemon)))];
  const pokemon = await Pokemon.find({ _id: { $in: pokemonIds } }).select("nationalDex name generation types").lean();
  const progressByPokemon = await getPokemonProgress(pokemonIds);
  const pokemonById = new Map(pokemon.map((item) => [
    String(item._id),
    { ...item, ...progressByPokemon.get(String(item._id)) },
  ]));
  const cardsById = new Map<string, typeof pokemon>();
  for (const link of links) {
    const key = String(link.card);
    const linked = cardsById.get(key) ?? [];
    const related = pokemonById.get(String(link.pokemon));
    if (related && !linked.some((item) => String(item._id) === String(related._id))) linked.push(related);
    cardsById.set(key, linked);
  }
  res.json(visibleCollection.map((item) => ({
    ...item,
    pokemonInfo: cardsById.get(referencedId(item.card)) ?? [],
  })));
}));

router.put("/collection/:cardId", asyncRoute(async (req, res) => {
  if (!mongoose.Types.ObjectId.isValid(req.params.cardId)) {
    res.status(400).json({ error: "Invalid card identifier." });
    return;
  }
  const { quantity, language, finish, condition } = req.body as Record<string, unknown>;
  if (!Number.isInteger(quantity) || Number(quantity) < 0 || Number(quantity) > 9999) {
    res.status(400).json({ error: "Quantity must be an integer between 0 and 9999." });
    return;
  }
  const card = await Card.findById(req.params.cardId)
    .select("_id language cardType category rarity image sourceData classification")
    .lean();
  if (!card) {
    res.status(404).json({ error: "Card not found." });
    return;
  }
  if (!isEligiblePokemonCard(card) || !isDisplayCardLanguage(card.language)) {
    res.status(400).json({ error: "Only classified Pokémon special-art cards can be added to the collection." });
    return;
  }
  const itemLanguage = typeof language === "string" ? language : card.language;
  if (itemLanguage !== card.language) {
    res.status(400).json({ error: "Collection language must match the selected card printing." });
    return;
  }
  const itemFinish = typeof finish === "string" ? finish : "normal";
  const itemCondition = typeof condition === "string" ? condition : "Near Mint";
  const item = await CollectionItem.findOneAndUpdate(
    { card: card._id, language: itemLanguage, finish: itemFinish, condition: itemCondition },
    { $set: { quantity: Number(quantity) } },
    { upsert: true, new: true, runValidators: true },
  ).lean();
  res.json(item);
}));

router.get("/filters/options", asyncRoute(async (_req, res) => {
  const eligibleCardIds = await Card.distinct("_id", POKEMON_SPECIAL_CARD_FILTER);
  const [pokemon, sets, cardLanguages, collectionLanguages, categories] = await Promise.all([
    Pokemon.find().select("nationalDex name").sort({ nationalDex: 1 }).lean(),
    Card.distinct("setName", { ...POKEMON_SPECIAL_CARD_FILTER, setName: { $type: "string", $ne: "" } }),
    Card.distinct("language", { ...POKEMON_SPECIAL_CARD_FILTER, language: { $type: "string", $ne: "" } }),
    CollectionItem.distinct("language", {
      quantity: { $gt: 0 },
      language: { $in: DISPLAY_CARD_LANGUAGES },
      card: { $in: eligibleCardIds },
    }),
    Card.distinct("classification", POKEMON_SPECIAL_CARD_FILTER),
  ]);
  res.json({
    pokemon: pokemon.map(({ nationalDex, name }) => ({ nationalDex, name })),
    sets: sets.sort((left, right) => String(left).localeCompare(String(right))),
    languages: [...new Set([...cardLanguages, ...collectionLanguages])]
      .sort((left, right) => String(left).localeCompare(String(right))),
    categories: categories.sort((left, right) => String(left).localeCompare(String(right))),
  });
}));

router.get("/cards/missing", asyncRoute(async (_req, res) => {
  const cards = await Card.find(POKEMON_SPECIAL_CARD_FILTER)
    .populate("set", "name logo")
    .sort({ setName: 1, localId: 1 })
    .lean();
  const owned = await CollectionItem.find({
    card: { $in: cards.map((card) => card._id) },
    language: { $in: DISPLAY_CARD_LANGUAGES },
    quantity: { $gt: 0 },
  }).select("card language").lean();
  const ownedKeys = new Set(owned.map((item) => `${String(item.card)}:${item.language}`));
  const unknownLanguageOwned = new Set(owned.filter((item) => item.language === "unknown").map((item) => String(item.card)));
  const missing = cards.filter((card) =>
    !unknownLanguageOwned.has(String(card._id))
    && !ownedKeys.has(`${String(card._id)}:${card.language}`),
  );
  const links = await findVerifiedPokemonCardLinks({
    card: { $in: missing.map((card) => card._id) },
  });
  const pokemonIds = [...new Set(links.map((link) => String(link.pokemon)))];
  const pokemon = await Pokemon.find({ _id: { $in: pokemonIds } }).select("nationalDex name generation types").lean();
  const progressByPokemon = await getPokemonProgress(pokemonIds);
  const pokemonById = new Map(pokemon.map((item) => [
    String(item._id),
    { ...item, ...progressByPokemon.get(String(item._id)) },
  ]));
  const cardsById = new Map<string, typeof pokemon>();
  for (const link of links) {
    const key = String(link.card);
    const linked = cardsById.get(key) ?? [];
    const related = pokemonById.get(String(link.pokemon));
    if (related && !linked.some((item) => String(item._id) === String(related._id))) linked.push(related);
    cardsById.set(key, linked);
  }
  res.json(missing.map((card) => ({
    ...card,
    pokemonInfo: cardsById.get(String(card._id)) ?? [],
  })));
}));

router.get("/stats", asyncRoute(async (_req, res) => {
  const eligibleCardIds = await Card.distinct("_id", POKEMON_SPECIAL_CARD_FILTER);
  const [pokemonCount, allSpecialCards, ownedItems] = await Promise.all([
    Pokemon.countDocuments(),
    Card.find(POKEMON_SPECIAL_CARD_FILTER).select("_id language setName classification").lean(),
    CollectionItem.find({
      quantity: { $gt: 0 },
      card: { $in: eligibleCardIds },
      language: { $in: DISPLAY_CARD_LANGUAGES },
    }).select("card language quantity").lean(),
  ]);
  const languageByCard = new Map(allSpecialCards.map((card) => [String(card._id), card.language]));
  const validOwnedItems = ownedItems.filter((item) => languageByCard.get(String(item.card)) === item.language);
  const specialIds = new Set(allSpecialCards.map((card) => String(card._id)));
  const ownedCardIds = new Set(
    validOwnedItems.filter((item) => specialIds.has(String(item.card))).map((item) => String(item.card)),
  );
  const missingCards = Math.max(specialIds.size - ownedCardIds.size, 0);
  const [links, pokemon] = await Promise.all([
    findVerifiedPokemonCardLinks({
      card: { $in: allSpecialCards.map((card) => card._id) },
    }),
    Pokemon.find().select("_id generation types").lean(),
  ]);
  const pokemonById = new Map(pokemon.map((item) => [String(item._id), item]));
  const linkedByPokemon = new Map<string, Set<string>>();
  const generationCards = new Map<number, Set<string>>();
  const generationOwned = new Map<number, Set<string>>();
  const typeCards = new Map<string, Set<string>>();
  const typeOwned = new Map<string, Set<string>>();
  for (const link of links) {
    const cardId = String(link.card);
    const pokemonKey = String(link.pokemon);
    const set = linkedByPokemon.get(pokemonKey) ?? new Set<string>();
    set.add(cardId);
    linkedByPokemon.set(pokemonKey, set);
    const pokemonData = pokemonById.get(pokemonKey);
    if (!pokemonData) continue;
    const generationSet = generationCards.get(pokemonData.generation) ?? new Set<string>();
    generationSet.add(cardId);
    generationCards.set(pokemonData.generation, generationSet);
    if (ownedCardIds.has(cardId)) {
      const ownedSet = generationOwned.get(pokemonData.generation) ?? new Set<string>();
      ownedSet.add(cardId);
      generationOwned.set(pokemonData.generation, ownedSet);
    }
    for (const type of pokemonData.types) {
      const cardsForType = typeCards.get(type) ?? new Set<string>();
      cardsForType.add(cardId);
      typeCards.set(type, cardsForType);
      if (ownedCardIds.has(cardId)) {
        const ownedForType = typeOwned.get(type) ?? new Set<string>();
        ownedForType.add(cardId);
        typeOwned.set(type, ownedForType);
      }
    }
  }
  const ownedPokemon = new Set<string>();
  const completedPokemon = new Set<string>();
  for (const [pokemonId, pokemonCardIds] of linkedByPokemon) {
    const ownedCount = [...pokemonCardIds].filter((cardId) => ownedCardIds.has(cardId)).length;
    if (ownedCount > 0) ownedPokemon.add(pokemonId);
    if (pokemonCardIds.size > 0 && ownedCount === pokemonCardIds.size) completedPokemon.add(pokemonId);
  }
  const setTotals = new Map<string, { total: number; owned: number }>();
  const classificationTotals = new Map<string, { total: number; owned: number }>();
  for (const card of allSpecialCards) {
    for (const [key, grouping] of [
      [card.setName || "Unknown set", setTotals],
      [card.classification, classificationTotals],
    ] as const) {
      const value = grouping.get(key) ?? { total: 0, owned: 0 };
      value.total += 1;
      if (ownedCardIds.has(String(card._id))) value.owned += 1;
      grouping.set(key, value);
    }
  }
  const barData = (totals: Map<string | number, Set<string>>, owned: Map<string | number, Set<string>>) =>
    [...totals.entries()].map(([key, cards]) => ({
      name: String(key),
      total: cards.size,
      owned: owned.get(key)?.size ?? 0,
    })).sort((left, right) => left.name.localeCompare(right.name));
  res.json({
    pokemonTotal: pokemonCount,
    pokemonOwned: ownedPokemon.size,
    pokemonMissing: Math.max(pokemonCount - ownedPokemon.size, 0),
    pokemonCompleted: completedPokemon.size,
    specialCardsTotal: specialIds.size,
    uniqueCardsOwned: ownedCardIds.size,
    physicalCopiesOwned: validOwnedItems
      .filter((item) => specialIds.has(String(item.card)))
      .reduce((sum, item) => sum + item.quantity, 0),
    cardsMissing: missingCards,
    completionPercent: specialIds.size === 0 ? 0 : Math.round((ownedCardIds.size / specialIds.size) * 1000) / 10,
    breakdown: {
      byGeneration: barData(generationCards, generationOwned),
      byType: barData(typeCards, typeOwned),
      byClassification: [...classificationTotals].map(([name, value]) => ({ name, ...value })),
      bySet: [...setTotals].map(([name, value]) => ({ name, ...value })).sort((left, right) => right.total - left.total).slice(0, 20),
    },
  });
}));

router.get("/classification/review/summary", asyncRoute(async (_req, res) => {
  const snapshot = await loadReviewSnapshot();
  const cards = snapshot.cards as unknown as ClassificationReviewCard[];
  const report = summarizeClassificationReview(cards);
  const skipped = snapshot.cards.filter((card) => latestReviewAction(snapshot, card._id)?.action === "SKIP").length;
  const pokemonIds = [...new Set(cards.flatMap((card) => verifiedDexIdsOf(card as { dexIds?: number[]; sourceData?: unknown })))];
  const pokemon = pokemonIds.length
    ? await Pokemon.find({ nationalDex: { $in: pokemonIds } }).select("nationalDex name").sort({ nationalDex: 1 }).lean()
    : [];
  const setOptions = new Map<string, { setId: string; setName: string; language: string; count: number }>();
  const rarityCounts = new Map<string, number>();
  const categoryCounts = new Map<string, number>();
  const languageCounts = new Map<string, number>();
  for (const card of cards) {
    const language = card.language || "(missing)";
    languageCounts.set(language, (languageCounts.get(language) ?? 0) + 1);
    const setKey = `${language}|${card.setId ?? ""}`;
    const set = setOptions.get(setKey) ?? {
      setId: card.setId ?? "",
      setName: card.setName ?? "(missing set)",
      language,
      count: 0,
    };
    set.count += 1;
    setOptions.set(setKey, set);
    const rarity = card.rarity?.trim() || String(recordOf(card.sourceData).rarity ?? "").trim() || "(missing)";
    rarityCounts.set(rarity, (rarityCounts.get(rarity) ?? 0) + 1);
    const category = reviewSourceCategory(card as unknown as Record<string, unknown>) || "(missing)";
    categoryCounts.set(category, (categoryCounts.get(category) ?? 0) + 1);
  }
  res.json({
    ...report,
    activeCount: report.total - skipped,
    skippedCount: skipped,
    options: {
      languages: [...languageCounts].map(([value, count]) => ({ value, count })).sort((a, b) => a.value.localeCompare(b.value)),
      sets: [...setOptions.values()].sort((a, b) => a.setName.localeCompare(b.setName) || a.language.localeCompare(b.language)),
      rarities: [...rarityCounts].map(([value, count]) => ({ value, count })).sort((a, b) => a.value.localeCompare(b.value)),
      categories: [...categoryCounts].map(([value, count]) => ({ value, count })).sort((a, b) => a.value.localeCompare(b.value)),
      pokemon: pokemon.map((item) => ({ nationalDex: item.nationalDex, name: item.name })),
      reasons: CLASSIFICATION_REVIEW_REASONS,
    },
  });
}));

router.get("/classification/review/visual/summary", asyncRoute(async (_req, res) => {
  const snapshot = await loadVisualPromoSnapshot();
  const pokemonIds = [...new Set(snapshot.cards.flatMap((card) => verifiedDexIdsOf(card as { dexIds?: number[]; sourceData?: unknown })))];
  const pokemon = pokemonIds.length
    ? await Pokemon.find({ nationalDex: { $in: pokemonIds } }).select("nationalDex name").sort({ nationalDex: 1 }).lean()
    : [];
  const byLanguage = new Map<string, number>();
  const sets = new Map<string, { setId: string; setName: string; language: string; count: number }>();
  const rarities = new Map<string, number>();
  const decisions = { confirmed: 0, rejected: 0, undecided: 0, reviewed: 0, unreviewed: 0, withImage: 0, missingImage: 0 };
  for (const card of snapshot.cards) {
    const latest = snapshot.latestActionByCard.get(String(card._id));
    const decision = visualReviewDecision(latest);
    const reviewed = (snapshot.actionsByCard.get(String(card._id))?.length ?? 0) > 0;
    if (decision === "CONFIRMED") decisions.confirmed += 1;
    else if (decision === "REJECTED") decisions.rejected += 1;
    else decisions.undecided += 1;
    if (reviewed) decisions.reviewed += 1;
    else decisions.unreviewed += 1;
    if (reviewImageAvailable(card as unknown as ClassificationReviewCard)) decisions.withImage += 1;
    else decisions.missingImage += 1;
    const language = String(card.language ?? "");
    byLanguage.set(language, (byLanguage.get(language) ?? 0) + 1);
    const setKey = `${language}|${String(card.setId ?? "")}`;
    const set = sets.get(setKey) ?? { setId: String(card.setId ?? ""), setName: String(card.setName ?? "(missing set)"), language, count: 0 };
    set.count += 1;
    sets.set(setKey, set);
    const rarity = String(card.rarity || recordOf(card.sourceData).rarity || "(missing)");
    rarities.set(rarity, (rarities.get(rarity) ?? 0) + 1);
  }
  res.json({
    total: snapshot.cards.length,
    ...decisions,
    byLanguage: Object.fromEntries(byLanguage),
    options: {
      languages: DISPLAY_CARD_LANGUAGES.filter((language) => byLanguage.has(language)).map((value) => ({ value, count: byLanguage.get(value) ?? 0 })),
      sets: [...sets.values()].sort((a, b) => a.setName.localeCompare(b.setName) || a.language.localeCompare(b.language)),
      rarities: [...rarities].map(([value, count]) => ({ value, count })).sort((a, b) => a.value.localeCompare(b.value)),
      pokemon: pokemon.map((item) => ({ nationalDex: item.nationalDex, name: item.name })),
    },
  });
}));

router.get("/classification/review/visual", asyncRoute(async (req, res) => {
  const snapshot = await loadVisualPromoSnapshot();
  const page = Math.max(1, Math.min(1_000_000, Number.parseInt(reviewQueryString(req.query.page) || "1", 10) || 1));
  const pageSize = Math.max(1, Math.min(100, Number.parseInt(reviewQueryString(req.query.pageSize) || "36", 10) || 36));
  const language = reviewQueryString(req.query.language);
  const setId = reviewQueryString(req.query.setId);
  const setLanguage = reviewQueryString(req.query.setLanguage);
  const rarity = reviewQueryString(req.query.rarity);
  const pokemonDex = Number.parseInt(reviewQueryString(req.query.pokemon), 10);
  const image = reviewQueryString(req.query.image);
  const reviewStatus = reviewQueryString(req.query.reviewStatus) || "all";
  const decisionFilter = reviewQueryString(req.query.decision) || "all";
  const sort = reviewQueryString(req.query.sort) || "set";
  const allowedSorts = ["set", "number", "pokemon", "language", "name"];
  if (language && !isDisplayCardLanguage(language)) {
    res.json({ items: [], pagination: { page, pageSize, total: 0, pageCount: 0 }, sort, reviewStatus, decision: decisionFilter });
    return;
  }
  if (!allowedSorts.includes(sort) || !["all", "reviewed", "unreviewed"].includes(reviewStatus)
    || !["all", "undecided", "confirmed", "rejected"].includes(decisionFilter)
    || !["", "yes", "no"].includes(image)) {
    res.status(400).json({ error: "Unsupported Visual Gallery filter." });
    return;
  }
  const filtered = snapshot.cards.filter((raw) => {
    const card = raw as unknown as ClassificationReviewCard;
    const cardId = String(raw._id);
    const history = snapshot.actionsByCard.get(cardId) ?? [];
    const reviewed = history.length > 0;
    const decision = visualReviewDecision(snapshot.latestActionByCard.get(cardId)).toLocaleLowerCase();
    if (language && card.language !== language) return false;
    if (setId && card.setId !== setId) return false;
    if (setLanguage && card.language !== setLanguage) return false;
    if (rarity && String(card.rarity || recordOf(card.sourceData).rarity || "(missing)") !== rarity) return false;
    if (reviewStatus === "reviewed" && !reviewed) return false;
    if (reviewStatus === "unreviewed" && reviewed) return false;
    if (decisionFilter !== "all" && decision !== decisionFilter) return false;
    if (image === "yes" && !reviewImageAvailable(card)) return false;
    if (image === "no" && reviewImageAvailable(card)) return false;
    if (Number.isInteger(pokemonDex) && pokemonDex > 0 && !verifiedDexIdsOf(card as { dexIds?: number[]; sourceData?: unknown }).includes(pokemonDex)) return false;
    return true;
  });
  const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: "base" });
  filtered.sort((left, right) => {
    const a = left as unknown as ClassificationReviewCard;
    const b = right as unknown as ClassificationReviewCard;
    const dexA = Math.min(...verifiedDexIdsOf(a as { dexIds?: number[]; sourceData?: unknown }), Number.MAX_SAFE_INTEGER);
    const dexB = Math.min(...verifiedDexIdsOf(b as { dexIds?: number[]; sourceData?: unknown }), Number.MAX_SAFE_INTEGER);
    const primary = sort === "number" ? collator.compare(String(a.localId ?? ""), String(b.localId ?? ""))
      : sort === "pokemon" ? dexA - dexB
        : sort === "language" ? collator.compare(String(a.language ?? ""), String(b.language ?? ""))
          : sort === "name" ? collator.compare(String(a.name ?? ""), String(b.name ?? ""))
            : collator.compare(String(a.setName ?? ""), String(b.setName ?? ""));
    return primary || collator.compare(String(a.setName ?? ""), String(b.setName ?? ""))
      || collator.compare(String(a.localId ?? ""), String(b.localId ?? ""))
      || collator.compare(String(a.name ?? ""), String(b.name ?? ""));
  });
  const total = filtered.length;
  const pageCount = Math.ceil(total / pageSize);
  const pageItems = filtered.slice((page - 1) * pageSize, page * pageSize);
  res.json({
    items: pageItems.map((card) => {
      const history = snapshot.actionsByCard.get(String(card._id)) ?? [];
      const identity = {
        sourceId: String(card.sourceId ?? ""), name: String(card.name ?? ""), language: String(card.language ?? ""),
        setId: String(card.setId ?? ""), localId: String(card.localId ?? ""), artist: String(card.artist || recordOf(card.sourceData).illustrator || ""),
      };
      const latest = snapshot.latestActionByCard.get(String(card._id));
      return reviewCardResponse(card, history, {
        visualDecision: visualReviewDecision(latest),
        visuallyReviewed: history.length > 0,
        imageCandidates: verifiedReviewImageCandidates(identity),
      });
    }),
    pagination: { page, pageSize, total, pageCount },
    sort,
    reviewStatus,
    decision: decisionFilter,
  });
}));

router.get("/classification/review", asyncRoute(async (req, res) => {
  const snapshot = await loadReviewSnapshot();
  const page = Math.max(1, Math.min(1_000_000, Number.parseInt(reviewQueryString(req.query.page) || "1", 10) || 1));
  const pageSize = Math.max(1, Math.min(100, Number.parseInt(reviewQueryString(req.query.pageSize) || "24", 10) || 24));
  const language = reviewQueryString(req.query.language);
  const setId = reviewQueryString(req.query.setId);
  const setLanguage = reviewQueryString(req.query.setLanguage);
  const rarity = reviewQueryString(req.query.rarity);
  const category = reviewQueryString(req.query.category);
  const reason = reviewQueryString(req.query.reason);
  const search = reviewQueryString(req.query.search).toLocaleLowerCase();
  const pokemonDex = Number.parseInt(reviewQueryString(req.query.pokemon), 10);
  const imageFilter = reviewQueryString(req.query.image);
  const state = reviewQueryString(req.query.state) || "active";
  const requestedSort = reviewQueryString(req.query.sort);
  const sort = requestedSort === "confidence" || requestedSort === "completeness" ? requestedSort : "evidence";
  if (reason && !CLASSIFICATION_REVIEW_REASONS.includes(reason as typeof CLASSIFICATION_REVIEW_REASONS[number])) {
    res.status(400).json({ error: "Unsupported review reason." });
    return;
  }
  if (!["active", "skipped", "all"].includes(state)) {
    res.status(400).json({ error: "Unsupported review state." });
    return;
  }

  const filtered = snapshot.cards.filter((rawCard) => {
    const card = rawCard as unknown as ClassificationReviewCard;
    const latest = latestReviewAction(snapshot, rawCard._id);
    const isSkipped = latest?.action === "SKIP";
    if (state === "active" && isSkipped) return false;
    if (state === "skipped" && !isSkipped) return false;
    if (language && card.language !== language) return false;
    if (setId && card.setId !== setId) return false;
    if (setLanguage && card.language !== setLanguage) return false;
    const cardRarity = card.rarity?.trim() || String(recordOf(card.sourceData).rarity ?? "").trim() || "(missing)";
    if (rarity && cardRarity !== rarity) return false;
    const cardCategory = reviewSourceCategory(rawCard);
    if (category && cardCategory !== category) return false;
    if (reason && !getReviewReasonGroups(card).includes(reason as typeof CLASSIFICATION_REVIEW_REASONS[number])) return false;
    if (imageFilter === "yes" && !reviewImageAvailable(card)) return false;
    if (imageFilter === "no" && reviewImageAvailable(card)) return false;
    if (Number.isInteger(pokemonDex) && pokemonDex > 0 && !verifiedDexIdsOf(card as { dexIds?: number[]; sourceData?: unknown }).includes(pokemonDex)) return false;
    if (search && ![card.name, card.setName, card.setId, card.localId, card.rarity, card.sourceId]
      .some((value) => typeof value === "string" && value.toLocaleLowerCase().includes(search))) return false;
    return true;
  });

  filtered.sort((left, right) => {
    const a = left as unknown as ClassificationReviewCard;
    const b = right as unknown as ClassificationReviewCard;
    const confidenceDiff = Number(b.classificationConfidence ?? 0) - Number(a.classificationConfidence ?? 0);
    const completenessDiff = getReviewMetadataCompleteness(b).score - getReviewMetadataCompleteness(a).score;
    const evidenceDiff = getReviewEvidenceCompleteness(b) - getReviewEvidenceCompleteness(a);
    const primaryDiff = sort === "confidence" ? confidenceDiff : sort === "completeness" ? completenessDiff : evidenceDiff;
    return primaryDiff || confidenceDiff || completenessDiff || evidenceDiff
      || String(a.name ?? "").localeCompare(String(b.name ?? ""));
  });
  const total = filtered.length;
  const pageCount = Math.ceil(total / pageSize);
  const pageItems = filtered.slice((page - 1) * pageSize, page * pageSize);
  res.json({
    items: pageItems.map((card) => reviewCardResponse(card, reviewActionHistory(snapshot, card._id))),
    pagination: { page, pageSize, total, pageCount },
    sort,
    state,
  });
}));

router.post("/classification/review/:cardId/action", asyncRoute(async (req, res) => {
  if (!mongoose.Types.ObjectId.isValid(req.params.cardId)) {
    res.status(400).json({ error: "Invalid card identifier." });
    return;
  }
  const body = req.body as Record<string, unknown>;
  const action = body.action;
  const note = typeof body.note === "string" ? body.note : "";
  const visualGalleryAction = body.reviewScope === "promo-visual-gallery";
  if (!["CONFIRM_SPECIAL_ART", "MARK_NOT_SPECIAL_ART", "KEEP_NEEDS_REVIEW", "SKIP"].includes(String(action))) {
    res.status(400).json({ error: "Unsupported review action." });
    return;
  }
  const card = await Card.findById(req.params.cardId);
  if (!card) {
    res.status(404).json({ error: "Card not found." });
    return;
  }
  if (!isDisplayCardLanguage(card.language)) {
    res.status(404).json({ error: "Card is outside the supported display languages." });
    return;
  }
  const priorAction = visualGalleryAction ? await CardReviewAction.exists({ card: card._id }) : null;
  if (visualGalleryAction && !visualPromoCard(card.toObject() as unknown as Record<string, unknown>)) {
    res.status(409).json({ error: "Visual Gallery decisions are limited to supported Pokémon Promo cards." });
    return;
  }
  if (visualGalleryAction && action === "SKIP") {
    res.status(400).json({ error: "Skip is not a Visual Gallery decision. Use Keep Undecided instead." });
    return;
  }
  if (card.classification !== "NEEDS_REVIEW" && (!visualGalleryAction || !priorAction)) {
    res.status(409).json({ error: "This card is no longer in the review queue." });
    return;
  }
  const actionValue = action as "CONFIRM_SPECIAL_ART" | "MARK_NOT_SPECIAL_ART" | "KEEP_NEEDS_REVIEW" | "SKIP";
  const previousClassification = card.classification;
  let resultingClassification: string = previousClassification;
  let selectedClassification: string | undefined;
  const imageCandidateId = typeof body.imageCandidateId === "string" ? body.imageCandidateId : "";
  const imageIdentity = {
    sourceId: String(card.sourceId ?? ""), name: String(card.name ?? ""), language: String(card.language ?? ""),
    setId: String(card.setId ?? ""), localId: String(card.localId ?? ""), artist: String(card.artist || sourceDataOf(card).illustrator || ""),
  };
  const selectedImageCandidate = visualGalleryAction && imageCandidateId
    ? verifiedReviewImageCandidate(imageIdentity, imageCandidateId)
    : undefined;
  if (imageCandidateId && !selectedImageCandidate) {
    res.status(400).json({ error: "The selected external image is not verified for this exact card identity." });
    return;
  }
  if (actionValue === "CONFIRM_SPECIAL_ART") {
    selectedClassification = typeof body.classification === "string" ? body.classification : "";
    if (!SPECIAL_ART_CATEGORIES.includes(selectedClassification as typeof SPECIAL_ART_CATEGORIES[number])) {
      res.status(400).json({ error: "Choose an explicit Special Art classification before confirming." });
      return;
    }
    const rawSourceCategory = card.category?.trim() || String(sourceDataOf(card).category ?? "");
    if (sourceCardType(card) !== "POKEMON" || rawSourceCategory.toLocaleLowerCase() !== "pokemon") {
      res.status(409).json({ error: "Only cards with TCGdex Pokémon category evidence can be confirmed as Special Art." });
      return;
    }
    await CardClassificationOverride.findOneAndUpdate(
      { card: card._id }, { $set: { classification: selectedClassification } }, { upsert: true, new: true },
    );
    resultingClassification = selectedClassification;
  } else if (actionValue === "MARK_NOT_SPECIAL_ART") {
    selectedClassification = "EXCLUDED";
    await CardClassificationOverride.findOneAndUpdate(
      { card: card._id }, { $set: { classification: "EXCLUDED" } }, { upsert: true, new: true },
    );
    resultingClassification = "EXCLUDED";
  } else if (visualGalleryAction && actionValue === "KEEP_NEEDS_REVIEW") {
    await CardClassificationOverride.findOneAndUpdate(
      { card: card._id }, { $set: { classification: "NEEDS_REVIEW" } }, { upsert: true, new: true },
    );
    resultingClassification = "NEEDS_REVIEW";
  }

  if (actionValue === "CONFIRM_SPECIAL_ART" || actionValue === "MARK_NOT_SPECIAL_ART"
    || (visualGalleryAction && actionValue === "KEEP_NEEDS_REVIEW")) {
    card.$set("classification", resultingClassification as typeof SPECIAL_ART_CATEGORIES[number] | "EXCLUDED");
    card.cardType = sourceCardType(card);
    card.isSpecialArt = INCLUDED.includes(resultingClassification);
    card.classificationConfidence = actionValue === "KEEP_NEEDS_REVIEW" ? 0 : 100;
    card.classificationReason = actionValue === "KEEP_NEEDS_REVIEW"
      ? "Manual review decision: kept undecided in the Visual Gallery."
      : `Manual classification override: ${resultingClassification}.`;
    card.classificationSource = "manual";
    card.classificationReviewed = true;
    await card.save();
  }
  const evidence = buildClassificationEvidence(card.toObject() as unknown as ClassificationReviewCard);
  if (selectedImageCandidate) {
    evidence.push({
      field: "alternateArtworkImage",
      value: selectedImageCandidate.imageUrl,
      source: selectedImageCandidate.source,
      sourceId: selectedImageCandidate.sourceId,
      sourceUrl: selectedImageCandidate.sourceUrl,
      checkedAt: selectedImageCandidate.checkedAt,
      confidence: selectedImageCandidate.confidence,
      matchedFields: selectedImageCandidate.matchedFields,
      note: selectedImageCandidate.confidenceReason,
    } as unknown as typeof evidence[number]);
  }
  const actor = visualGalleryAction ? "local user via Visual Gallery" : "local user via Smart Review";
  const actionNote = note.trim().slice(0, 1000)
    || (visualGalleryAction ? `Visual Gallery manual decision: ${actionValue}${selectedClassification ? ` (${selectedClassification})` : ""}.` : "");
  const reviewAction = await CardReviewAction.create({
    card: card._id,
    action: actionValue,
    ...(selectedClassification ? { classification: selectedClassification } : {}),
    previousClassification,
    resultingClassification,
    evidence,
    sourceId: card.sourceId,
    sourceUrl: selectedImageCandidate?.sourceUrl ?? getTcgDexCardSourceUrl(card.toObject() as unknown as ClassificationReviewCard) ?? "",
    actor,
    note: actionNote,
  });
  invalidateReviewSnapshot();
  res.json({ action: reviewAction, card: { _id: String(card._id), classification: card.classification } });
}));

router.put("/classification/:cardId", asyncRoute(async (req, res) => {
  if (!mongoose.Types.ObjectId.isValid(req.params.cardId)) {
    res.status(400).json({ error: "Invalid card identifier." });
    return;
  }
  const valid = [...SPECIAL_ART_CATEGORIES, "EXCLUDED"];
  const classification = (req.body as Record<string, unknown>).classification;
  if (typeof classification !== "string" || !valid.includes(classification)) {
    res.status(400).json({ error: "Unsupported classification." });
    return;
  }
  const card = await Card.findById(req.params.cardId);
  if (!card) {
    res.status(404).json({ error: "Card not found." });
    return;
  }
  if (!isDisplayCardLanguage(card.language)) {
    res.status(404).json({ error: "Card is outside the supported display languages." });
    return;
  }
  const previousClassification = card.classification;
  card.cardType = sourceCardType(card);
  if (classification !== "EXCLUDED" && card.cardType !== "POKEMON") {
    res.status(409).json({ error: "Only verified Pokémon cards can receive a Special Art classification." });
    return;
  }
  await CardClassificationOverride.findOneAndUpdate(
    { card: card._id },
    { $set: { classification } },
    { upsert: true, new: true },
  );
  card.classification = classification as typeof card.classification;
  card.isSpecialArt = INCLUDED.includes(classification);
  card.classificationConfidence = 100;
  card.classificationReason = `Manual classification override: ${classification}.`;
  card.classificationSource = "manual";
  card.classificationReviewed = true;
  await card.save();
  await recordClassificationReviewAction(
    card as unknown as mongoose.HydratedDocument<unknown> & Record<string, unknown>,
    classification === "EXCLUDED" ? "MARK_NOT_SPECIAL_ART" : "CONFIRM_SPECIAL_ART",
    classification,
    "Saved through the legacy manual classification endpoint.",
    previousClassification,
  );
  invalidateReviewSnapshot();
  res.json(card);
}));

router.post("/collectr/preview", asyncRoute(async (req, res) => {
  const text = (req.body as Record<string, unknown>).text;
  if (typeof text !== "string" || text.trim().length === 0 || text.length > 1_000_000) {
    res.status(400).json({ error: "Paste Collectr text between 1 byte and 1 MB." });
    return;
  }
  const parsed = parseCollectrText(text);
  const previews: CollectrPreviewItem[] = await mapLimit(parsed.records, 12, async (record, index) => {
    const languageOptions = recordLanguageOptions(record);
    const unsupportedLanguages = languageOptions.filter((language) => !isDisplayCardLanguage(language));
    const supportedLanguageOptions = unsupportedLanguages.length === 0 ? languageOptions : [];
    const primaryLocalId = record.cardNumber.split("/")[0]?.trim() ?? "";
    const normalizedLocalId = normalizeCardNumber(primaryLocalId);
    const requiredFields = [
      ["card name", record.cardName],
      ["set name", record.setName],
      ["card number", record.cardNumber],
    ].filter(([, value]) => !value.trim()).map(([field]) => field);
    const namedSets = record.setName && unsupportedLanguages.length === 0
      ? await CardSet.find({ name: flexibleIdentityRegex(record.setName), language: { $in: DISPLAY_CARD_LANGUAGES } })
        .select("sourceId language name cardCount")
        .lean()
      : [];
    const directNamedSets = namedSets.filter((set) => supportedLanguageOptions.includes(set.language));
    const verifiedAliasIds = [...new Set(namedSets.map((set) => set.sourceId))];
    const localizedAliasSets = directNamedSets.length > 0 || verifiedAliasIds.length === 0
      ? []
      : await CardSet.find({
        sourceId: { $in: verifiedAliasIds },
        language: { $in: supportedLanguageOptions },
      })
        .select("sourceId language name cardCount")
        .lean();
    const resolvedSets = directNamedSets.length > 0 ? directNamedSets : localizedAliasSets;
    const resolvedSetIds = [...new Set(resolvedSets.map((set) => set.sourceId))];
    const usingVerifiedSetAlias = directNamedSets.length === 0 && resolvedSets.length > 0;
    const numberFilter = record.cardNumber && resolvedSetIds.length > 0 && supportedLanguageOptions.length > 0
      ? {
        setId: { $in: resolvedSetIds },
        language: { $in: supportedLanguageOptions },
        localId: { $in: cardNumberVariants(record.cardNumber) },
      }
      : null;
    const [numberCandidates, ineligibleNumberCandidates] = numberFilter
      ? await Promise.all([
        Card.find({
          ...numberFilter,
          ...POKEMON_CARD_TYPE_FILTER,
          classification: { $in: [...INCLUDED, "NEEDS_REVIEW"] },
        })
          .select("_id sourceId name setName setId localId rarity language classification image cardType category sourceData")
          .lean(),
        Card.find({
          ...numberFilter,
          $or: [
            { cardType: { $ne: "POKEMON" } },
            { classification: { $nin: INCLUDED } },
          ],
        })
          .select("_id sourceId name setName setId localId rarity language classification image cardType category sourceData")
          .lean(),
      ])
      : [[], []];
    const localizedNames = numberCandidates.length > 0
      ? await Card.find({
        sourceId: { $in: numberCandidates.map((card) => card.sourceId) },
        language: { $in: DISPLAY_CARD_LANGUAGES, $nin: supportedLanguageOptions },
        ...POKEMON_SPECIAL_CARD_FILTER,
      }).select("sourceId setId name language").lean()
      : [];
    const localNumber = normalizedLocalIdNumber(record.cardNumber);
    const denominator = record.cardNumber.split("/")[1]?.trim();
    const cardCountDiagnostics = resolvedSets.map((set) => {
      const official = cardCountValue(set, "official");
      const total = cardCountValue(set, "total");
      const denominatorNumber = denominator && /^\d+$/.test(denominator) ? Number(denominator) : undefined;
      return {
        setId: set.sourceId,
        setName: set.name,
        language: set.language,
        official: official ?? null,
        total: total ?? null,
        localId: normalizedLocalId,
        aboveOfficialWithinTotal: localNumber !== undefined
          && official !== undefined
          && total !== undefined
          && localNumber > official
          && localNumber <= total,
        aboveOfficialWithoutTotal: localNumber !== undefined
          && official !== undefined
          && total === undefined
          && localNumber > official,
        aboveTotal: localNumber !== undefined && total !== undefined && localNumber > total,
        denominatorMismatch: denominatorNumber !== undefined
          && official !== undefined
          && denominatorNumber !== official,
      };
    });
    const numberingIssue = cardCountDiagnostics.some((counts) =>
      counts.aboveTotal || counts.aboveOfficialWithoutTotal || counts.denominatorMismatch,
    );
    const translatedNames = new Map<string, Set<string>>();
    for (const card of localizedNames) {
      const names = translatedNames.get(card.sourceId) ?? new Set<string>();
      names.add(normalizeCardName(card.name));
      translatedNames.set(card.sourceId, names);
    }
    const allSetCandidates = [...new Map(
      [...numberCandidates, ...ineligibleNumberCandidates].map((card) => [String(card._id), card]),
    ).values()];
    const languageCandidates = (cards: typeof allSetCandidates) =>
      cards.filter((card) => supportedLanguageOptions.includes(card.language));
    const setCandidates = languageCandidates(allSetCandidates);
    const nameCandidates = setCandidates.filter((card) =>
      normalizeCardName(card.name) === normalizeCardName(record.cardName)
      || translatedNames.get(card.sourceId)?.has(normalizeCardName(record.cardName)),
    );
    const rarityCandidates = nameCandidates.filter((card) =>
      !record.rarity.trim() || normalizeRarity(record.rarity) === normalizeRarity(card.rarity),
    );
    const exactCandidates = rarityCandidates;
    const definite = requiredFields.length === 0
      && unsupportedLanguages.length === 0
      && record.languageCandidates === undefined
      && record.language !== "zh-unknown"
      && resolvedSetIds.length === 1
      && !numberingIssue
      && exactCandidates.length === 1
      && sourceCardType(exactCandidates[0]) === "POKEMON"
      && INCLUDED.includes(exactCandidates[0].classification)
      ? exactCandidates[0]
      : null;
    const reviewCandidates = exactCandidates.length > 0
      ? exactCandidates
      : rarityCandidates.length > 0
        ? rarityCandidates
        : nameCandidates.length > 0
          ? nameCandidates
          : setCandidates.length > 0
            ? setCandidates
            : languageCandidates(allSetCandidates);
    let reason: string | null = null;
    if (unsupportedLanguages.length > 0) {
      reason = `Unsupported language ${unsupportedLanguages.join(", ")}; only ${DISPLAY_CARD_LANGUAGES.join(", ")} can be imported.`;
    } else if (record.languageCandidates !== undefined) {
      reason = `Conflicting language markers (${record.languageCandidates.join(", ")}); select a printing manually.`;
    } else if (record.language === "zh-unknown") {
      reason = "Chinese language marker does not specify Simplified or Traditional Chinese; select a printing manually.";
    } else if (requiredFields.length > 0) {
      reason = `Missing required identity field${requiredFields.length > 1 ? "s" : ""}: ${requiredFields.join(", ")}.`;
    } else if (numberCandidates.length === 0) {
      if (ineligibleNumberCandidates.length > 0) {
        reason = "Matching source card is not an eligible Pokémon special-art card; Trainer, Energy, unknown-type, and non-special-art cards cannot be imported.";
      } else {
        const setCount = resolvedSets[0];
        const number = normalizedLocalIdNumber(record.cardNumber);
        const total = setCount ? cardCountValue(setCount, "total") : undefined;
        const official = setCount ? cardCountValue(setCount, "official") : undefined;
        if (resolvedSets.length === 0 && namedSets.length === 0) {
          reason = "Set not found in the local database; no verified set alias was found.";
        } else if (resolvedSets.length === 0) {
          reason = `Set name exists, but no matching TCGdex set ID is available in ${languageOptions.join("/") || "the selected language"}.`;
        } else if (number !== undefined && total !== undefined && number > total) {
          reason = `Card number ${primaryLocalId} exceeds TCGdex cardCount.total (${total}); no card with this localId was found.`;
        } else if (number !== undefined && official !== undefined && total === undefined && number > official) {
          reason = `TCGdex cardCount.total is unavailable to validate localId ${primaryLocalId} above official (${official}).`;
        } else {
          reason = "Card number not found in the selected TCGdex set and language.";
        }
      }
    } else if (nameCandidates.length === 0) {
      reason = "Card name not found among cards with this number in the selected set.";
    } else if (rarityCandidates.length === 0) {
      reason = "Rarity mismatch for this card, set, and number.";
    } else if (resolvedSetIds.length > 1) {
      reason = "Multiple TCGdex set IDs match the supplied set name; select the correct printing manually.";
    } else if (exactCandidates.length > 1) {
      reason = "Multiple possible matches; select the correct printing manually.";
    } else if (exactCandidates.length === 1 && sourceCardType(exactCandidates[0]) !== "POKEMON") {
      reason = "Card identity matches, but the source card category is not Pokémon.";
    } else if (exactCandidates.length === 1 && !INCLUDED.includes(exactCandidates[0].classification)) {
      reason = "Card identity matches, but its Special Art classification needs manual review before import.";
    }
    const hasReviewableCandidate = reviewCandidates.some((card) => {
      const cardType = sourceCardType(card);
      return cardType === "POKEMON" || cardType === "UNKNOWN";
    });
    const status = definite
      ? "matched"
      : unsupportedLanguages.length > 0
        ? "unmatched"
        : record.languageCandidates !== undefined || record.language === "zh-unknown" || requiredFields.length > 0
        || (reviewCandidates.length > 0 && hasReviewableCandidate)
        ? "needs-review"
        : "unmatched";
    if (numberingIssue && reason === null) {
      reason = "The localId or printed denominator conflicts with this set's TCGdex cardCount; verify the candidate manually.";
    }
    const explanation = definite
      ? `Matched ${record.language} printing by TCGdex set ID, localId, card name${record.rarity ? ", and rarity" : ""}${usingVerifiedSetAlias ? " using a verified shared TCGdex set ID" : ""}.`
      : reason;
    const match = definite
      ? {
        cardId: String(definite._id),
        confidence: record.rarity ? "exact-identity" : "identity-without-rarity",
        confidenceScore: record.rarity ? 100 : 96,
        explanation,
      }
      : null;
    console.info("[Collectr TCGdex lookup]", JSON.stringify({
      recordIndex: index,
      cardName: record.cardName,
      setInput: record.setName,
      language: record.language,
      languageCandidates: supportedLanguageOptions,
      unsupportedLanguages,
      resolvedSets: cardCountDiagnostics,
      setResolution: usingVerifiedSetAlias ? "verified-shared-tcgdex-id" : "exact-language-set-name",
      collectedCardNumber: record.cardNumber,
      extractedLocalId: normalizedLocalId,
      cardsInSetAtLocalId: [...numberCandidates, ...ineligibleNumberCandidates].map((card) => ({
        id: card.sourceId,
        name: card.name,
        setId: card.setId,
        localId: card.localId,
        rarity: card.rarity,
        language: card.language,
      })),
      nameMatches: nameCandidates.map((card) => card.sourceId),
      rarityMatches: rarityCandidates.map((card) => card.sourceId),
      decision: status,
      reason: explanation,
    }));
    return {
      index,
      record,
      candidates: reviewCandidates.map((card) => {
        const ineligibleReason = collectrCandidateEligibilityReason(card, record);
        const candidateLanguageScore = supportedLanguageOptions.includes(card.language)
          ? supportedLanguageOptions.length === 1 ? 20 : 10
          : 0;
        const candidateSetScore = resolvedSetIds.includes(card.setId) ? 25 : 0;
        const candidateNumberScore = cardNumberVariants(record.cardNumber).includes(card.localId) ? 30 : 0;
        const candidateNameScore = nameCandidates.some((candidate) => String(candidate._id) === String(card._id)) ? 20 : 0;
        const candidateRarityScore = record.rarity.trim()
          && normalizeRarity(record.rarity) === normalizeRarity(card.rarity)
          ? 5
          : 0;
        const suggestionReason = candidateLanguageScore === 0
          ? "Language does not match the requested printing."
          : candidateSetScore === 0
            ? "Set identity differs from the selected TCGdex set."
            : candidateNumberScore === 0
              ? "Card number differs from the requested localId."
              : candidateNameScore === 0
                ? "Set and card number match, but the card name differs. Verify this candidate manually."
                : candidateRarityScore === 0 && record.rarity.trim()
                  ? "Set, number, and name match, but rarity differs. Verify this candidate manually."
                  : ineligibleReason ?? "Identity fields match; choose this candidate only after visual review.";
        return {
          ...card,
          eligibleForImport: ineligibleReason === null,
          ineligibleReason,
          confidenceScore: Math.min(100, candidateLanguageScore + candidateSetScore + candidateNumberScore + candidateNameScore + candidateRarityScore),
          suggestionReason,
        };
      }).sort((left, right) => (right.confidenceScore ?? 0) - (left.confidenceScore ?? 0)),
      match,
      status,
      reason: explanation,
      automaticStatus: status,
      automaticMatch: match,
    };
  });
  const recordKeys = [...new Set(previews.flatMap((item) => collectrRecordKeyVariants(item.record as CollectrRecord)))];
  const savedOverrides = recordKeys.length > 0
    ? await CollectrMatchOverride.find({ recordKey: { $in: recordKeys } })
      .select("recordKey card updatedAt")
      .lean()
    : [];
  const overrideByKey = new Map(savedOverrides.map((item) => [item.recordKey, item]));
  const overrideCards = savedOverrides.length > 0
    ? await Card.find({ _id: { $in: savedOverrides.map((item) => item.card) } })
      .select("_id sourceId name setName setId localId rarity language classification image cardType")
      .lean()
    : [];
  const overrideCardById = new Map(overrideCards.map((card) => [String(card._id), card]));
  for (const item of previews) {
    const record = item.record as CollectrRecord;
    if (!recordLanguageOptions(record).every(isDisplayCardLanguage)) continue;
    const override = collectrRecordKeyVariants(record)
      .map((key) => overrideByKey.get(key))
      .find(Boolean);
    const card = override ? overrideCardById.get(String(override.card)) : undefined;
    if (!override || !card || !isEligiblePokemonCard(card) || !matchesRecordLanguage(record, card.language)) continue;
    item.manualDecision = {
      cardId: String(card._id),
      ignored: false,
      source: "manual",
      updatedAt: override.updatedAt,
    };
    item.selectedCard = card;
    item.status = "matched";
    item.match = {
      cardId: String(card._id),
      confidence: "manual",
      confidenceScore: 100,
      explanation: "Matched to a previously approved manual printing selection.",
    };
    item.reason = item.match.explanation;
  }
  const history = await ImportHistory.create({
    source: "collectr",
    status: "previewed",
    originalText: text,
    records: previews,
  });
  res.json({
    importId: history.id,
    records: previews,
    summary: {
      recordsDetected: previews.length,
      matched: previews.filter((item) => item.status === "matched").length,
      needsReview: previews.filter((item) => item.status === "needs-review").length,
      unmatched: previews.filter((item) => item.status === "unmatched").length,
      ignoredLines: parsed.ignoredLines,
      inputLines: parsed.inputLines,
    },
  });
}));

router.get("/collectr/cards/search", asyncRoute(async (req, res) => {
  const query = typeof req.query.q === "string" ? req.query.q.trim().slice(0, 100) : "";
  const language = typeof req.query.language === "string" ? req.query.language.trim().slice(0, 50) : "en";
  const languageOptions = [...new Set(language.split(",").flatMap((item) => matchingLanguages(item.trim()) ?? [item.trim()]).filter(Boolean))];
  if (query.length < 2) {
    res.status(400).json({ error: "Search term must contain at least two characters." });
    return;
  }
  if (languageOptions.length === 0 || languageOptions.some((item) => !isDisplayCardLanguage(item))) {
    res.json([]);
    return;
  }
  const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const cards = await Card.find({
    language: { $in: languageOptions },
    $or: ["name", "setName", "setId", "localId"].map((field) => ({ [field]: { $regex: escaped, $options: "i" } })),
  })
    .select("_id name setName setId localId rarity language classification image cardType category sourceData")
    .sort({ setName: 1, localId: 1 })
    .limit(20)
    .lean();
  res.json(cards.map((card) => {
    const ineligibleReason = collectrCandidateEligibilityReason(card);
    return {
      ...card,
      eligibleForImport: ineligibleReason === null,
      ineligibleReason,
    };
  }));
}));

router.get("/collectr/history", asyncRoute(async (_req, res) => {
  const imports = await ImportHistory.find()
    .select("source status createdAt completedAt error records")
    .sort({ createdAt: -1 })
    .limit(50)
    .lean();
  res.json(imports.map((item) => {
    const records = item.records as Array<{ status?: string; record?: CollectrRecord }>;
    const visibleRecords = records.filter((record) => !record.record || recordLanguageOptions(record.record).every(isDisplayCardLanguage));
    return {
      _id: String(item._id),
      source: item.source,
      status: item.status,
      createdAt: item.createdAt,
      completedAt: item.completedAt,
      error: item.error,
      summary: {
        records: records.length,
        matched: visibleRecords.filter((record) => record.status === "matched").length,
        needsReview: visibleRecords.filter((record) => record.status === "needs-review").length,
        unmatched: records.length - visibleRecords.filter((record) => record.status !== "unmatched").length,
      },
    };
  }));
}));

router.get("/collectr/history/:importId", asyncRoute(async (req, res) => {
  if (!mongoose.Types.ObjectId.isValid(req.params.importId)) {
    res.status(400).json({ error: "Invalid import identifier." });
    return;
  }
  const history = await ImportHistory.findById(req.params.importId).lean();
  if (!history) {
    res.status(404).json({ error: "Import history not found." });
    return;
  }
  const parsedSource = parseCollectrText(history.originalText);
  const safeRecords = (history.records as unknown as Array<CollectrPreviewItem & Record<string, unknown>>).map((item) => {
    const languages = recordLanguageOptions(item.record);
    if (languages.every(isDisplayCardLanguage)) return item;
    const unsupported = languages.filter((language) => !isDisplayCardLanguage(language));
    return {
      ...item,
      candidates: [],
      selectedCard: undefined,
      status: "unmatched",
      reason: `Unsupported language ${unsupported.join(", ")}; only ${DISPLAY_CARD_LANGUAGES.join(", ")} can be imported.`,
      match: null,
      automaticStatus: "unmatched",
      automaticMatch: null,
      manualDecision: undefined,
    };
  });
  res.json({
    ...history,
    records: safeRecords,
    parseSummary: {
      ignoredLines: parsedSource.ignoredLines,
      inputLines: parsedSource.inputLines,
    },
  });
}));

router.put("/collectr/:importId/records/:recordIndex/decision", asyncRoute(async (req, res) => {
  if (!mongoose.Types.ObjectId.isValid(req.params.importId)) {
    res.status(400).json({ error: "Invalid import identifier." });
    return;
  }
  const recordIndex = Number(req.params.recordIndex);
  if (!Number.isInteger(recordIndex) || recordIndex < 0) {
    res.status(400).json({ error: "Invalid record index." });
    return;
  }
  const body = req.body as Record<string, unknown>;
  const cardId = body.cardId;
  const ignored = body.ignored;
  if (cardId !== null && cardId !== undefined && (typeof cardId !== "string" || !mongoose.Types.ObjectId.isValid(cardId))) {
    res.status(400).json({ error: "Invalid card identifier." });
    return;
  }
  if (ignored !== undefined && typeof ignored !== "boolean") {
    res.status(400).json({ error: "Ignored must be a boolean." });
    return;
  }
  if (ignored === true && cardId) {
    res.status(400).json({ error: "An ignored record cannot also select a card." });
    return;
  }

  const history = await ImportHistory.findById(req.params.importId);
  if (!history || history.status !== "previewed") {
    res.status(404).json({ error: "Only an uncommitted preview can be reviewed." });
    return;
  }
  const records = history.records as unknown as CollectrPreviewItem[];
  const current = records[recordIndex];
  if (!current) {
    res.status(404).json({ error: "Preview record not found." });
    return;
  }
  const record = current.record;
  if (!recordLanguageOptions(record).every(isDisplayCardLanguage) && cardId) {
    res.status(400).json({ error: "Collectr record language is unsupported; only en, ja, zh-cn, and zh-tw can be imported." });
    return;
  }
  const recordKey = collectrRecordKey(record);
  const recordIdentity = collectrRecordIdentity(record);
  let selectedCard: CollectrPreviewCard | undefined;
  if (cardId) {
    const card = await Card.findById(cardId)
      .select("_id sourceId name setName setId localId rarity language classification image cardType category sourceData")
      .lean();
    if (!card) {
      res.status(404).json({ error: "Selected card not found." });
      return;
    }
    if (!isEligiblePokemonCard(card)) {
      res.status(400).json({ error: "Selected card is not an eligible Pokémon special-art card." });
      return;
    }
    if (!isDisplayCardLanguage(card.language)) {
      res.status(400).json({ error: "Selected card language is not supported for display or import." });
      return;
    }
    if (!matchesRecordLanguage(record, card.language)) {
      res.status(400).json({ error: "Selected card language does not match the explicit Collectr language." });
      return;
    }
    await CollectrMatchOverride.findOneAndUpdate(
      { recordKey },
      {
        $set: { card: card._id, recordIdentity, source: "manual" },
      },
      { upsert: true, new: true, runValidators: true },
    );
    selectedCard = card;
  } else {
    await CollectrMatchOverride.deleteOne({ recordKey });
  }
  const manualDecision = {
    cardId: typeof cardId === "string" ? cardId : null,
    ignored: ignored === true,
    source: "manual",
    updatedAt: new Date(),
  };
  records[recordIndex] = cardId && selectedCard
    ? {
      ...current,
      selectedCard,
      status: "matched",
      match: {
        cardId: String(selectedCard._id),
        confidence: "manual",
        confidenceScore: 100,
        explanation: "Manually approved printing selection.",
      },
      reason: null,
      manualDecision,
    }
    : {
      ...current,
      selectedCard: undefined,
      status: current.automaticStatus ?? current.status,
      match: current.automaticMatch ?? null,
      reason: current.automaticMatch?.explanation ?? current.reason,
      manualDecision,
    };
  history.markModified("records");
  await history.save();
  res.json({ saved: true, recordIndex, record: records[recordIndex] });
}));

router.post("/collectr/:importId/commit", asyncRoute(async (req, res) => {
  if (!mongoose.Types.ObjectId.isValid(req.params.importId)) {
    res.status(400).json({ error: "Invalid import identifier." });
    return;
  }
  const history = await ImportHistory.findById(req.params.importId);
  if (!history || history.status !== "previewed") {
    res.status(404).json({ error: "Preview not found or already committed." });
    return;
  }
  const decisions = (req.body as Record<string, unknown>).decisions;
  if (!Array.isArray(decisions)) {
    res.status(400).json({ error: "Import decisions must be an array." });
    return;
  }

  const sourceRecords = history.records as Array<{
    index: number;
    record: CollectrRecord;
    match: { cardId: string } | null;
  }>;
  const decisionMap = new Map<number, string | null>();
  for (const decision of decisions) {
    if (
      !isObjectRecord(decision) ||
      typeof decision.index !== "number" ||
      !Number.isInteger(decision.index) ||
      decision.index < 0 ||
      decision.index >= sourceRecords.length
    ) {
      res.status(400).json({ error: "Import decision contains an invalid record index." });
      return;
    }
    if (decision.cardId !== null && (typeof decision.cardId !== "string" || !mongoose.Types.ObjectId.isValid(decision.cardId))) {
      res.status(400).json({ error: "Import decision contains an invalid card identifier." });
      return;
    }
    decisionMap.set(Number(decision.index), decision.cardId as string | null);
  }

  const selectedIds = sourceRecords
    .map((entry) => decisionMap.get(entry.index))
    .filter((cardId): cardId is string => Boolean(cardId));
  const selectedCards = await Card.find({ _id: { $in: selectedIds } })
    .select("_id language cardType category rarity image sourceData classification")
    .lean();
  const cardLanguages = new Map(selectedCards.map((card) => [String(card._id), card.language]));
  const totals = new Map<string, { cardId: string; language: string; finish: string; condition: string; quantity: number }>();
  for (const entry of sourceRecords) {
    const cardId = decisionMap.get(entry.index);
    if (!cardId) continue;
    const record = entry.record;
    const cardLanguage = cardLanguages.get(cardId);
    if (!cardLanguage) {
      res.status(400).json({ error: `Selected card for record ${entry.index + 1} does not exist.` });
      return;
    }
    const selectedCard = selectedCards.find((card) => String(card._id) === cardId);
    if (!selectedCard || !isEligiblePokemonCard(selectedCard)) {
      res.status(400).json({ error: `Selected card for record ${entry.index + 1} is not an eligible Pokémon special-art card.` });
      return;
    }
    if (!recordLanguageOptions(record).every(isDisplayCardLanguage) || !isDisplayCardLanguage(cardLanguage)) {
      res.status(400).json({ error: `Record ${entry.index + 1} uses an unsupported language; only en, ja, zh-cn, and zh-tw can be imported.` });
      return;
    }
    if (!matchesRecordLanguage(record, cardLanguage)) {
      res.status(400).json({ error: `Selected card language does not match record ${entry.index + 1}.` });
      return;
    }
    const language = cardLanguage;
    const key = `${cardId}:${language}:${record.finish}:${record.condition}`;
    const current = totals.get(key);
    totals.set(key, {
      cardId,
      language,
      finish: record.finish,
      condition: record.condition,
      quantity: (current?.quantity ?? 0) + record.quantity,
    });
  }

  const before: Array<{ key: Record<string, unknown>; document: Record<string, unknown> | null }> = [];
  try {
    const cardIds = new Set(selectedCards.map((card) => String(card._id)));
    if ([...totals.values()].some((item) => !cardIds.has(item.cardId))) {
      res.status(400).json({ error: "One or more selected cards do not exist." });
      return;
    }

    for (const item of totals.values()) {
      const key = {
        card: new mongoose.Types.ObjectId(item.cardId),
        language: item.language,
        finish: item.finish,
        condition: item.condition,
      };
      const old = await CollectionItem.findOne(key).lean();
      before.push({ key, document: old ? old as unknown as Record<string, unknown> : null });
      await CollectionItem.findOneAndUpdate(
        key,
        { $set: { quantity: item.quantity } },
        { upsert: true, new: true, runValidators: true },
      );
    }
    history.status = "completed";
    history.completedAt = new Date();
    history.records = [...history.records, { rollbackSnapshot: before }];
    await history.save();
    const selectedRecords = sourceRecords.filter((entry) => {
      const cardId = decisionMap.get(entry.index);
      return Boolean(cardId);
    }).length;
    res.json({ importedItems: totals.size, unmatchedItems: sourceRecords.length - selectedRecords });
  } catch (error) {
    const rollbackErrors: string[] = [];
    for (const snapshot of before.reverse()) {
      try {
        if (snapshot.document) {
          await CollectionItem.replaceOne(snapshot.key, snapshot.document, { upsert: true });
        } else {
          await CollectionItem.deleteOne(snapshot.key);
        }
      } catch (rollbackError) {
        rollbackErrors.push(rollbackError instanceof Error ? rollbackError.message : "Unknown rollback error");
      }
    }
    const message = error instanceof Error ? error.message : "Unknown import error";
    res.status(500).json({
      error: rollbackErrors.length > 0
        ? `Import failed: ${message}. Rollback also reported: ${rollbackErrors.join("; ")}`
        : `Import failed and previous collection values were restored: ${message}`,
    });
  }
}));

router.post("/collectr/:importId/rollback", asyncRoute(async (req, res) => {
  if (!mongoose.Types.ObjectId.isValid(req.params.importId)) {
    res.status(400).json({ error: "Invalid import identifier." });
    return;
  }
  const history = await ImportHistory.findById(req.params.importId);
  if (!history || history.status !== "completed") {
    res.status(404).json({ error: "Completed import not found." });
    return;
  }
  const snapshotEntry = history.records.find((entry) => isObjectRecord(entry) && Array.isArray(entry.rollbackSnapshot));
  if (!isObjectRecord(snapshotEntry) || !Array.isArray(snapshotEntry.rollbackSnapshot)) {
    res.status(409).json({ error: "This import has no rollback snapshot." });
    return;
  }
  const snapshot = snapshotEntry.rollbackSnapshot as Array<{
    key: Record<string, unknown>;
    document: Record<string, unknown> | null;
  }>;
  for (const item of snapshot) {
    if (item.document) await CollectionItem.replaceOne(item.key, item.document, { upsert: true });
    else await CollectionItem.deleteOne(item.key);
  }
  history.status = "rolled-back";
  await history.save();
  res.json({ rolledBack: snapshot.length });
}));

router.get("/settings", asyncRoute(async (_req, res) => {
  const [status, pokemonCount, setCount, cardCount, specialCardCount, cardCountsByLanguage, setCountsByLanguage] = await Promise.all([
    SyncStatus.findOne({ key: "main" }).lean(),
    Pokemon.countDocuments(),
    CardSet.countDocuments({ language: { $in: DISPLAY_CARD_LANGUAGES } }),
    Card.countDocuments({ language: { $in: DISPLAY_CARD_LANGUAGES } }),
    Card.countDocuments({
      ...POKEMON_SPECIAL_CARD_FILTER,
    }),
    Card.aggregate([
      { $match: { language: { $in: DISPLAY_CARD_LANGUAGES } } },
      { $group: { _id: "$language", count: { $sum: 1 } } },
    ]),
    CardSet.aggregate([
      { $match: { language: { $in: DISPLAY_CARD_LANGUAGES } } },
      { $group: { _id: "$language", count: { $sum: 1 } } },
    ]),
  ]);
  const connected = mongoose.connection.readyState === 1;
  res.json({
    database: {
      status: connected ? "connected" : "disconnected",
      databaseName: mongoose.connection.db?.databaseName ?? null,
    },
    counts: {
      pokemon: pokemonCount,
      sets: setCount,
      cards: cardCount,
      specialArtCards: specialCardCount,
      byLanguage: {
        cards: Object.fromEntries(cardCountsByLanguage.map((item) => [item._id || "en", item.count])),
        sets: Object.fromEntries(setCountsByLanguage.map((item) => [item._id || "en", item.count])),
      },
    },
    tcgDexLanguages: DISPLAY_CARD_LANGUAGES,
    sources: {
      pokeApi: status?.pokemonStatus ?? (pokemonCount > 0 ? "completed" : "idle"),
      tcgDex: status?.tcgDexStatus ?? (cardCount > 0 ? "completed" : "idle"),
    },
    lastSyncAt: status?.lastSuccessfulAt ?? null,
    sync: displaySyncStatus(status) ?? {
      status: "idle",
      pokemonProcessed: 0,
      pokemonTotal: 0,
      cardsProcessed: 0,
      cardsTotal: 0,
      setsProcessed: 0,
      setsTotal: 0,
      pokemonStatus: "idle",
      tcgDexStatus: "idle",
      completedSetIds: [],
    },
  });
}));

router.get("/settings/preferences", asyncRoute(async (_req, res) => {
  const preferences = await UserSettings.findOneAndUpdate(
    { key: "local" },
    { $setOnInsert: { key: "local", defaultSort: "nationalDex", view: "grid", filters: {}, theme: "light" } },
    { upsert: true, new: true },
  ).lean();
  res.json({ ...preferences, filters: displaySafeFilters(isObjectRecord(preferences?.filters) ? preferences.filters : {}) });
}));

router.put("/settings/preferences", asyncRoute(async (req, res) => {
  const body = req.body as Record<string, unknown>;
  const updates: Record<string, unknown> = {};
  if (body.filters !== undefined) {
    if (!isObjectRecord(body.filters)) {
      res.status(400).json({ error: "Filters must be an object." });
      return;
    }
    updates.filters = displaySafeFilters(body.filters);
  }
  if (body.theme !== undefined) {
    if (body.theme !== "light" && body.theme !== "dark") {
      res.status(400).json({ error: "Theme must be either light or dark." });
      return;
    }
    updates.theme = body.theme;
  }
  if (Object.keys(updates).length === 0) {
    res.status(400).json({ error: "Provide a supported preference to update." });
    return;
  }
  const saved = await UserSettings.findOneAndUpdate(
    { key: "local" },
    { $set: updates },
    { upsert: true, new: true, runValidators: true },
  ).lean();
  res.json(saved);
}));

export default router;
