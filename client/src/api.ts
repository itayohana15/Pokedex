export interface PokemonEntry {
  _id: string;
  nationalDex: number;
  name: string;
  image: string;
  artwork: string;
  types: string[];
  generation: number;
  totalCards: number;
  ownedCards: number;
  progress: number;
  collectionStatus: "owned" | "missing" | "completed";
}

export interface CardEntry {
  _id: string;
  sourceId: string;
  name: string;
  image: string;
  setName: string;
  setId: string;
  localId: string;
  rarity: string;
  classification: string;
  cardType?: string;
  eligibleForImport?: boolean;
  ineligibleReason?: string | null;
  confidenceScore?: number;
  suggestionReason?: string;
  artist: string;
  language: string;
  pokemonInfo?: Array<{
    nationalDex: number;
    name: string;
    generation: number;
    types: string[];
    totalCards?: number;
    ownedCards?: number;
    progress?: number;
  }>;
  variants?: Record<string, boolean>;
  collection?: Array<{ quantity: number; condition: string; finish: string; language: string }>;
}

export type ClassificationReviewReason =
  | "rarity_missing"
  | "rarity_ambiguous"
  | "alternate_art_possible"
  | "full_art_possible"
  | "special_promo_possible"
  | "metadata_missing"
  | "image_missing"
  | "source_insufficient";

export interface ClassificationReviewEvidence {
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

export interface ClassificationReviewAction {
  _id?: string;
  action: "CONFIRM_SPECIAL_ART" | "MARK_NOT_SPECIAL_ART" | "KEEP_NEEDS_REVIEW" | "SKIP";
  classification?: string;
  previousClassification?: string;
  resultingClassification?: string;
  note?: string;
  actor?: string;
  createdAt: string;
}

export interface ReviewImageCandidate {
  id: string;
  source: string;
  sourceType: "official" | "community";
  sourceId: string;
  imageUrl: string;
  sourceUrl: string;
  checkedAt: string;
  confidence: number;
  confidenceReason: string;
  matchedFields: string[];
}

export interface ClassificationReviewItem extends CardEntry {
  category: string;
  cardType: string;
  artist: string;
  dexIds: number[];
  classificationReason: string;
  classificationConfidence: number;
  classificationSource: string;
  reasonGroups: ClassificationReviewReason[];
  primaryReason: ClassificationReviewReason;
  metadataCompleteness: { score: number; present: number; total: number; missingFields: string[] };
  evidenceCount: number;
  evidence: ClassificationReviewEvidence[];
  sourceUrl: string | null;
  reviewHistory: Array<ClassificationReviewAction & { applied: boolean }>;
  visualDecision?: "UNDECIDED" | "CONFIRMED" | "REJECTED";
  visuallyReviewed?: boolean;
  imageCandidates?: ReviewImageCandidate[];
}

export interface VisualReviewSummary {
  total: number;
  reviewed: number;
  unreviewed: number;
  confirmed: number;
  rejected: number;
  undecided: number;
  withImage: number;
  missingImage: number;
  byLanguage: Record<string, number>;
  options: {
    languages: Array<{ value: string; count: number }>;
    sets: Array<{ setId: string; setName: string; language: string; count: number }>;
    rarities: Array<{ value: string; count: number }>;
    pokemon: Array<{ nationalDex: number; name: string }>;
  };
}

export interface VisualReviewPage {
  items: ClassificationReviewItem[];
  pagination: { page: number; pageSize: number; total: number; pageCount: number };
  sort: string;
  reviewStatus: string;
  decision: string;
}

export interface ClassificationReviewSummary {
  total: number;
  activeCount: number;
  skippedCount: number;
  imageUrlCount: number;
  imageUrlMissing: number;
  completeMetadataCount: number;
  incompleteMetadataCount: number;
  averageClassificationConfidence: number;
  reasonGroupCounts: Record<ClassificationReviewReason, number>;
  primaryReasonCounts: Record<ClassificationReviewReason, number>;
  byLanguage: Record<string, number>;
  options: {
    languages: Array<{ value: string; count: number }>;
    sets: Array<{ setId: string; setName: string; language: string; count: number }>;
    rarities: Array<{ value: string; count: number }>;
    categories: Array<{ value: string; count: number }>;
    pokemon: Array<{ nationalDex: number; name: string }>;
    reasons: ClassificationReviewReason[];
  };
}

export interface ClassificationReviewPage {
  items: ClassificationReviewItem[];
  pagination: { page: number; pageSize: number; total: number; pageCount: number };
  sort: "evidence" | "confidence" | "completeness";
  state: "active" | "skipped" | "all";
}

export interface CollectionEntry {
  _id: string;
  quantity: number;
  language: string;
  finish: string;
  condition: string;
  card: CardEntry;
  pokemonInfo?: CardEntry["pokemonInfo"];
}

export interface DashboardStats {
  pokemonTotal: number;
  pokemonOwned: number;
  pokemonMissing: number;
  pokemonCompleted: number;
  specialCardsTotal: number;
  uniqueCardsOwned: number;
  physicalCopiesOwned: number;
  cardsMissing: number;
  completionPercent: number;
  breakdown: {
    byGeneration: Array<{ name: string; total: number; owned: number }>;
    byType: Array<{ name: string; total: number; owned: number }>;
    byClassification: Array<{ name: string; total: number; owned: number }>;
    bySet: Array<{ name: string; total: number; owned: number }>;
  };
}

export interface SettingsData {
  database: { status: "connected" | "disconnected"; databaseName: string | null };
  counts: {
    pokemon: number;
    sets: number;
    cards: number;
    specialArtCards: number;
    byLanguage: { cards: Record<string, number>; sets: Record<string, number> };
  };
  tcgDexLanguages: string[];
  sources: { pokeApi: string; tcgDex: string };
  lastSyncAt: string | null;
  sync: {
    status: string;
    pokemonStatus: string;
    pokemonProcessed: number;
    pokemonTotal: number;
    tcgDexStatus: string;
    setsProcessed: number;
    setsTotal: number;
    cardsProcessed: number;
    cardsTotal: number;
    currentSetId?: string;
    currentSetName?: string;
    currentSetLanguage?: string;
    error?: string;
    localeProgress?: Record<string, {
      status: string;
      setsProcessed: number;
      setsTotal: number;
      cardsProcessed: number;
      cardsTotal: number;
      error?: string | null;
      sourceWarnings?: string[];
    }>;
  };
}

export interface CatalogCoverageSet {
  setId: string;
  name: string;
  language: string;
  status: "FULL" | "PARTIAL" | "MISSING_DATA";
  sourceListVerified: boolean;
  official: number | null;
  total: number | null;
  sourceCardCount: number | null;
  localCardCount: number;
  missingVsTotal: number | null;
  missingSourceCardCount: number | null;
  missingSourceCardIds: string[];
  missingCardNumbers: string[];
  numericLocalIdGaps: string[];
  extraLocalCardCount: number;
  duplicateSourceCardIds: number;
  issue: string;
  checkedAt: string | null;
}

export interface CatalogCoverageLanguage {
  setCount: number;
  cardCount: number;
  fullSets: number;
  partialSets: number;
  setsMissingData: number;
  setsWithoutCards: number;
  setsMissingCount: number;
  missingVsTotal: number;
  cardsWithoutImages: number;
  cardsWithoutRarity: number;
  duplicateSourceIdGroups: number;
  duplicateLocalIdGroups: number;
  lastSyncAt: string | null;
  sets: CatalogCoverageSet[];
}

export interface CatalogCoverageData {
  checkedAt: string;
  duplicateSourceIdGroups: number;
  duplicateLocalIdGroups: number;
  byLanguage: Record<string, CatalogCoverageLanguage>;
}

export interface ImportPreviewRecord {
  index: number;
  record: {
    originalText: string;
    productName: string;
    cardName: string;
    setName: string;
    rarity: string;
    cardNumber: string;
    language: string;
    languageCandidates?: string[];
    condition: string;
    finish: string;
    quantity: number;
    marketPrice?: number;
  };
  candidates: CardEntry[];
  match: { cardId: string; confidence: string; confidenceScore?: number; explanation?: string } | null;
  automaticStatus?: "matched" | "needs-review" | "unmatched";
  automaticMatch?: ImportPreviewRecord["match"];
  selectedCard?: CardEntry;
  manualDecision?: { cardId: string | null; ignored: boolean; source?: string; updatedAt?: string };
  status: "matched" | "needs-review" | "unmatched";
  reason: string | null;
}

export interface ImportHistoryEntry {
  _id: string;
  source: string;
  status: "previewed" | "completed" | "failed" | "rolled-back";
  createdAt: string;
  completedAt?: string;
  error?: string;
  summary: { records: number; matched: number; needsReview: number; unmatched: number };
}

export interface ImportHistoryDetails extends Omit<ImportHistoryEntry, "summary"> {
  originalText: string;
  records: ImportPreviewRecord[];
  parseSummary: Pick<ImportPreview["summary"], "ignoredLines" | "inputLines">;
}

export interface CardFilterOptions {
  pokemon: Array<{ nationalDex: number; name: string }>;
  sets: string[];
  languages: string[];
  categories: string[];
}

export interface ImportPreview {
  importId: string;
  records: ImportPreviewRecord[];
  summary: {
    recordsDetected: number;
    matched: number;
    needsReview: number;
    unmatched: number;
    ignoredLines: number;
    inputLines: number;
  };
}

const API_BASE = import.meta.env.VITE_API_URL ?? "http://localhost:5000/api";

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${API_BASE}${path}`, {
      ...init,
      headers: { "Content-Type": "application/json", ...init?.headers },
    });
  } catch {
    throw new Error("Cannot connect to the API. Start the server and verify its configuration.");
  }
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const message = typeof body === "object" && body !== null && "error" in body && typeof body.error === "string"
      ? body.error
      : `Request failed with status ${response.status}.`;
    throw new Error(message);
  }
  return body as T;
}

export function imageUrl(image: string): string {
  return image ? `${image}/high.webp` : "";
}
