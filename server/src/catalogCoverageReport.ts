import { Card, Set as CardSet, SyncStatus } from "./models.js";
import { evaluateSetCoverage, type TcgSetCardSummary } from "./catalogCoverage.js";

const DISPLAY_CARD_LANGUAGES = ["en", "ja", "zh-cn", "zh-tw"] as const;

interface LocalSetCards {
  _id: { language: string; setId: string };
  cards: number;
  missingImages: number;
  missingRarity: number;
  sourceIds: string[];
  localIds: string[];
}

interface DuplicateGroup {
  _id: string;
  count: number;
}

interface CoverageSet {
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
  checkedAt: Date | null;
}

function validCount(value: unknown): number | null {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 ? value : null;
}

function numericGaps(localIds: string[], total: number | null): string[] {
  if (total === null || total > 2000 || localIds.length === 0 || !localIds.every((id) => /^\d+$/.test(id))) return [];
  const existing = new Set(localIds.map(Number));
  const gaps: string[] = [];
  for (let id = 1; id <= total; id += 1) if (!existing.has(id)) gaps.push(String(id));
  return gaps;
}

export async function buildCatalogCoverageReport() {
  const [sets, groupedCards, duplicateSourceGroups, duplicateLocalGroups, status] = await Promise.all([
    CardSet.find({ language: { $in: DISPLAY_CARD_LANGUAGES } }).select("language sourceId name cardCount sourceCardIds sourceCardNumbers catalogStatus catalogSourceChecked catalogIssue catalogCheckedAt").lean(),
    Card.aggregate<LocalSetCards>([
      { $match: { language: { $in: DISPLAY_CARD_LANGUAGES } } },
      {
        $group: {
          _id: { language: { $ifNull: ["$language", "en"] }, setId: "$setId" },
          cards: { $sum: 1 },
          missingImages: { $sum: { $cond: [{ $or: [{ $eq: ["$image", ""] }, { $eq: [{ $ifNull: ["$image", null] }, null] }] }, 1, 0] } },
          missingRarity: { $sum: { $cond: [{ $or: [{ $eq: ["$rarity", ""] }, { $eq: [{ $ifNull: ["$rarity", null] }, null] }] }, 1, 0] } },
          sourceIds: { $addToSet: "$sourceId" },
          localIds: { $addToSet: "$localId" },
        },
      },
    ]),
    Card.aggregate<DuplicateGroup>([
      { $match: { language: { $in: DISPLAY_CARD_LANGUAGES } } },
      { $group: { _id: { language: { $ifNull: ["$language", "en"] }, sourceId: "$sourceId" }, count: { $sum: 1 } } },
      { $match: { count: { $gt: 1 } } },
      { $group: { _id: "$_id.language", count: { $sum: 1 } } },
    ]),
    Card.aggregate<DuplicateGroup>([
      { $match: { language: { $in: DISPLAY_CARD_LANGUAGES } } },
      { $group: { _id: { language: { $ifNull: ["$language", "en"] }, setId: "$setId", localId: "$localId" }, count: { $sum: 1 } } },
      { $match: { count: { $gt: 1 } } },
      { $group: { _id: "$_id.language", count: { $sum: 1 } } },
    ]),
    SyncStatus.findOne({ key: "main" }).lean(),
  ]);

  const cardsBySet = new Map(groupedCards.map((row) => [`${row._id.language}|${row._id.setId}`, row]));
  const duplicateSourcesByLanguage = new Map(duplicateSourceGroups.map((row) => [row._id, row.count]));
  const duplicateLocalsByLanguage = new Map(duplicateLocalGroups.map((row) => [row._id, row.count]));
  const byLanguage: Record<string, {
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
    lastSyncAt: Date | null;
    sets: CoverageSet[];
  }> = {};

  for (const set of sets) {
    const language = set.language || "en";
    const cards = cardsBySet.get(`${language}|${set.sourceId}`);
    const localSourceIds = cards?.sourceIds.map(String) ?? [];
    const localIds = cards?.localIds.map(String) ?? [];
    const localCardCount = cards?.cards ?? 0;
    const official = validCount((set.cardCount as Record<string, unknown> | undefined)?.official);
    const total = validCount((set.cardCount as Record<string, unknown> | undefined)?.total);
    const sourceListVerified = set.catalogSourceChecked === true && Array.isArray(set.sourceCardIds);
    let coverage: CoverageSet["status"];
    let sourceCardCount: number | null = null;
    let missingSourceCardIds: string[] = [];
    let missingCardNumbers: string[] = [];
    let extraLocalCardCount = 0;
    let duplicateSourceCardIds = 0;
    let issue = set.catalogIssue || "";

    if (sourceListVerified) {
      const sourceCardIds = set.sourceCardIds ?? [];
      const sourceNumbers = (set as typeof set & { sourceCardNumbers?: string[] }).sourceCardNumbers ?? [];
      const sourceCards: TcgSetCardSummary[] = sourceCardIds.map((id, index) => ({ id, localId: sourceNumbers[index] }));
      const result = evaluateSetCoverage({
        detailAvailable: true,
        expectedTotal: total,
        sourceCards,
        localCardIds: localSourceIds,
        localCardNumbers: localIds,
      });
      coverage = result.status;
      sourceCardCount = result.sourceCardCount;
      missingSourceCardIds = result.missingSourceCardIds;
      missingCardNumbers = result.missingCardNumbers;
      extraLocalCardCount = result.extraLocalCardIds.length;
      duplicateSourceCardIds = result.duplicateSourceCardIds;
      issue = result.issue;
    } else if (set.catalogStatus === "MISSING_DATA" && set.catalogCheckedAt) {
      coverage = "MISSING_DATA";
      issue ||= "TCGdex set detail is unavailable or did not provide a usable card list.";
    } else if (total === null) {
      coverage = "MISSING_DATA";
      issue ||= "TCGdex cardCount.total is unavailable; source detail has not yet been compared.";
    } else if (total > 0 && localCardCount === 0) {
      coverage = "MISSING_DATA";
      issue ||= "No cards are saved locally for a set that reports cards.";
    } else if (localCardCount !== total) {
      coverage = "PARTIAL";
      issue ||= `Local card count is ${localCardCount}; TCGdex cardCount.total is ${total}.`;
    } else {
      coverage = "FULL";
      issue = "Count matches TCGdex cardCount.total; individual source card IDs have not been rechecked yet.";
    }

    const row: CoverageSet = {
      setId: set.sourceId,
      name: set.name,
      language,
      status: coverage,
      sourceListVerified,
      official,
      total,
      sourceCardCount,
      localCardCount,
      missingVsTotal: total === null ? null : Math.max(0, total - localCardCount),
      missingSourceCardCount: sourceCardCount === null ? null : missingSourceCardIds.length,
      missingSourceCardIds: missingSourceCardIds.slice(0, 50),
      missingCardNumbers: (missingCardNumbers.length > 0 ? missingCardNumbers : numericGaps(localIds, total)).slice(0, 50),
      numericLocalIdGaps: sourceListVerified ? [] : numericGaps(localIds, total).slice(0, 50),
      extraLocalCardCount,
      duplicateSourceCardIds,
      issue,
      checkedAt: set.catalogCheckedAt ?? null,
    };
    const lang = byLanguage[language] ?? (byLanguage[language] = {
      setCount: 0,
      cardCount: 0,
      fullSets: 0,
      partialSets: 0,
      setsMissingData: 0,
      setsWithoutCards: 0,
      setsMissingCount: 0,
      missingVsTotal: 0,
      cardsWithoutImages: 0,
      cardsWithoutRarity: 0,
      duplicateSourceIdGroups: duplicateSourcesByLanguage.get(language) ?? 0,
      duplicateLocalIdGroups: duplicateLocalsByLanguage.get(language) ?? 0,
      lastSyncAt: null,
      sets: [],
    });
    lang.setCount += 1;
    lang.cardCount += localCardCount;
    if (coverage === "FULL") lang.fullSets += 1;
    if (coverage === "PARTIAL") lang.partialSets += 1;
    if (coverage === "MISSING_DATA") lang.setsMissingData += 1;
    if (localCardCount === 0) lang.setsWithoutCards += 1;
    if (total === null) lang.setsMissingCount += 1;
    if (total !== null) lang.missingVsTotal += Math.max(0, total - localCardCount);
    lang.cardsWithoutImages += cards?.missingImages ?? 0;
    lang.cardsWithoutRarity += cards?.missingRarity ?? 0;
    lang.sets.push(row);
  }

  const localeProgress = (status?.localeProgress ?? {}) as Record<string, { completedAt?: Date; lastSetSync?: { completedAt?: Date } }>;
  for (const [language, report] of Object.entries(byLanguage)) {
    const langProgress = localeProgress[language];
    const languageSyncDate = langProgress?.completedAt ? new Date(langProgress.completedAt) : null;
    const setSyncDate = langProgress?.lastSetSync?.completedAt ? new Date(langProgress.lastSetSync.completedAt) : null;
    const legacySyncDate = language === "en" && status?.lastSuccessfulAt ? new Date(status.lastSuccessfulAt) : null;
    const dates = [languageSyncDate, setSyncDate, legacySyncDate].filter((value): value is Date => value !== null);
    report.lastSyncAt = dates.length ? new Date(Math.max(...dates.map((date) => date.getTime()))) : null;
    report.sets.sort((left, right) => left.status.localeCompare(right.status) || left.name.localeCompare(right.name));
  }

  return {
    checkedAt: new Date(),
    byLanguage,
    duplicateSourceIdGroups: duplicateSourceGroups.reduce((sum, row) => sum + row.count, 0),
    duplicateLocalIdGroups: duplicateLocalGroups.reduce((sum, row) => sum + row.count, 0),
  };
}
