import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import {
  Card,
  CardClassificationOverride,
  Pokemon,
  PokemonCard,
  Set as CardSet,
  SyncStatus,
} from "./models.js";
import {
  applyClassificationOverride,
  classifyCard,
  getRelationshipReviewReason,
  getVerifiedDexIds,
} from "./classification.js";
import { evaluateSetCoverage, type TcgSetCardSummary } from "./catalogCoverage.js";

const POKE_API = "https://pokeapi.co/api/v2";
const TCGDEX_API_ROOT = "https://api.tcgdex.net/v2";
export const TCGDEX_LANGUAGES = [
  "en", "ja", "zh-cn", "zh-tw", "ko", "fr", "de", "it", "es", "es-mx",
  "pt", "pt-br", "pt-pt", "id", "th", "nl", "pl", "ru",
] as const;
export type TcgDexLanguage = typeof TCGDEX_LANGUAGES[number];
interface PokeListResponse {
  results: Array<{ name: string; url: string }>;
}

interface PokeDetail {
  id: number;
  name: string;
  types: Array<{ slot: number; type: { name: string } }>;
  sprites: {
    front_default: string | null;
    other?: { "official-artwork"?: { front_default: string | null } };
  };
}

export interface TcgSetSummary {
  id: string;
  name: string;
  logo?: string;
  cardCount?: Record<string, number>;
}

export interface TcgSetDetail extends TcgSetSummary {
  cardCount?: Record<string, number>;
  cards?: TcgSetCardSummary[];
}

interface TcgCard {
  id: string;
  name: string;
  image?: string;
  localId: string;
  rarity?: string;
  category?: string;
  illustrator?: string;
  dexId?: number[];
  cameoDexIds?: number[];
  variants?: Record<string, boolean>;
  updated?: string;
  set: { id: string; name: string; logo?: string };
}

const REQUEST_TIMEOUT_MS = Number(process.env.TCGDEX_TIMEOUT_MS ?? 45_000);
const MAX_FETCH_ATTEMPTS = Number(process.env.TCGDEX_RETRIES ?? 4);
const CARD_SYNC_CONCURRENCY = 3;
const POKEMON_BATCH_SIZE = 50;
const SYNC_LOCK_TTL_MS = 120_000;

class ExternalApiStatusError extends Error {
  constructor(readonly status: number, url: string) {
    super(`External API request failed (${status}): ${url}`);
  }
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchJson<T>(url: string): Promise<T> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= MAX_FETCH_ATTEMPTS; attempt += 1) {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
      if (!response.ok) {
        throw new ExternalApiStatusError(response.status, url);
      }
      return await response.json() as T;
    } catch (error) {
      lastError = error;
      if (error instanceof ExternalApiStatusError &&
        error.status !== 408 && error.status !== 425 && error.status !== 429 && error.status < 500) {
        throw error;
      }

      if (!(error instanceof ExternalApiStatusError)) {
        try {
          return await fetchJsonWithCurl<T>(url);
        } catch (curlError) {
          lastError = new Error(
            `Node fetch failed (${error instanceof Error ? error.message : String(error)}); ` +
            `curl fallback failed (${curlError instanceof Error ? curlError.message : String(curlError)}).`,
          );
        }
      }

      if (attempt === MAX_FETCH_ATTEMPTS) break;
      const delay = error instanceof ExternalApiStatusError && error.status === 429
        ? Math.min(5_000 * attempt, 30_000)
        : Math.min(1_500 * 2 ** (attempt - 1), 20_000);
      console.warn(`External API request failed; retry ${attempt}/${MAX_FETCH_ATTEMPTS} in ${delay}ms: ${url}`);
      await wait(delay);
    }
  }
  const detail = lastError instanceof Error ? lastError.message : String(lastError);
  throw new Error(`External API request failed after ${MAX_FETCH_ATTEMPTS} attempts: ${url}. ${detail}`);
}

export async function fetchTcgDexSetSummaries(language: TcgDexLanguage): Promise<TcgSetSummary[]> {
  return fetchJson<TcgSetSummary[]>(`${TCGDEX_API_ROOT}/${language}/sets`);
}

export async function fetchTcgDexSetDetail(language: TcgDexLanguage, setId: string): Promise<TcgSetDetail> {
  return fetchJson<TcgSetDetail>(`${TCGDEX_API_ROOT}/${language}/sets/${encodeURIComponent(setId)}`);
}

function fetchJsonWithCurl<T>(url: string): Promise<T> {
  return new Promise((resolve, reject) => {
    execFile(
      "curl",
      [
        "--silent",
        "--show-error",
        "--location",
        "--max-time",
        String(Math.ceil(REQUEST_TIMEOUT_MS / 1000)),
        "--write-out",
        "\n%{http_code}",
        url,
      ],
      { encoding: "utf8", maxBuffer: 20 * 1024 * 1024 },
      (error, stdout, stderr) => {
        if (error) {
          reject(new Error(stderr.trim() || error.message));
          return;
        }
        const statusSeparator = stdout.lastIndexOf("\n");
        const status = Number(stdout.slice(statusSeparator + 1));
        if (status < 200 || status >= 300) {
          reject(new ExternalApiStatusError(status, url));
          return;
        }
        try {
          resolve(JSON.parse(stdout.slice(0, statusSeparator)) as T);
        } catch (parseError) {
          reject(parseError);
        }
      },
    );
  });
}

async function saveTcgDexCard(card: TcgCard, expectedSetId: string, savedSetId: unknown, language: TcgDexLanguage): Promise<void> {
  if (card.set.id !== expectedSetId) {
    throw new Error(`TCGdex card ${card.id} references set ${card.set.id}, expected ${expectedSetId}`);
  }
  const existing = await Card.findOne({ sourceId: card.id, language }).select("_id").lean();
  const override = existing ? await CardClassificationOverride.findOne({ card: existing._id }).lean() : null;
  const dexIds = [...new Set(card.dexId ?? [])];
  const cameoDexIds = [...new Set(card.cameoDexIds ?? [])];
  const automaticClassification = classifyCard({
    category: card.category,
    sourceCategory: card.category,
    rarity: card.rarity,
    hasArtwork: Boolean(card.image),
    name: card.name,
    setId: card.set.id,
    setName: card.set.name,
    localId: card.localId,
  });
  const classification = override
    ? applyClassificationOverride(automaticClassification, override.classification)
    : automaticClassification;
  const verifiedDexIds = getVerifiedDexIds(classification.cardType, dexIds);
  const sourceIds = [...new Set([...dexIds, ...cameoDexIds])];
  const sourcePokemon = sourceIds.length > 0
    ? await Pokemon.find({ nationalDex: { $in: sourceIds } }).select("_id nationalDex").lean()
    : [];
  const pokemonByDexId = new Map(sourcePokemon.map((item) => [item.nationalDex, item]));
  const relationshipReason = getRelationshipReviewReason(
    classification.cardType,
    dexIds,
    cameoDexIds,
    new Set(sourcePokemon.map((item) => item.nationalDex)),
  );
  const relationshipStatus = classification.cardType === "POKEMON"
    ? relationshipReason === null ? "VERIFIED" : "NEEDS_REVIEW"
    : classification.cardType === "UNKNOWN" ? "NEEDS_REVIEW" : "NOT_APPLICABLE";
  const savedCard = await Card.findOneAndUpdate(
    { sourceId: card.id, language },
    { $set: {
      sourceId: card.id,
      name: card.name,
      image: card.image ?? "",
      set: savedSetId,
      setId: card.set.id,
      setName: card.set.name,
      localId: card.localId,
      rarity: card.rarity ?? "",
      cardType: classification.cardType,
      classification: classification.classification,
      isSpecialArt: classification.isSpecialArt,
      classificationConfidence: classification.classificationConfidence,
      classificationReason: classification.classificationReason,
      classificationSource: classification.classificationSource,
      classificationReviewed: classification.classificationReviewed,
      pokemonRelationshipStatus: relationshipStatus,
      pokemonRelationshipReason: relationshipReason ?? "",
      artist: card.illustrator ?? "",
      language,
      variants: card.variants ?? {},
      dexIds,
      cameoDexIds,
      category: card.category ?? "",
      sourceData: card,
      sourceUpdatedAt: card.updated ? new Date(card.updated) : undefined,
      syncedAt: new Date(),
    } },
    { upsert: true, new: true },
  ).select("_id").lean();
  if (!savedCard) throw new Error(`Could not save TCGdex card ${card.id}`);

  await PokemonCard.updateMany(
    { card: savedCard._id },
    {
      $set: {
        verificationStatus: "NEEDS_REVIEW",
        sourceField: "legacy",
        reviewReason: "Existing relationship has not been verified against current TCGdex dexId metadata.",
      },
    },
  );
  const verifiedRelationships = verifiedDexIds.flatMap((nationalDex) => {
    const pokemon = pokemonByDexId.get(nationalDex);
    return pokemon ? [{ pokemon }] : [];
  });
  const cameoRelationships = cameoDexIds
    .filter((nationalDex) => !verifiedDexIds.includes(nationalDex))
    .flatMap((nationalDex) => {
      const pokemon = pokemonByDexId.get(nationalDex);
      return pokemon ? [{ pokemon }] : [];
    });
  const relationshipWrites = [
    ...verifiedRelationships.map(({ pokemon }) => ({
      updateOne: {
        filter: { pokemon: pokemon._id, card: savedCard._id },
        update: {
          $set: {
            verificationStatus: "VERIFIED" as const,
            sourceField: "tcgdex.dexId" as const,
            reviewReason: "",
          },
          $setOnInsert: { pokemon: pokemon._id, card: savedCard._id },
        },
        upsert: true,
      },
    })),
    ...cameoRelationships.map(({ pokemon }) => ({
      updateOne: {
        filter: { pokemon: pokemon._id, card: savedCard._id },
        update: {
          $set: {
            verificationStatus: "NEEDS_REVIEW" as const,
            sourceField: "tcgdex.cameoDexIds" as const,
            reviewReason: "Only cameoDexIds identify this Pokémon; TCGdex does not document them as primary Pokémon relationships.",
          },
        },
      },
    })),
  ];
  if (relationshipWrites.length > 0) await PokemonCard.bulkWrite(relationshipWrites, { ordered: false });
}
async function mapLimit<T, R>(
  values: T[],
  limit: number,
  mapper: (value: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(values.length);
  let nextIndex = 0;
  const workers = Array.from({ length: Math.min(limit, values.length) }, async () => {
    while (true) {
      const index = nextIndex++;
      if (index >= values.length) return;
      results[index] = await mapper(values[index], index);
    }
  });
  await Promise.all(workers);
  return results;
}

function generationForDex(id: number): number {
  if (id <= 151) return 1;
  if (id <= 251) return 2;
  if (id <= 386) return 3;
  if (id <= 493) return 4;
  if (id <= 649) return 5;
  if (id <= 721) return 6;
  if (id <= 809) return 7;
  if (id <= 905) return 8;
  return 9;
}

async function syncPokemon(): Promise<number> {
  const { results } = await fetchJson<PokeListResponse>(`${POKE_API}/pokemon?limit=1025`);
  if (results.length < 1025) {
    throw new Error(`PokeAPI returned ${results.length} Pokémon; expected at least 1,025.`);
  }
  const currentTime = new Date();
  await SyncStatus.updateOne(
    { key: "main" },
    { $set: { pokemonStatus: "running", pokemonTotal: 1025, pokemonProcessed: 0 } },
  );
  let processed = 0;
  const failures: string[] = [];

  for (let start = 0; start < 1025; start += POKEMON_BATCH_SIZE) {
    const batch = results.slice(start, start + POKEMON_BATCH_SIZE);
    const records = await mapLimit(batch, 12, async (entry) => {
      try {
        const pokemon = await fetchJson<PokeDetail>(entry.url);
        if (pokemon.id < 1 || pokemon.id > 1025) return null;
        return {
          updateOne: {
            filter: { nationalDex: pokemon.id },
            update: {
              $set: {
                nationalDex: pokemon.id,
                pokeApiId: pokemon.id,
                name: pokemon.name,
                image: pokemon.sprites.front_default ?? "",
                artwork: pokemon.sprites.other?.["official-artwork"]?.front_default ?? "",
                type1: pokemon.types[0]?.type.name ?? "",
                type2: pokemon.types[1]?.type.name ?? "",
                types: pokemon.types.sort((a, b) => a.slot - b.slot).map((item) => item.type.name),
                generation: generationForDex(pokemon.id),
                sourceData: pokemon,
                syncedAt: currentTime,
              },
            },
            upsert: true,
          },
        };
      } catch (error) {
        failures.push(`${entry.name}: ${error instanceof Error ? error.message : String(error)}`);
        return null;
      }
    });
    const operations = records.filter((record): record is NonNullable<typeof record> => record !== null);
    if (operations.length > 0) await Pokemon.bulkWrite(operations, { ordered: false });
    processed += batch.length;
    await SyncStatus.updateOne({ key: "main" }, { $set: { pokemonProcessed: processed } });
  }

  if (failures.length > 0) {
    throw new Error(`PokeAPI sync failed for ${failures.length} records: ${failures.slice(0, 10).join("; ")}`);
  }
  return processed;
}

async function syncTcgDex(
  resumeIncomplete: boolean,
  language: TcgDexLanguage = "en",
  onlySetId?: string,
): Promise<number> {
  const api = `${TCGDEX_API_ROOT}/${language}`;
  const listedSetSummaries = await fetchJson<TcgSetSummary[]>(`${api}/sets`);
  const summariesById = new Map<string, TcgSetSummary>();
  const duplicateSetIds = new Set<string>();
  for (const summary of listedSetSummaries) {
    if (summariesById.has(summary.id)) {
      duplicateSetIds.add(summary.id);
      continue;
    }
    summariesById.set(summary.id, summary);
  }
  const allSetSummaries = [...summariesById.values()];
  const setSummaries = onlySetId
    ? allSetSummaries.filter((set) => set.id === onlySetId)
    : allSetSummaries;
  if (onlySetId && setSummaries.length === 0) {
    throw new Error(`TCGdex set ${onlySetId} is not listed for language ${language}.`);
  }
  const sourceWarnings = [...duplicateSetIds].map((id) => {
    const names = listedSetSummaries.filter((summary) => summary.id === id).map((summary) => summary.name);
    const warning = `TCGdex ${language} lists source ID ${id} for multiple sets (${names.join(" / ")}); the shared detail endpoint was synchronized once.`;
    console.warn(warning);
    return warning;
  });
  const priorStatus = await SyncStatus.findOne({ key: "main" }).select("completedSetIds localeProgress").lean();
  const progressByLanguage = (priorStatus?.localeProgress ?? {}) as Record<string, { completedSetIds?: string[] }>;
  const previousLocaleProgress = progressByLanguage[language];
  const listedSetIds = new Set(allSetSummaries.map((set) => set.id));
  const completedSetIds = new Set(
    (resumeIncomplete
      ? previousLocaleProgress?.completedSetIds ?? (language === "en" ? priorStatus?.completedSetIds ?? [] : [])
      : []
    ).filter((id) => listedSetIds.has(id)),
  );
  const progressPath = onlySetId ? `localeProgress.${language}.setSync` : `localeProgress.${language}`;
  const now = new Date();
  await SyncStatus.updateOne(
    { key: "main" },
    {
      $set: {
        [progressPath]: {
          ...(onlySetId ? { setId: onlySetId } : {}),
          status: "running",
          setsTotal: setSummaries.length,
          setsProcessed: onlySetId ? 0 : completedSetIds.size,
          cardsTotal: 0,
          cardsProcessed: 0,
          ...(!onlySetId ? { completedSetIds: [...completedSetIds] } : {}),
          sourceWarnings,
          startedAt: now,
          error: null,
        },
      },
    },
  );
  await SyncStatus.updateOne(
    { key: "main" },
    {
      $set: {
        tcgDexStatus: "running",
        setsTotal: setSummaries.length,
        setsProcessed: onlySetId ? 0 : completedSetIds.size,
        cardsTotal: 0,
        cardsProcessed: 0,
        ...(onlySetId ? { currentSetId: onlySetId, currentSetLanguage: language } : { completedSetIds: [...completedSetIds] }),
      },
    },
  );

  let setFailures = 0;
  let cardFailures = 0;
  let processed = 0;
  let totalCards = 0;
  let completedSets = onlySetId ? 0 : completedSetIds.size;
  const failures: string[] = [];
  const refreshCoverage = async (detail: TcgSetDetail, setCards: TcgSetCardSummary[]) => {
    const localCards = await Card.find({ language, setId: detail.id }).select("sourceId localId").lean();
    const coverage = evaluateSetCoverage({
      detailAvailable: true,
      expectedTotal: detail.cardCount?.total,
      sourceCards: setCards,
      localCardIds: localCards.map((card) => card.sourceId),
      localCardNumbers: localCards.map((card) => card.localId),
    });
    await CardSet.updateOne(
      { sourceId: detail.id, language },
      {
        $set: {
          sourceCardIds: coverage.sourceCardIds,
          sourceCardNumbers: coverage.sourceCardNumbers,
          catalogStatus: coverage.status,
          catalogSourceChecked: true,
          catalogIssue: coverage.issue,
          catalogCheckedAt: new Date(),
        },
      },
    );
    console.info("[TCGdex set coverage]", JSON.stringify({
      language,
      setId: detail.id,
      setName: detail.name,
      official: detail.cardCount?.official ?? null,
      total: detail.cardCount?.total ?? null,
      listedCards: coverage.sourceCardCount,
      localCards: coverage.localCardCount,
      missingSourceCardIds: coverage.missingSourceCardIds,
      missingCardNumbers: coverage.missingCardNumbers,
      duplicateSourceCardIds: coverage.duplicateSourceCardIds,
      status: coverage.status,
      issue: coverage.issue,
    }));
    return coverage;
  };

  for (const summary of setSummaries) {
    try {
      const detail = await fetchJson<TcgSetDetail>(`${api}/sets/${encodeURIComponent(summary.id)}`);
      await SyncStatus.updateOne(
        { key: "main" },
        { $set: { currentSetId: detail.id, currentSetName: detail.name, currentSetLanguage: language } },
      );
      const setCards = detail.cards ?? [];
      const sourceSnapshot = evaluateSetCoverage({
        detailAvailable: true,
        expectedTotal: detail.cardCount?.total,
        sourceCards: setCards,
        localCardIds: [],
        localCardNumbers: [],
      });
      const savedSet = await CardSet.findOneAndUpdate(
        { sourceId: detail.id, language },
        { $set: {
          sourceId: detail.id,
          language,
          name: detail.name,
          logo: detail.logo ?? "",
          cardCount: detail.cardCount ?? {},
          sourceCardIds: sourceSnapshot.sourceCardIds,
          sourceCardNumbers: sourceSnapshot.sourceCardNumbers,
        } },
        { upsert: true, new: true },
      ).select("_id").lean();
      if (!savedSet) throw new Error(`Could not save TCGdex set ${detail.id}`);
      const cardIds = sourceSnapshot.sourceCardIds;
      totalCards += cardIds.length;
      const expectedCardCount = detail.cardCount?.total;
      if (typeof expectedCardCount === "number" && expectedCardCount !== cardIds.length) {
        const warning = `TCGdex ${language} set ${detail.id} (${detail.name}) lists ${cardIds.length} cards but reports cardCount.total=${expectedCardCount}.`;
        if (!sourceWarnings.includes(warning)) {
          sourceWarnings.push(warning);
          console.warn(warning);
          await SyncStatus.updateOne(
            { key: "main" },
            { $set: { [`${progressPath}.sourceWarnings`]: sourceWarnings } },
          );
        }
      }
      await SyncStatus.updateOne(
        { key: "main" },
        { $set: { cardsTotal: totalCards, [`${progressPath}.cardsTotal`]: totalCards } },
      );

      if (completedSetIds.has(detail.id) && !onlySetId) {
        processed += cardIds.length;
        await refreshCoverage(detail, setCards);
        await SyncStatus.updateOne(
          { key: "main" },
          {
            $set: {
              cardsProcessed: processed,
              setsProcessed: completedSets,
              [`${progressPath}.cardsProcessed`]: processed,
              [`${progressPath}.setsProcessed`]: completedSets,
            },
          },
        );
        continue;
      }

      const existingIds = resumeIncomplete && !onlySetId
        ? new Set(await Card.distinct("sourceId", { language, sourceId: { $in: cardIds } }))
        : new Set<string>();
      const pendingCardIds = cardIds.filter((cardId) => !existingIds.has(cardId));
      processed += cardIds.length - pendingCardIds.length;
      await SyncStatus.updateOne({ key: "main" }, { $set: { cardsProcessed: processed } });
      let failedInSet = 0;

      await mapLimit(pendingCardIds, CARD_SYNC_CONCURRENCY, async (cardId) => {
        try {
          const card = await fetchJson<TcgCard>(`${api}/cards/${encodeURIComponent(cardId)}`);
          await saveTcgDexCard(card, detail.id, savedSet._id, language);
        } catch (error) {
          failedInSet += 1;
          cardFailures += 1;
          failures.push(`${cardId}: ${error instanceof Error ? error.message : String(error)}`);
          console.error(`Could not sync TCGdex card ${cardId}:`, error);
        } finally {
          processed += 1;
          if (processed % 25 === 0 || processed === totalCards) {
            await SyncStatus.updateOne(
              { key: "main" },
              {
                $set: {
                  cardsProcessed: processed,
                  [`${progressPath}.cardsProcessed`]: processed,
                },
              },
            );
          }
        }
      });
      await refreshCoverage(detail, setCards);

      if (failedInSet === 0) {
        if (!onlySetId) {
          completedSetIds.add(detail.id);
          completedSets += 1;
          const checkpointUpdate: Record<string, unknown> = {
            [`localeProgress.${language}.completedSetIds`]: detail.id,
          };
          if (language === "en") checkpointUpdate.completedSetIds = detail.id;
          await SyncStatus.updateOne(
            { key: "main" },
            {
              $addToSet: checkpointUpdate,
              $set: {
                setsProcessed: completedSets,
                cardsProcessed: processed,
                [`${progressPath}.setsProcessed`]: completedSets,
                [`${progressPath}.cardsProcessed`]: processed,
              },
            },
          );
        } else {
          completedSets = 1;
          await SyncStatus.updateOne(
            { key: "main" },
            { $set: { setsProcessed: 1, cardsProcessed: processed, [`${progressPath}.setsProcessed`]: 1, [`${progressPath}.cardsProcessed`]: processed } },
          );
        }
      } else {
        failures.push(`Set ${detail.id} has ${failedInSet} card failures.`);
      }
    } catch (error) {
      setFailures += 1;
      const message = error instanceof Error ? error.message : String(error);
      failures.push(`Set ${summary.id}: ${message}`);
      await CardSet.updateOne(
        { sourceId: summary.id, language },
        { $set: { catalogStatus: "MISSING_DATA", catalogSourceChecked: false, catalogIssue: message, catalogCheckedAt: new Date() } },
      );
      console.error(`Could not complete TCGdex set ${summary.id}:`, error);
    }
  }

  if (setFailures > 0 || cardFailures > 0 || completedSets < setSummaries.length) {
    throw new Error(
      `TCGdex sync partially completed: ${completedSets}/${setSummaries.length} sets and ` +
      `${processed}/${totalCards} cards processed. ${setFailures} set failures, ${cardFailures} card failures. ` +
      `Progress is saved; retry TCGdex sync to continue. ${failures.slice(0, 10).join("; ")}`,
    );
  }
  await SyncStatus.updateOne(
    { key: "main" },
    {
      $set: {
        [`${progressPath}.status`]: "completed",
        [`${progressPath}.completedAt`]: new Date(),
        [`${progressPath}.cardsProcessed`]: processed,
        [`${progressPath}.setsProcessed`]: completedSets,
        [`${progressPath}.cardsTotal`]: totalCards,
        [`${progressPath}.setsTotal`]: setSummaries.length,
        [`${progressPath}.sourceWarnings`]: sourceWarnings,
        [`${progressPath}.error`]: null,
      },
    },
  );
  return processed;
}

async function acquireSyncLock() {
  const now = new Date();
  const lockOwner = randomUUID();
  try {
    const status = await SyncStatus.findOneAndUpdate(
      {
        key: "main",
        $or: [
          { status: { $ne: "running" } },
          { lockExpiresAt: { $lt: now } },
          { lockExpiresAt: { $exists: false } },
        ],
      },
      {
        $set: { status: "running", lockOwner, lockExpiresAt: new Date(now.getTime() + SYNC_LOCK_TTL_MS) },
        $setOnInsert: { key: "main" },
      },
      { upsert: true, new: true },
    );
    if (!status) throw new Error("A synchronization is already running.");
    const heartbeat = setInterval(() => {
      void SyncStatus.updateOne(
        { key: "main", lockOwner },
        { $set: { lockExpiresAt: new Date(Date.now() + SYNC_LOCK_TTL_MS) } },
      ).catch((error: unknown) => console.error("Could not renew synchronization lock:", error));
    }, 20_000);
    heartbeat.unref();
    return { status, lockOwner, heartbeat };
  } catch (error) {
    if (typeof error === "object" && error !== null && "code" in error && error.code === 11000) {
      throw new Error("A synchronization is already running in another API process.");
    }
    throw error;
  }
}

async function releaseSyncLock(lockOwner: string, heartbeat: NodeJS.Timeout): Promise<void> {
  clearInterval(heartbeat);
  await SyncStatus.updateOne(
    { key: "main", lockOwner },
    { $set: { lockOwner: "", lockExpiresAt: null } },
  );
}

export async function runSync(): Promise<void> {
  const previous = await SyncStatus.findOne({ key: "main" }).lean();
  if (previous?.status === "running") throw new Error("A synchronization is already running.");
  const resumeIncomplete = previous?.status === "failed";
  const lease = await acquireSyncLock();
  const status = lease.status;
  let phase: "pokemon" | "tcgdex" = "pokemon";
  try {
    await SyncStatus.updateOne(
      { _id: status._id, lockOwner: lease.lockOwner },
      {
        $set: {
          startedAt: new Date(),
          error: null,
          cardsProcessed: 0,
          cardsTotal: 0,
          setsProcessed: resumeIncomplete ? previous?.setsProcessed ?? 0 : 0,
          setsTotal: 0,
          pokemonStatus: "idle",
          tcgDexStatus: "idle",
          currentSetId: "",
          currentSetName: "",
          currentSetLanguage: "",
          completedSetIds: resumeIncomplete ? previous?.completedSetIds ?? [] : [],
        },
      },
    );
    const pokemonProcessed = await syncPokemon();
    await SyncStatus.updateOne(
      { _id: status._id, lockOwner: lease.lockOwner },
      { $set: { pokemonProcessed, pokemonStatus: "completed" } },
    );
    phase = "tcgdex";
    const cardsProcessed = await syncTcgDex(resumeIncomplete);
    await SyncStatus.updateOne(
      { _id: status._id, lockOwner: lease.lockOwner },
      {
        $set: {
          status: "completed",
          pokemonStatus: "completed",
          tcgDexStatus: "completed",
          completedAt: new Date(),
          lastSuccessfulAt: new Date(),
          cardsProcessed,
          currentSetId: "",
          currentSetName: "",
          currentSetLanguage: "",
          error: null,
        },
      },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown synchronization error";
    await SyncStatus.updateOne(
      { _id: status._id, lockOwner: lease.lockOwner },
      {
        $set: {
          status: "failed",
          pokemonStatus: phase === "pokemon" ? "failed" : "completed",
          tcgDexStatus: phase === "tcgdex" ? "failed" : "idle",
          completedAt: new Date(),
          error: message,
        },
      },
    );
    throw error;
  } finally {
    await releaseSyncLock(lease.lockOwner, lease.heartbeat);
  }
}

/**
 * Retry only the TCGdex phase. Useful after a transient TCGdex outage and avoids
 * re-fetching the full PokeAPI Pokédex on every retry.
 */
export async function runTcgDexSync(language: TcgDexLanguage = "en", onlySetId?: string): Promise<void> {
  const previous = await SyncStatus.findOne({ key: "main" }).lean();
  if (previous?.status === "running") throw new Error("A synchronization is already running.");
  const progressByLanguage = (previous?.localeProgress ?? {}) as Record<string, { status?: string }>;
  const resumeIncomplete = !onlySetId && (progressByLanguage[language]?.status === "failed"
    || (language === "en" && previous?.status === "failed"));
  const lease = await acquireSyncLock();
  const status = lease.status;
  try {
    await SyncStatus.updateOne(
      { _id: status._id, lockOwner: lease.lockOwner },
      {
        $set: {
          tcgDexStatus: language === "en" ? "running" : previous?.tcgDexStatus ?? "completed",
          startedAt: new Date(),
          completedAt: null,
          error: null,
          currentSetId: "",
          currentSetName: "",
          currentSetLanguage: "",
        },
      },
    );
    const cardsProcessed = await syncTcgDex(resumeIncomplete, language, onlySetId);
    const completedAt = new Date();
    if (onlySetId) {
      await SyncStatus.updateOne(
        { _id: status._id, lockOwner: lease.lockOwner },
        {
          $set: {
            status: "completed",
            tcgDexStatus: language === "en" ? "completed" : previous?.tcgDexStatus ?? "completed",
            completedAt,
            lastSuccessfulAt: completedAt,
            currentSetId: "",
            currentSetName: "",
            currentSetLanguage: "",
            [`localeProgress.${language}.lastSetSync`]: { setId: onlySetId, status: "completed", cardsProcessed, completedAt },
            error: null,
          },
        },
      );
    } else {
      await SyncStatus.updateOne(
        { _id: status._id, lockOwner: lease.lockOwner },
        {
          $set: {
            status: "completed",
            tcgDexStatus: language === "en" ? "completed" : previous?.tcgDexStatus ?? "completed",
            completedAt: new Date(),
            ...(language === "en" ? { lastSuccessfulAt: new Date(), cardsProcessed } : {}),
            currentSetId: "",
            currentSetName: "",
            currentSetLanguage: "",
            error: null,
          },
        },
      );
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown TCGdex synchronization error";
    const progressPath = onlySetId ? `localeProgress.${language}.setSync` : `localeProgress.${language}`;
    await SyncStatus.updateOne(
      { _id: status._id, lockOwner: lease.lockOwner },
      {
        $set: {
          [`${progressPath}.status`]: "failed",
          [`${progressPath}.error`]: message,
          [`${progressPath}.completedAt`]: new Date(),
        },
      },
    );
    await SyncStatus.updateOne(
      { _id: status._id, lockOwner: lease.lockOwner },
      {
        $set: {
          status: "failed",
          ...(language === "en" ? { tcgDexStatus: "failed" } : {}),
          completedAt: new Date(),
          error: message,
        },
      },
    );
    throw error;
  } finally {
    await releaseSyncLock(lease.lockOwner, lease.heartbeat);
  }
}
