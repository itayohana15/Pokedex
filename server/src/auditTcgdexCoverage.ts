import "./config.js";
import mongoose from "mongoose";
import { evaluateSetCoverage, type TcgSetCardSummary } from "./catalogCoverage.js";
import { fetchTcgDexSetDetail, fetchTcgDexSetSummaries, TCGDEX_LANGUAGES, type TcgDexLanguage } from "./integrations.js";
import { Card, Set as CardSet, SyncStatus } from "./models.js";

const CORE_LANGUAGES: TcgDexLanguage[] = ["en", "ja", "zh-cn", "zh-tw", "ko"];
const selectedLanguages = process.argv.includes("--all-languages")
  ? [...TCGDEX_LANGUAGES]
  : CORE_LANGUAGES;
const fetchSource = process.argv.includes("--source");
const applyCoverage = process.argv.includes("--apply-coverage");
if (applyCoverage && !fetchSource) {
  throw new Error("--apply-coverage requires --source so only live TCGdex metadata is recorded.");
}

async function mapLimit<T, R>(values: T[], limit: number, mapper: (value: T) => Promise<R>): Promise<R[]> {
  const output = new Array<R>(values.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(limit, values.length) }, async () => {
    while (true) {
      const index = next++;
      if (index >= values.length) return;
      output[index] = await mapper(values[index]);
    }
  }));
  return output;
}

function validCount(value: unknown): number | null {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 ? value : null;
}

await mongoose.connect(process.env.MONGODB_URI!, { serverSelectionTimeoutMS: 10_000 });
try {
  const [localSets, allCards, syncStatus] = await Promise.all([
    CardSet.find({ language: { $in: selectedLanguages } }).select("language sourceId name cardCount sourceCardIds sourceCardNumbers catalogSourceChecked catalogStatus catalogIssue catalogCheckedAt").lean(),
    Card.find({ language: { $in: selectedLanguages } }).select("language sourceId setId localId image rarity").lean(),
    SyncStatus.findOne({ key: "main" }).lean(),
  ]);
  const setsByLanguage = new Map<string, typeof localSets>();
  for (const set of localSets) setsByLanguage.set(set.language, [...(setsByLanguage.get(set.language) ?? []), set]);
  const cardsBySet = new Map<string, typeof allCards>();
  const cardStatsByLanguage = new Map<string, { cards: number; missingImages: number; missingRarity: number }>();
  const duplicateSourceIds = new Map<string, number>();
  const duplicateLocalIds = new Map<string, number>();
  const sourceKeys = new Map<string, number>();
  const localKeys = new Map<string, number>();
  for (const card of allCards) {
    const language = card.language || "en";
    const setKey = `${language}|${card.setId}`;
    const setCards = cardsBySet.get(setKey) ?? [];
    setCards.push(card);
    cardsBySet.set(setKey, setCards);
    const stats = cardStatsByLanguage.get(language) ?? { cards: 0, missingImages: 0, missingRarity: 0 };
    stats.cards += 1;
    if (!card.image) stats.missingImages += 1;
    if (!card.rarity) stats.missingRarity += 1;
    cardStatsByLanguage.set(language, stats);
    const sourceKey = `${language}|${card.sourceId}`;
    const localKey = `${language}|${card.setId}|${card.localId}`;
    sourceKeys.set(sourceKey, (sourceKeys.get(sourceKey) ?? 0) + 1);
    localKeys.set(localKey, (localKeys.get(localKey) ?? 0) + 1);
  }
  for (const [key, count] of sourceKeys) if (count > 1) duplicateSourceIds.set(key.split("|")[0], (duplicateSourceIds.get(key.split("|")[0]) ?? 0) + 1);
  for (const [key, count] of localKeys) if (count > 1) duplicateLocalIds.set(key.split("|")[0], (duplicateLocalIds.get(key.split("|")[0]) ?? 0) + 1);

  const byLanguage: Record<string, unknown> = {};
  for (const language of selectedLanguages) {
    const localSetList = setsByLanguage.get(language) ?? [];
    const setMap = new Map(localSetList.map((set) => [set.sourceId, set]));
    const summaries = fetchSource ? await fetchTcgDexSetSummaries(language) : localSetList.map((set) => ({
      id: set.sourceId,
      name: set.name,
      cardCount: set.cardCount as Record<string, number> | undefined,
    }));
    const namesById = new Map<string, string[]>();
    for (const summary of summaries) namesById.set(summary.id, [...(namesById.get(summary.id) ?? []), summary.name]);
    const duplicateSetIds = [...namesById.entries()].filter(([, names]) => names.length > 1).map(([id, names]) => ({ id, names }));
    const uniqueSummaries = [...new Map(summaries.map((summary) => [summary.id, summary])).values()];
    const sourceSetIds = new Set(uniqueSummaries.map((set) => set.id));
    const sourceResults = await mapLimit(uniqueSummaries, 3, async (summary) => {
      const localSet = setMap.get(summary.id);
      const localCards = cardsBySet.get(`${language}|${summary.id}`) ?? [];
      const expectedTotal = validCount(summary.cardCount?.total ?? (localSet?.cardCount as Record<string, unknown> | undefined)?.total);
      if (fetchSource) {
        try {
          const detail = await fetchTcgDexSetDetail(language, summary.id);
          const sourceCards = detail.cards ?? [];
          const coverage = evaluateSetCoverage({
            detailAvailable: true,
            expectedTotal: validCount(detail.cardCount?.total),
            sourceCards,
            localCardIds: localCards.map((card) => card.sourceId),
            localCardNumbers: localCards.map((card) => card.localId),
          });
          return {
            setId: summary.id,
            name: detail.name,
            status: coverage.status,
            official: validCount(detail.cardCount?.official),
            total: validCount(detail.cardCount?.total),
            sourceCardCount: coverage.sourceCardCount,
            localCardCount: coverage.localCardCount,
            missingSourceCardCount: coverage.missingSourceCardIds.length,
            missingSourceCardIds: coverage.missingSourceCardIds.slice(0, 30),
            missingCardNumbers: coverage.missingCardNumbers.slice(0, 30),
            extraLocalCardCount: coverage.extraLocalCardIds.length,
            duplicateSourceCardIds: coverage.duplicateSourceCardIds,
            sourceCardIds: coverage.sourceCardIds,
            sourceCardNumbers: coverage.sourceCardNumbers,
            sourceListVerified: true,
            issue: coverage.issue,
            checkedAt: new Date().toISOString(),
          };
        } catch (error) {
          return {
            setId: summary.id,
            name: summary.name,
            status: "MISSING_DATA",
            official: validCount(summary.cardCount?.official),
            total: expectedTotal,
            sourceCardCount: null,
            localCardCount: localCards.length,
            missingSourceCardCount: null,
            missingSourceCardIds: [],
            missingCardNumbers: [],
            extraLocalCardCount: 0,
            duplicateSourceCardIds: 0,
            sourceCardIds: null,
            sourceCardNumbers: null,
            sourceListVerified: false,
            issue: error instanceof Error ? error.message : String(error),
            checkedAt: new Date().toISOString(),
          };
        }
      }
      const sourceCardIds = localSet && Array.isArray((localSet as { sourceCardIds?: string[] }).sourceCardIds)
        ? (localSet as { sourceCardIds?: string[] }).sourceCardIds ?? []
        : [];
      const sourceCardNumbers = localSet && Array.isArray((localSet as { sourceCardNumbers?: string[] }).sourceCardNumbers)
        ? (localSet as { sourceCardNumbers?: string[] }).sourceCardNumbers ?? []
        : [];
      const sourceCards: TcgSetCardSummary[] = sourceCardIds.map((id, index) => ({ id, localId: sourceCardNumbers[index] }));
      const sourceListVerified = localSet && (localSet as { catalogSourceChecked?: boolean }).catalogSourceChecked === true;
      const coverage = sourceListVerified
        ? evaluateSetCoverage({ detailAvailable: true, expectedTotal, sourceCards, localCardIds: localCards.map((card) => card.sourceId), localCardNumbers: localCards.map((card) => card.localId) })
        : null;
      const count = localCards.length;
      const storedStatus = localSet && (localSet as { catalogStatus?: string; catalogCheckedAt?: Date }).catalogStatus === "MISSING_DATA"
        && Boolean((localSet as { catalogCheckedAt?: Date }).catalogCheckedAt) ? "MISSING_DATA" : null;
      const status = coverage?.status ?? storedStatus ?? (expectedTotal === null || (expectedTotal > 0 && count === 0)
        ? "MISSING_DATA"
        : count === expectedTotal ? "FULL" : "PARTIAL");
      return {
        setId: summary.id,
        name: summary.name,
        status,
        official: validCount(summary.cardCount?.official),
        total: expectedTotal,
        sourceCardCount: coverage?.sourceCardCount ?? null,
        localCardCount: count,
        missingSourceCardCount: coverage ? coverage.missingSourceCardIds.length : null,
        missingSourceCardIds: coverage?.missingSourceCardIds.slice(0, 30) ?? [],
        missingCardNumbers: coverage?.missingCardNumbers.slice(0, 30) ?? [],
        extraLocalCardCount: coverage?.extraLocalCardIds.length ?? 0,
        duplicateSourceCardIds: coverage?.duplicateSourceCardIds ?? 0,
        sourceCardIds: coverage?.sourceCardIds ?? null,
        sourceCardNumbers: coverage?.sourceCardNumbers ?? null,
        sourceListVerified: Boolean(sourceListVerified),
        issue: coverage?.issue ?? (storedStatus ? (localSet as { catalogIssue?: string }).catalogIssue ?? "TCGdex source detail is unavailable." : count === expectedTotal ? "Count matches; source card IDs have not been checked." : `Local card count is ${count}; TCGdex cardCount.total is ${expectedTotal ?? "missing"}.`),
        checkedAt: localSet?.catalogCheckedAt?.toISOString?.() ?? null,
      };
    });
    const localCardStats = cardStatsByLanguage.get(language) ?? { cards: 0, missingImages: 0, missingRarity: 0 };
    const fullSets = sourceResults.filter((set) => set.status === "FULL").length;
    const partialSets = sourceResults.filter((set) => set.status === "PARTIAL").length;
    const missingDataSets = sourceResults.filter((set) => set.status === "MISSING_DATA").length;
    const total = sourceResults.reduce((sum, set) => sum + (typeof set.total === "number" ? set.total : 0), 0);
    const localCardCount = sourceResults.reduce((sum, set) => sum + set.localCardCount, 0);
    const missingSourceCards = sourceResults.reduce((sum, set) => sum + (set.missingSourceCardCount ?? 0), 0);
    if (applyCoverage) {
      const operations = sourceResults.flatMap((row) => {
        if (!setMap.has(row.setId)) return [];
        const update: Record<string, unknown> = {
          catalogStatus: row.status,
          catalogSourceChecked: row.sourceListVerified,
          catalogIssue: row.issue,
          catalogCheckedAt: row.checkedAt ? new Date(row.checkedAt) : new Date(),
        };
        if (row.sourceListVerified) {
          update.sourceCardIds = row.sourceCardIds ?? [];
          update.sourceCardNumbers = row.sourceCardNumbers ?? [];
        }
        return [{ updateOne: {
          filter: { sourceId: row.setId, language },
          update: { $set: update },
        } }];
      });
      if (operations.length > 0) await CardSet.bulkWrite(operations, { ordered: false });
    }
    const incompleteSets = sourceResults.filter((set) => set.status !== "FULL");
    byLanguage[language] = {
      sourceSetCount: uniqueSummaries.length,
      localSetCount: localSetList.length,
      sourceSetsMissingLocally: uniqueSummaries.filter((set) => !setMap.has(set.id)).map((set) => ({ setId: set.id, name: set.name })),
      localSetsAbsentFromSource: localSetList.filter((set) => !sourceSetIds.has(set.sourceId)).map((set) => ({ setId: set.sourceId, name: set.name })),
      duplicateSetIds,
      fullSets,
      partialSets,
      missingDataSets,
      setsWithoutCards: sourceResults.filter((set) => set.localCardCount === 0).length,
      incompleteSetCount: incompleteSets.length,
      expectedCardsByTotal: total,
      localCards: localCardCount,
      cardsBelowSetTotals: Math.max(0, total - localCardCount),
      missingSourceCards,
      cardsWithoutImages: localCardStats.missingImages,
      cardsWithoutRarity: localCardStats.missingRarity,
      duplicateSourceIdGroups: duplicateSourceIds.get(language) ?? 0,
      duplicateLocalIdGroups: duplicateLocalIds.get(language) ?? 0,
      lastSyncAt: (syncStatus?.localeProgress as Record<string, { completedAt?: Date }> | undefined)?.[language]?.completedAt ?? syncStatus?.lastSuccessfulAt ?? null,
      sets: incompleteSets.slice(0, 20).map(({ sourceCardIds: _ids, sourceCardNumbers: _numbers, ...set }) => set),
    };
  }
  console.log(JSON.stringify({
    checkedAt: new Date().toISOString(),
    mode: applyCoverage
      ? "live TCGdex source comparison with additive Set coverage metadata update"
      : fetchSource ? "live TCGdex source comparison (read-only)" : "MongoDB-local coverage only",
    setCoverageMetadataUpdates: applyCoverage ? localSets.length : 0,
    retryPolicy: fetchSource ? "max 3 concurrent requests; 45s timeout and up to 4 attempts per request" : undefined,
    byLanguage,
  }, null, 2));
} finally {
  await mongoose.disconnect();
}
