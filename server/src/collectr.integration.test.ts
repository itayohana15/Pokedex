import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import mongoose from "mongoose";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import app from "./app.js";
import { invalidateReviewSnapshot } from "./routes.js";
import {
  Card,
  CardClassificationOverride,
  CardReviewAction,
  CollectionItem,
  CollectrMatchOverride,
  ImportHistory,
  Pokemon,
  PokemonCard,
  Set,
  SyncStatus,
  UserSettings,
} from "./models.js";

type MongoFixture = {
  uri: string;
  dbPath: string;
  port: number;
};

let httpBase: string;
let mongo: MongoFixture;

function startMongo(): MongoFixture {
  const port = 27018 + Math.floor(Math.random() * 1000);
  const dbPath = mkdtempSync(join(tmpdir(), "pokedex-collectr-"));
  const logPath = join(dbPath, "mongod.log");
  const pidPath = join(dbPath, "mongod.pid");

  execFileSync("mongod", [
    "--port",
    String(port),
    "--dbpath",
    dbPath,
    "--bind_ip",
    "127.0.0.1",
    "--logpath",
    logPath,
    "--pidfilepath",
    pidPath,
    "--fork",
    "--nojournal",
  ], { stdio: "ignore" });

  return { uri: `mongodb://127.0.0.1:${port}/collectr_integration`, dbPath, port };
}

async function stopMongo(fixture: MongoFixture): Promise<void> {
  const pidPath = join(fixture.dbPath, "mongod.pid");
  let pid: number;
  try {
    pid = Number(readFileSync(pidPath, "utf8").trim());
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    rmSync(fixture.dbPath, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
    return;
  }

  if (Number.isInteger(pid) && pid > 0) {
    try {
      process.kill(pid, "SIGTERM");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ESRCH") throw error;
    }

    let stopped = false;
    for (let attempt = 0; attempt < 50; attempt += 1) {
      try {
        process.kill(pid, 0);
        await new Promise((resolve) => setTimeout(resolve, 100));
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ESRCH") throw error;
        stopped = true;
        break;
      }
    }
    if (!stopped) throw new Error(`Temporary MongoDB process ${pid} did not stop.`);
  }

  rmSync(fixture.dbPath, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
}

beforeAll(async () => {
  mongo = startMongo();
  await mongoose.connect(mongo.uri, { serverSelectionTimeoutMS: 5000 });

  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>((resolve) => {
    server.once("listening", () => resolve());
  });

  const address = server.address();
  if (address === null || typeof address === "string") {
    throw new Error("Failed to allocate a local test server port.");
  }

  httpBase = `http://127.0.0.1:${address.port}`;
  (globalThis as typeof globalThis & { __collectrTestServer?: typeof server }).__collectrTestServer = server;
});

afterAll(async () => {
  const server = (globalThis as typeof globalThis & { __collectrTestServer?: { close: (callback: (error?: Error) => void) => void } }).__collectrTestServer;
  if (server) {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => error ? reject(error) : resolve());
    });
  }

  await mongoose.disconnect();
  if (mongo) await stopMongo(mongo);
});

describe("Collectr import integration", () => {
  beforeEach(async () => {
    invalidateReviewSnapshot();
    await CollectionItem.deleteMany({});
    await CollectrMatchOverride.deleteMany({});
    await CardClassificationOverride.deleteMany({});
    await CardReviewAction.deleteMany({});
    await Card.deleteMany({});
    await PokemonCard.deleteMany({});
    await Pokemon.deleteMany({});
    await Set.deleteMany({});
    await ImportHistory.deleteMany({});
    await SyncStatus.deleteMany({});
    await UserSettings.deleteMany({});
  });

  it("enforces the language-scoped source card unique index", async () => {
    await Card.init();
    const card = {
      sourceId: "duplicate-source-card",
      name: "Pikachu",
      setId: "duplicate-set",
      setName: "Duplicate Set",
      localId: "1",
      classification: "EXCLUDED" as const,
      language: "en",
      syncedAt: new Date(),
    };
    await Card.create(card);
    await expect(Card.create(card)).rejects.toMatchObject({ code: 11000 });
    expect(await Card.countDocuments({ language: "en", sourceId: card.sourceId })).toBe(1);
  });

  it("reports per-language catalog gaps and refuses Special Art overrides for Trainers", async () => {
    const set = await Set.create({
      sourceId: "coverage-fixture",
      name: "Coverage Fixture",
      language: "en",
      cardCount: { official: 1, total: 3 },
    });
    await Card.create({
      sourceId: "coverage-fixture-1",
      name: "Pikachu",
      set: set._id,
      setId: set.sourceId,
      setName: set.name,
      localId: "1",
      rarity: "Rare",
      category: "Pokemon",
      cardType: "POKEMON",
      classification: "EXCLUDED",
      language: "en",
      syncedAt: new Date(),
    });
    const trainer = await Card.create({
      sourceId: "coverage-trainer-1",
      name: "Pikachu Supporter",
      set: set._id,
      setId: set.sourceId,
      setName: set.name,
      localId: "2",
      rarity: "Special Illustration Rare",
      category: "Trainer",
      cardType: "TRAINER",
      classification: "EXCLUDED",
      language: "en",
      syncedAt: new Date(),
    });

    const coverageResponse = await fetch(`${httpBase}/api/settings/catalog-coverage`);
    const coverage = await coverageResponse.json();
    const coverageSet = coverage.byLanguage.en.sets.find((row: { setId: string }) => row.setId === set.sourceId);
    expect(coverageResponse.status).toBe(200);
    expect(coverageSet).toMatchObject({
      status: "PARTIAL",
      sourceListVerified: false,
      official: 1,
      total: 3,
      localCardCount: 2,
      missingVsTotal: 1,
    });

    const overrideResponse = await fetch(`${httpBase}/api/classification/${trainer._id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ classification: "SPECIAL_ILLUSTRATION_RARE" }),
    });
    expect(overrideResponse.status).toBe(409);
    expect(await CardClassificationOverride.countDocuments()).toBe(0);
    expect(await Card.findById(trainer._id).lean()).toMatchObject({ classification: "EXCLUDED", cardType: "TRAINER" });
  });

  it("summarizes the review queue and filters paginated cards without changing data", async () => {
    await Pokemon.create({ nationalDex: 25, pokeApiId: 25, name: "Pikachu", generation: 1, types: ["electric"], syncedAt: new Date() });
    const cards = await Card.create([
      {
        sourceId: "review-en-1", name: "Pikachu", setId: "review-en", setName: "Review Set", localId: "1",
        rarity: "Promo", category: "Pokemon", cardType: "POKEMON", classification: "NEEDS_REVIEW", language: "en",
        image: "https://assets.tcgdex.net/en/sv/review-en/1", dexIds: [25], sourceData: { category: "Pokemon", dexId: [25] }, syncedAt: new Date(),
      },
      {
        sourceId: "review-en-2", name: "Cubone", setId: "review-en", setName: "Review Set", localId: "2",
        rarity: "", category: "Pokemon", cardType: "POKEMON", classification: "NEEDS_REVIEW", language: "en",
        image: "", dexIds: [4], sourceData: { category: "Pokemon", dexId: [4] }, syncedAt: new Date(),
      },
      {
        sourceId: "review-ja-1", name: "Pikachu", setId: "review-ja", setName: "Japanese Review Set", localId: "1",
        rarity: "Rare", category: "Pokemon", cardType: "POKEMON", classification: "NEEDS_REVIEW", language: "ja",
        image: "https://assets.tcgdex.net/ja/sv/review-ja/1", dexIds: [25], sourceData: { category: "Pokemon", dexId: [25] }, syncedAt: new Date(),
      },
    ]);
    await CollectionItem.create({ card: cards[1]._id, language: "en", finish: "holofoil", condition: "Near Mint", quantity: 2 });

    const summaryResponse = await fetch(`${httpBase}/api/classification/review/summary`);
    const summary = await summaryResponse.json();
    expect(summaryResponse.status).toBe(200);
    expect(summary).toMatchObject({
      total: 3,
      activeCount: 3,
      skippedCount: 0,
      imageUrlCount: 2,
      imageUrlMissing: 1,
      reasonGroupCounts: { rarity_missing: 1, special_promo_possible: 1, image_missing: 1, source_insufficient: 3 },
    });

    const paginatedResponse = await fetch(`${httpBase}/api/classification/review?page=1&pageSize=2&state=all&sort=confidence`);
    const paginated = await paginatedResponse.json();
    expect(paginated).toMatchObject({ pagination: { page: 1, pageSize: 2, total: 3, pageCount: 2 }, sort: "confidence", state: "all" });
    expect(paginated.items).toHaveLength(2);

    const filteredResponse = await fetch(
      `${httpBase}/api/classification/review?page=1&pageSize=10&language=en&setId=review-en&rarity=%28missing%29&category=Pokemon&pokemon=4&reason=rarity_missing&image=no`,
    );
    const filtered = await filteredResponse.json();
    expect(filteredResponse.status).toBe(200);
    expect(filtered.pagination.total).toBe(1);
    expect(filtered.items[0]).toMatchObject({ name: "Cubone", language: "en", setId: "review-en", rarity: "", reasonGroups: expect.arrayContaining(["rarity_missing", "image_missing"]) });
    expect(await Card.countDocuments({ classification: "NEEDS_REVIEW" })).toBe(3);
    expect(await CollectionItem.findById((await CollectionItem.findOne().lean())?._id).lean()).toMatchObject({ quantity: 2, finish: "holofoil" });
  });

  it("serves a paginated, language-limited Promo Visual Gallery and preserves manual decision history", async () => {
    const pokemon = await Pokemon.create([
      { nationalDex: 65, pokeApiId: 65, name: "Alakazam", generation: 1, types: ["psychic"], syncedAt: new Date() },
      { nationalDex: 197, pokeApiId: 197, name: "Umbreon", generation: 2, types: ["dark"], syncedAt: new Date() },
      { nationalDex: 570, pokeApiId: 570, name: "Zorua", generation: 5, types: ["dark"], syncedAt: new Date() },
    ]);
    const cards = await Card.create([
      {
        sourceId: "mep-003", name: "Alakazam", setId: "mep", setName: "MEP Black Star Promos", localId: "003", rarity: "Promo",
        category: "Pokemon", cardType: "POKEMON", classification: "NEEDS_REVIEW", language: "en", artist: "cochi8i", image: "",
        dexIds: [65], sourceData: { category: "Pokemon", illustrator: "cochi8i", dexId: [65] }, syncedAt: new Date(),
      },
      {
        sourceId: "promo-no-image", name: "Umbreon", setId: "swshp", setName: "Sword & Shield Promos", localId: "001", rarity: "Promo",
        category: "Pokemon", cardType: "POKEMON", classification: "NEEDS_REVIEW", language: "en", image: "",
        dexIds: [197], sourceData: { category: "Pokemon", dexId: [197] }, syncedAt: new Date(),
      },
      {
        sourceId: "SV-P-200", name: "Nのゾロア", setId: "SV-P", setName: "Scarlet & Violet Promo", localId: "200", rarity: "Promo",
        category: "Pokemon", cardType: "POKEMON", classification: "NEEDS_REVIEW", language: "ja", artist: "Jiro Sasumo", image: "",
        dexIds: [570], sourceData: { category: "Pokemon", illustrator: "Jiro Sasumo", dexId: [570] }, syncedAt: new Date(),
      },
      {
        sourceId: "promo-hidden-ko", name: "Pikachu", setId: "svp", setName: "Promos", localId: "1", rarity: "Promo",
        category: "Pokemon", cardType: "POKEMON", classification: "NEEDS_REVIEW", language: "ko", sourceData: { category: "Pokemon" }, syncedAt: new Date(),
      },
      {
        sourceId: "promo-trainer", name: "Professor's Research", setId: "mep", setName: "MEP Black Star Promos", localId: "004", rarity: "Promo",
        category: "Trainer", cardType: "TRAINER", classification: "NEEDS_REVIEW", language: "en", sourceData: { category: "Trainer" }, syncedAt: new Date(),
      },
      {
        sourceId: "nonpromo-card", name: "Mew", setId: "mep", setName: "MEP Black Star Promos", localId: "005", rarity: "Special Illustration Rare",
        category: "Pokemon", cardType: "POKEMON", classification: "NEEDS_REVIEW", language: "en", sourceData: { category: "Pokemon" }, syncedAt: new Date(),
      },
    ]);
    const alakazam = cards[0];
    await CollectionItem.create({ card: alakazam._id, language: "en", finish: "holofoil", condition: "Near Mint", quantity: 2 });
    await PokemonCard.create({ pokemon: pokemon[0]._id, card: alakazam._id, verificationStatus: "VERIFIED", sourceField: "tcgdex.dexId" });
    const collectionBefore = await CollectionItem.find().lean();
    const linksBefore = await PokemonCard.find().lean();

    const summaryResponse = await fetch(`${httpBase}/api/classification/review/visual/summary`);
    const summary = await summaryResponse.json();
    expect(summaryResponse.status).toBe(200);
    expect(summary).toMatchObject({ total: 3, reviewed: 0, unreviewed: 3, confirmed: 0, rejected: 0, undecided: 3, withImage: 0, missingImage: 3, byLanguage: { en: 2, ja: 1 } });
    expect(summary.options.languages.map((option: { value: string }) => option.value)).toEqual(["en", "ja"]);

    const firstPageResponse = await fetch(`${httpBase}/api/classification/review/visual?page=1&pageSize=1&language=en&setId=mep&setLanguage=en&image=no&reviewStatus=unreviewed&sort=number`);
    const firstPage = await firstPageResponse.json();
    expect(firstPage).toMatchObject({ pagination: { page: 1, pageSize: 1, total: 1, pageCount: 1 }, sort: "number" });
    expect(firstPage.items[0]).toMatchObject({ sourceId: "mep-003", name: "Alakazam", language: "en", visualDecision: "UNDECIDED", visuallyReviewed: false });
    expect(firstPage.items[0].imageCandidates).toMatchObject([{
      id: "tcgpromos-mep-003-alakazam", sourceType: "community", sourceId: "mep-003", confidence: 95,
    }]);

    const paginatedResponse = await fetch(`${httpBase}/api/classification/review/visual?page=1&pageSize=1&sort=name`);
    expect((await paginatedResponse.json()).pagination).toMatchObject({ page: 1, pageSize: 1, total: 3, pageCount: 3 });
    const koreanResponse = await fetch(`${httpBase}/api/classification/review/visual?language=ko`);
    expect((await koreanResponse.json()).items).toEqual([]);
    const trainerAction = await fetch(`${httpBase}/api/classification/review/${cards[4]._id}/action`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reviewScope: "promo-visual-gallery", action: "MARK_NOT_SPECIAL_ART" }),
    });
    expect(trainerAction.status).toBe(409);

    const confirm = await fetch(`${httpBase}/api/classification/review/${alakazam._id}/action`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reviewScope: "promo-visual-gallery", action: "CONFIRM_SPECIAL_ART", classification: "SPECIAL_ART_PROMO", imageCandidateId: "tcgpromos-mep-003-alakazam", note: "Distinct alternate promo illustration." }),
    });
    expect(confirm.status).toBe(200);
    expect(await Card.findById(alakazam._id).lean()).toMatchObject({ classification: "SPECIAL_ART_PROMO", isSpecialArt: true, classificationSource: "manual" });
    expect(await CardClassificationOverride.findOne({ card: alakazam._id }).lean()).toMatchObject({ classification: "SPECIAL_ART_PROMO" });
    const firstAction = await CardReviewAction.findOne({ card: alakazam._id }).lean();
    expect(firstAction).toMatchObject({ actor: "local user via Visual Gallery", note: "Distinct alternate promo illustration.", sourceUrl: "https://tcgpromos.com/cards/pokemon-mep-003" });
    expect(firstAction?.evidence).toEqual(expect.arrayContaining([expect.objectContaining({ field: "alternateArtworkImage", source: "TCG Promos (community-provided scan)" })]));

    const reject = await fetch(`${httpBase}/api/classification/review/${alakazam._id}/action`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reviewScope: "promo-visual-gallery", action: "MARK_NOT_SPECIAL_ART" }),
    });
    expect(reject.status).toBe(200);
    expect(await CardClassificationOverride.findOne({ card: alakazam._id }).lean()).toMatchObject({ classification: "EXCLUDED" });
    const keep = await fetch(`${httpBase}/api/classification/review/${alakazam._id}/action`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reviewScope: "promo-visual-gallery", action: "KEEP_NEEDS_REVIEW" }),
    });
    expect(keep.status).toBe(200);
    expect(await Card.findById(alakazam._id).lean()).toMatchObject({ classification: "NEEDS_REVIEW", isSpecialArt: false, classificationSource: "manual" });
    expect(await CardClassificationOverride.findOne({ card: alakazam._id }).lean()).toMatchObject({ classification: "NEEDS_REVIEW" });
    expect(await CardReviewAction.countDocuments({ card: alakazam._id })).toBe(3);

    const finalSummaryResponse = await fetch(`${httpBase}/api/classification/review/visual/summary`);
    expect(await finalSummaryResponse.json()).toMatchObject({ reviewed: 1, unreviewed: 2, confirmed: 0, rejected: 0, undecided: 3 });
    const reviewedPage = await fetch(`${httpBase}/api/classification/review/visual?reviewStatus=reviewed&decision=undecided&setId=mep&setLanguage=en`);
    const reviewedResult = await reviewedPage.json();
    expect(reviewedResult.pagination.total).toBe(1);
    expect(reviewedResult.items[0]).toMatchObject({ visualDecision: "UNDECIDED", visuallyReviewed: true, reviewHistory: expect.arrayContaining([expect.objectContaining({ actor: "local user via Visual Gallery" })]) });
    expect(await CollectionItem.find().lean()).toEqual(collectionBefore);
    expect(await PokemonCard.find().lean()).toEqual(linksBefore);
    expect(await Card.countDocuments()).toBe(6);
  });

  it("stores explicit review decisions as overrides and leaves collection and Pokémon links untouched", async () => {
    const pokemon = await Pokemon.create({ nationalDex: 25, pokeApiId: 25, name: "Pikachu", generation: 1, types: ["electric"], syncedAt: new Date() });
    const [confirmed, rejected] = await Card.create([
      {
        sourceId: "action-review-1", name: "Pikachu", setId: "action-set", setName: "Action Set", localId: "1",
        rarity: "Ultra Rare", category: "Pokemon", cardType: "POKEMON", classification: "NEEDS_REVIEW", language: "en",
        image: "https://assets.tcgdex.net/en/sv/action-set/1", dexIds: [25], sourceData: { category: "Pokemon", dexId: [25] }, syncedAt: new Date(),
      },
      {
        sourceId: "action-review-2", name: "Eevee", setId: "action-set", setName: "Action Set", localId: "2",
        rarity: "Rare", category: "Pokemon", cardType: "POKEMON", classification: "NEEDS_REVIEW", language: "en",
        image: "https://assets.tcgdex.net/en/sv/action-set/2", dexIds: [133], sourceData: { category: "Pokemon", dexId: [133] }, syncedAt: new Date(),
      },
    ]);
    await Promise.all([confirmed, rejected].map((card) => CollectionItem.create({
      card: card._id, language: "en", finish: "holofoil", condition: "Near Mint", quantity: 1,
    })));
    await PokemonCard.create([
      { pokemon: pokemon._id, card: confirmed._id, verificationStatus: "VERIFIED", sourceField: "tcgdex.dexId" },
      { pokemon: pokemon._id, card: rejected._id, verificationStatus: "VERIFIED", sourceField: "tcgdex.dexId" },
    ]);
    const collectionBefore = await CollectionItem.find().sort({ card: 1 }).lean();
    const linksBefore = await PokemonCard.find().sort({ card: 1 }).lean();

    const confirmResponse = await fetch(`${httpBase}/api/classification/review/${confirmed._id}/action`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "CONFIRM_SPECIAL_ART", classification: "SPECIAL_ILLUSTRATION_RARE" }),
    });
    expect(confirmResponse.status).toBe(200);
    expect(await Card.findById(confirmed._id).lean()).toMatchObject({ classification: "SPECIAL_ILLUSTRATION_RARE", classificationSource: "manual", classificationReviewed: true });

    const rejectResponse = await fetch(`${httpBase}/api/classification/review/${rejected._id}/action`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "MARK_NOT_SPECIAL_ART" }),
    });
    expect(rejectResponse.status).toBe(200);
    expect(await Card.findById(rejected._id).lean()).toMatchObject({ classification: "EXCLUDED", classificationSource: "manual", classificationReviewed: true });
    expect(await CardClassificationOverride.find().sort({ card: 1 }).lean()).toMatchObject([
      { classification: "SPECIAL_ILLUSTRATION_RARE" },
      { classification: "EXCLUDED" },
    ]);
    const actions = await CardReviewAction.find().sort({ action: 1 }).lean();
    expect(actions).toHaveLength(2);
    expect(actions[0]).toMatchObject({ action: "CONFIRM_SPECIAL_ART", previousClassification: "NEEDS_REVIEW", resultingClassification: "SPECIAL_ILLUSTRATION_RARE", sourceId: "action-review-1" });
    expect(actions[0].evidence.length).toBeGreaterThan(0);
    expect(await CollectionItem.find().sort({ card: 1 }).lean()).toEqual(collectionBefore);
    expect(await PokemonCard.find().sort({ card: 1 }).lean()).toEqual(linksBefore);
  });

  it("keeps and skips only after explicit actions and never changes the classification", async () => {
    const cards = await Card.create([
      { sourceId: "keep-review", name: "Pikachu", setId: "keep-set", setName: "Keep Set", localId: "1", category: "Pokemon", cardType: "POKEMON", classification: "NEEDS_REVIEW", language: "en", syncedAt: new Date() },
      { sourceId: "skip-review", name: "Eevee", setId: "keep-set", setName: "Keep Set", localId: "2", category: "Pokemon", cardType: "POKEMON", classification: "NEEDS_REVIEW", language: "en", syncedAt: new Date() },
    ]);
    for (const [card, action] of [[cards[0], "KEEP_NEEDS_REVIEW"], [cards[1], "SKIP"]] as const) {
      const response = await fetch(`${httpBase}/api/classification/review/${card._id}/action`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action }),
      });
      expect(response.status).toBe(200);
    }
    expect(await Card.countDocuments({ classification: "NEEDS_REVIEW" })).toBe(2);
    expect(await CardClassificationOverride.countDocuments()).toBe(0);
    expect(await CardReviewAction.countDocuments()).toBe(2);
    const activeResponse = await fetch(`${httpBase}/api/classification/review?pageSize=10`);
    const active = await activeResponse.json();
    expect(active.pagination.total).toBe(1);
    expect(active.items[0].name).toBe("Pikachu");
    const skippedResponse = await fetch(`${httpBase}/api/classification/review?pageSize=10&state=skipped`);
    const skipped = await skippedResponse.json();
    expect(skipped.pagination.total).toBe(1);
    expect(skipped.items[0].name).toBe("Eevee");
  });

  it("rejects a confirmation without a chosen classification or verified Pokémon category evidence", async () => {
    const [pokemonCard, trainerCard] = await Card.create([
      { sourceId: "no-classification", name: "Pikachu", setId: "action-check", setName: "Action Check", localId: "1", category: "Pokemon", cardType: "POKEMON", classification: "NEEDS_REVIEW", language: "en", syncedAt: new Date() },
      { sourceId: "trainer-confirm", name: "Supporter", setId: "action-check", setName: "Action Check", localId: "2", category: "Trainer", cardType: "TRAINER", classification: "NEEDS_REVIEW", language: "en", syncedAt: new Date() },
    ]);
    const noClassification = await fetch(`${httpBase}/api/classification/review/${pokemonCard._id}/action`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "CONFIRM_SPECIAL_ART" }),
    });
    const trainerConfirmation = await fetch(`${httpBase}/api/classification/review/${trainerCard._id}/action`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "CONFIRM_SPECIAL_ART", classification: "ALTERNATE_ART" }),
    });
    expect(noClassification.status).toBe(400);
    expect(trainerConfirmation.status).toBe(409);
    expect(await CardClassificationOverride.countDocuments()).toBe(0);
    expect(await CardReviewAction.countDocuments()).toBe(0);
    expect(await Card.countDocuments({ classification: "NEEDS_REVIEW" })).toBe(2);
  });

  it("parses Promo as rarity instead of duplicating it in the set name", async () => {
    const set = await Set.create({ sourceId: "swshp", name: "Sword & Shield Promo" });
    await Card.create({
      sourceId: "swshp-SWSH184",
      name: "Jolteon VMAX",
      set: set._id,
      setId: set.sourceId,
      setName: set.name,
      localId: "SWSH184",
      rarity: "Promo",
      cardType: "POKEMON",
      classification: "NEEDS_REVIEW",
      language: "en",
      syncedAt: new Date(),
    });

    const previewResponse = await fetch(`${httpBase}/api/collectr/preview`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        text: "Jolteon VMAX  Jolteon VMAX Sword & Shield Promo Promo • SWSH184 Near Mint • Holofoil Qty: 1",
      }),
    });

    expect(previewResponse.status).toBe(200);
    const preview = await previewResponse.json();
    expect(preview.summary).toMatchObject({
      recordsDetected: 1,
      matched: 0,
      needsReview: 1,
      unmatched: 0,
    });
    expect(preview.records[0]).toMatchObject({
      record: {
        cardName: "Jolteon VMAX",
        setName: "Sword & Shield Promo",
        rarity: "Promo",
        cardNumber: "SWSH184",
      },
      status: "needs-review",
      reason: "Card identity matches, but its Special Art classification needs manual review before import.",
    });
    expect(preview.records[0].candidates).toHaveLength(1);
  });

  it("searches manual matches across languages and card types without making ineligible cards selectable", async () => {
    const cards = await Card.create([
      {
        sourceId: "manual-search-en",
        name: "Deerling",
        setName: "White Flare",
        setId: "manual-search-en-set",
        localId: "091",
        rarity: "Illustration rare",
        cardType: "POKEMON",
        classification: "ILLUSTRATION_RARE",
        language: "en",
        syncedAt: new Date(),
      },
      {
        sourceId: "manual-search-ja",
        name: "Deerling",
        setName: "White Flare",
        setId: "manual-search-ja-set",
        localId: "091",
        rarity: "Illustration rare",
        cardType: "POKEMON",
        classification: "ILLUSTRATION_RARE",
        language: "ja",
        syncedAt: new Date(),
      },
      {
        sourceId: "manual-search-trainer",
        name: "Deerling Supporter",
        setName: "Trainer Set",
        setId: "manual-search-trainer-set",
        localId: "001",
        rarity: "Ultra Rare",
        cardType: "TRAINER",
        classification: "EXCLUDED",
        language: "en",
        syncedAt: new Date(),
      },
    ]);

    const response = await fetch(`${httpBase}/api/collectr/cards/search?q=Deerling&language=en`);
    const results = await response.json();

    expect(response.status).toBe(200);
    expect(results).toHaveLength(2);
    const eligibility = new Map(results.map((card: { _id: string; eligibleForImport: boolean }) => [
      card._id,
      card.eligibleForImport,
    ]));
    expect(eligibility.get(String(cards[0]._id))).toBe(true);
    expect(eligibility.has(String(cards[1]._id))).toBe(false);
    expect(eligibility.get(String(cards[2]._id))).toBe(false);

    const defaultResponse = await fetch(`${httpBase}/api/collectr/cards/search?q=Deerling`);
    const defaultResults = await defaultResponse.json();
    expect(defaultResults.map((card: { language: string }) => card.language)).toEqual(["en", "en"]);
    const japaneseResponse = await fetch(`${httpBase}/api/collectr/cards/search?q=Deerling&language=ja`);
    const japaneseResults = await japaneseResponse.json();
    expect(japaneseResults.map((card: { _id: string; language: string }) => [card._id, card.language]))
      .toEqual([[String(cards[1]._id), "ja"]]);
  });

  it("runs preview, commit and rollback with a real MongoDB instance", async () => {
    const set = await Set.create({
      sourceId: "sv10.5w",
      name: "White Flare",
      cardCount: { official: 86, total: 173 },
      updatedAtSource: new Date(),
    });

    const card = await Card.create({
      sourceId: "sv10.5w-091",
      name: "Deerling",
      image: "https://assets.tcgdex.net/en/sv/sv10.5w/091",
      set: set._id,
      setId: "sv10.5w",
      setName: "White Flare",
      localId: "091",
      rarity: "Illustration rare",
      category: "Pokemon",
      classification: "ILLUSTRATION_RARE",
      artist: "takashi shiraishi",
      language: "en",
      variants: { firstEdition: false, holo: true, normal: false, reverse: false, wPromo: false },
      dexIds: [585],
      sourceData: {
        id: "sv10.5w-091",
        name: "Deerling",
        localId: "091",
        rarity: "Illustration rare",
        set: {
          id: "sv10.5w",
          name: "White Flare",
          cardCount: { official: 86, total: 173 },
        },
      },
      sourceUpdatedAt: new Date("2026-09-06T11:00:03+01:00"),
      syncedAt: new Date(),
    });
    await Card.collection.updateOne({ _id: card._id }, { $unset: { cardType: "" } });

    const text = [
      "Deerling",
      "White Flare",
      "Illustration Rare",
      "091/086",
      "Near Mint",
      "•",
      "Holofoil",
      "$16.68",
      "-$0.55",
      "(-3.19%)",
      "Qty: 1",
    ].join("\n");

    const previewResponse = await fetch(`${httpBase}/api/collectr/preview`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
    });

    expect(previewResponse.status).toBe(200);
    const preview = await previewResponse.json();
    expect(preview.importId).toBeTruthy();
    expect(preview.summary).toMatchObject({
      recordsDetected: 1,
      matched: 1,
      needsReview: 0,
      unmatched: 0,
    });
    expect(preview.records[0]).toMatchObject({
      record: {
        cardName: "Deerling",
        setName: "White Flare",
        rarity: "Illustration Rare",
        cardNumber: "091/086",
        language: "en",
        condition: "Near Mint",
        finish: "Holofoil",
        quantity: 1,
        marketPrice: 16.68,
      },
      status: "matched",
      match: { cardId: String(card._id), confidenceScore: 100 },
    });
    const historyResponse = await fetch(`${httpBase}/api/collectr/history/${preview.importId}`);
    const historyDetails = await historyResponse.json();
    expect(historyDetails.parseSummary).toMatchObject({ inputLines: 11, ignoredLines: 0 });

    const commitResponse = await fetch(`${httpBase}/api/collectr/${preview.importId}/commit`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        decisions: [{ index: 0, cardId: String(card._id) }],
      }),
    });

    expect(commitResponse.status).toBe(200);
    const commitResult = await commitResponse.json();
    expect(commitResult.importedItems).toBe(1);

    const savedItem = await CollectionItem.findOne({
      card: card._id,
      language: "en",
      finish: "Holofoil",
      condition: "Near Mint",
    }).lean();
    expect(savedItem).toMatchObject({ quantity: 1 });

    const history = await ImportHistory.findById(preview.importId).lean();
    expect(history).toMatchObject({ status: "completed" });

    const rollbackResponse = await fetch(`${httpBase}/api/collectr/${preview.importId}/rollback`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
    });

    expect(rollbackResponse.status).toBe(200);
    const rollbackResult = await rollbackResponse.json();
    expect(rollbackResult.rolledBack).toBeGreaterThan(0);

    const afterRollback = await CollectionItem.findOne({
      card: card._id,
      language: "en",
      finish: "Holofoil",
      condition: "Near Mint",
    }).lean();
    expect(afterRollback).toBeNull();

    const currentHistory = await ImportHistory.findById(preview.importId).lean();
    expect(currentHistory).toMatchObject({ status: "rolled-back" });
  });

  it("matches the supplied Thievul, Cubone CN, and Mew ex CN examples by TCGdex set, localId, name, rarity, and language", async () => {
    const sets = await Set.create([
      { sourceId: "abyss-eye", name: "Abyss Eye", language: "en", cardCount: { official: 81, total: 89 } },
      { sourceId: "gem-pack-vol-3", name: "Gem Pack Vol. 3", language: "zh-cn", cardCount: { official: 7, total: 407 } },
      { sourceId: "collect-151-surprise", name: "Collect 151 Surprise", language: "zh-cn", cardCount: { official: 151, total: 191 } },
    ]);
    const cardFixtures = [
      {
        sourceId: "abyss-eye-089", name: "Thievul", setId: "abyss-eye", setName: "Abyss Eye", localId: "089",
        rarity: "Art Rare", language: "en", classification: "ILLUSTRATION_RARE" as const,
        image: "https://assets.tcgdex.net/en/sv/sv06/089",
      },
      {
        sourceId: "gem-pack-vol-3-0407", name: "Cubone", setId: "gem-pack-vol-3", setName: "Gem Pack Vol. 3", localId: "0407",
        rarity: "Art Rare", language: "zh-cn", classification: "ILLUSTRATION_RARE" as const,
        image: "https://assets.tcgdex.net/zh-cn/other/gem3/0407",
      },
      {
        sourceId: "collect-151-surprise-191", name: "Mew ex", setId: "collect-151-surprise", setName: "Collect 151 Surprise", localId: "191",
        rarity: "Special Art Rare", language: "zh-cn", classification: "SPECIAL_ILLUSTRATION_RARE" as const,
        image: "https://assets.tcgdex.net/zh-cn/other/collect151/191",
      },
    ];
    await Card.create(cardFixtures.map((card, index) => ({
      ...card,
      set: sets[index]._id,
      cardType: "POKEMON",
      syncedAt: new Date(),
    })));

    const response = await fetch(`${httpBase}/api/collectr/preview`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: [
        "Thievul\nThievul\nAbyss Eye\nArt Rare\n089/081\nNear Mint\nHolofoil\nQty: 1",
        "Cubone (Full Art) (CN)\nCubone (Full Art) (CN)\nGem Pack Vol. 3\nArt Rare\n0407/07\nNear Mint\nHolofoil\nQty: 1",
        "Mew ex (CN)\nMew ex (CN)\nCollect 151 Surprise\nSpecial Art Rare\n191/151\nNear Mint\nHolofoil\nQty: 1",
      ].join("\n") }),
    });
    const preview = await response.json();

    expect(response.status).toBe(200);
    expect(preview.summary).toMatchObject({ recordsDetected: 3, matched: 3, needsReview: 0, unmatched: 0 });
    expect(preview.records.map((item: { record: { language: string }; status: string; candidates: Array<{ name: string; image: string }> }) => ({
      language: item.record.language,
      status: item.status,
      name: item.candidates[0]?.name,
      image: item.candidates[0]?.image,
    }))).toEqual(cardFixtures.map((card) => ({
      language: card.language,
      status: "matched",
      name: card.name,
      image: card.image,
    })));
  });

  it("does not commit automatic matches unless a card is explicitly selected", async () => {
    const set = await Set.create({ sourceId: "explicit-choice-set", name: "Explicit Choice" });
    await Card.create({
      sourceId: "explicit-choice-card",
      name: "Deerling",
      set: set._id,
      setId: set.sourceId,
      setName: set.name,
      localId: "091",
      rarity: "Illustration rare",
      cardType: "POKEMON",
      classification: "ILLUSTRATION_RARE",
      language: "en",
      syncedAt: new Date(),
    });
    const previewResponse = await fetch(`${httpBase}/api/collectr/preview`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: "Deerling\nExplicit Choice\nIllustration Rare\n091/086\nQty: 1" }),
    });
    const preview = await previewResponse.json();
    expect(preview.records[0].status).toBe("matched");

    const commitResponse = await fetch(`${httpBase}/api/collectr/${preview.importId}/commit`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ decisions: [] }),
    });

    expect(commitResponse.status).toBe(200);
    expect(await commitResponse.json()).toMatchObject({ importedItems: 0, unmatchedItems: 1 });
    expect(await CollectionItem.countDocuments()).toBe(0);
  });

  it("rejects Trainer cards from preview, manual selection, and Collectr commit", async () => {
    const set = await Set.create({ sourceId: "trainer-set", name: "Trainer Set" });
    const trainer = await Card.create({
      sourceId: "trainer-card",
      name: "Pikachu Supporter",
      category: "Trainer",
      cardType: "TRAINER",
      set: set._id,
      setId: set.sourceId,
      setName: set.name,
      localId: "025",
      rarity: "Special illustration rare",
      classification: "EXCLUDED",
      language: "en",
      syncedAt: new Date(),
    });
    const previewResponse = await fetch(`${httpBase}/api/collectr/preview`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: "Pikachu Supporter\nTrainer Set\nSpecial Illustration Rare\n025/100\nQty: 1" }),
    });
    const preview = await previewResponse.json();
    expect(preview.records[0]).toMatchObject({
      status: "unmatched",
      match: null,
      reason: expect.stringContaining("not an eligible Pokémon special-art card"),
    });

    const decisionResponse = await fetch(
        `${httpBase}/api/collectr/${preview.importId}/records/0/decision`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ cardId: String(trainer._id) }),
        },
    );
    expect(decisionResponse.status).toBe(400);

    const commitResponse = await fetch(`${httpBase}/api/collectr/${preview.importId}/commit`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ decisions: [{ index: 0, cardId: String(trainer._id) }] }),
    });
    expect(commitResponse.status).toBe(400);
    expect(await CollectionItem.countDocuments()).toBe(0);
  });

  it("shows only eligible Pokémon cards on Pokémon pages and in Collection", async () => {
    const bulbasaur = await Pokemon.create({
      nationalDex: 1,
      pokeApiId: 1,
      name: "bulbasaur",
      generation: 1,
      syncedAt: new Date(),
    });
    const ivysaur = await Pokemon.create({
      nationalDex: 2,
      pokeApiId: 2,
      name: "ivysaur",
      generation: 1,
      syncedAt: new Date(),
    });
    const set = await Set.create({ sourceId: "relationship-set", name: "Relationship Set" });
    const pokemonCard = await Card.create({
      sourceId: "bulbasaur-art",
      name: "Bulbasaur",
      category: "Pokemon",
      cardType: "POKEMON",
      set: set._id,
      setId: set.sourceId,
      setName: set.name,
      localId: "001",
      rarity: "Illustration rare",
      classification: "ILLUSTRATION_RARE",
      language: "en",
      dexIds: [1],
      syncedAt: new Date(),
    });
    const trainerCard = await Card.create({
      sourceId: "trainer-art",
      name: "Trainer with Bulbasaur",
      category: "Trainer",
      cardType: "TRAINER",
      set: set._id,
      setId: set.sourceId,
      setName: set.name,
      localId: "002",
      rarity: "Special illustration rare",
      classification: "SPECIAL_ILLUSTRATION_RARE",
      language: "en",
      syncedAt: new Date(),
    });
    await PokemonCard.create([
        { pokemon: bulbasaur._id, card: pokemonCard._id, verificationStatus: "VERIFIED", sourceField: "tcgdex.dexId" },
        { pokemon: ivysaur._id, card: pokemonCard._id, verificationStatus: "NEEDS_REVIEW", sourceField: "tcgdex.cameoDexIds" },
        { pokemon: bulbasaur._id, card: trainerCard._id, verificationStatus: "NEEDS_REVIEW", sourceField: "tcgdex.cameoDexIds" },
    ]);
    await CollectionItem.create([
        { card: pokemonCard._id, language: "en", quantity: 1 },
        { card: trainerCard._id, language: "en", quantity: 1 },
    ]);

    const bulbasaurResponse = await fetch(`${httpBase}/api/pokemon/1`);
    const bulbasaurResult = await bulbasaurResponse.json();
    expect(bulbasaurResult.cards.map((card: { sourceId: string }) => card.sourceId)).toEqual(["bulbasaur-art"]);
    const ivysaurResponse = await fetch(`${httpBase}/api/pokemon/2`);
    const ivysaurResult = await ivysaurResponse.json();
    expect(ivysaurResult.cards).toEqual([]);

    const collectionResponse = await fetch(`${httpBase}/api/collection`);
    const collectionResult = await collectionResponse.json();
    expect(collectionResult).toHaveLength(1);
    expect(collectionResult[0].card.sourceId).toBe("bulbasaur-art");
    expect(await CollectionItem.countDocuments()).toBe(2);

    const statsResponse = await fetch(`${httpBase}/api/stats`);
    const stats = await statsResponse.json();
    expect(stats).toMatchObject({
      specialCardsTotal: 1,
      uniqueCardsOwned: 1,
      physicalCopiesOwned: 1,
      pokemonOwned: 1,
    });
  });

  it("normalizes whitespace, capitalization, and leading zeroes without requiring copy details", async () => {
    const set = await Set.create({
      sourceId: "whiteflare-normalized",
      name: "WhiteFlare",
      cardCount: { official: 86, total: 173 },
    });
    await Card.create({
      sourceId: "deerling-normalized",
      name: "Deerling",
      image: "",
      set: set._id,
      setId: set.sourceId,
      setName: "WhiteFlare",
      localId: "91",
      rarity: "ILLUSTRATION RARE",
      cardType: "POKEMON",
      classification: "ILLUSTRATION_RARE",
      artist: "",
      language: "en",
      dexIds: [585],
      syncedAt: new Date(),
    });

    const response = await fetch(`${httpBase}/api/collectr/preview`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        text: [
          "Deerling",
          "Deerling",
          "white   flare",
          "illustration rare",
          "091/086",
          "Qty: 1",
        ].join("\n"),
      }),
    });
    const preview = await response.json();

    expect(response.status).toBe(200);
    expect(preview.summary).toMatchObject({ recordsDetected: 1, matched: 1, needsReview: 0, unmatched: 0 });
    expect(preview.records[0]).toMatchObject({
      record: {
        cardName: "Deerling",
        setName: "white   flare",
        rarity: "illustration rare",
        cardNumber: "091/086",
      language: "en",
        condition: "Unknown",
        finish: "Unknown",
        quantity: 1,
      },
      status: "matched",
    });
    expect(preview.records[0].record).not.toHaveProperty("marketPrice");
  });

  it("uses English by default and never considers a Japanese printing", async () => {
    const set = await Set.create({
      sourceId: "white-flare-ambiguous",
      name: "White Flare",
      cardCount: { official: 86, total: 173 },
    });
    const baseCard = {
      name: "Deerling",
      image: "",
      set: set._id,
      setId: set.sourceId,
      setName: set.name,
      localId: "091",
      rarity: "Illustration rare",
      cardType: "POKEMON" as const,
      classification: "ILLUSTRATION_RARE" as const,
      artist: "",
      dexIds: [585],
      syncedAt: new Date(),
    };
    await Card.create([
      { ...baseCard, sourceId: "deerling-en", language: "en" },
      { ...baseCard, sourceId: "deerling-ja", language: "ja" },
    ]);

    const response = await fetch(`${httpBase}/api/collectr/preview`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        text: [
          "Deerling",
          "Deerling",
          "White Flare",
          "Illustration Rare",
          "091/086",
          "Qty: 1",
        ].join("\n"),
      }),
    });
    const preview = await response.json();

    expect(response.status).toBe(200);
    expect(preview.summary).toMatchObject({ recordsDetected: 1, matched: 1, needsReview: 0, unmatched: 0 });
    expect(preview.records[0]).toMatchObject({
      record: { language: "en" },
      status: "matched",
      match: { cardId: String((await Card.findOne({ language: "en" }).lean())?._id) },
    });
    expect(preview.records[0].candidates.map((candidate: { language: string }) => candidate.language)).toEqual(["en"]);
  });

  it("explains set, name, rarity, and number mismatches instead of returning a generic no-match", async () => {
    const set = await Set.create({
      sourceId: "white-flare-diagnostics",
      name: "WhiteFlare",
      cardCount: { official: 86, total: 173 },
    });
    await Card.create({
      sourceId: "deerling-diagnostics",
      name: "Deerling",
      image: "",
      set: set._id,
      setId: set.sourceId,
      setName: set.name,
      localId: "091",
      rarity: "Illustration rare",
      cardType: "POKEMON",
      classification: "ILLUSTRATION_RARE",
      artist: "",
      language: "en",
      dexIds: [585],
      syncedAt: new Date(),
    });
    const records = [
      ["Deerling", "Deerling", "Missing Set", "Illustration Rare", "091/086", "Qty: 1"],
      ["Otherling", "Otherling", "White Flare", "Illustration Rare", "091/086", "Qty: 1"],
      ["Deerling", "Deerling", "White Flare", "Full Art", "091/086", "Qty: 1"],
      ["Newmon", "Newmon", "White Flare", "Illustration Rare", "001/086", "Qty: 1"],
      ["Deerling", "Deerling", "White Flare", "Illustration Rare", "092/086", "Qty: 1"],
    ].map((lines) => lines.join("\n")).join("\n");

    const response = await fetch(`${httpBase}/api/collectr/preview`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: records }),
    });
    const preview = await response.json();

    expect(response.status).toBe(200);
    expect(preview.records.map((item: { reason: string }) => item.reason)).toEqual([
      "Set not found in the local database; no verified set alias was found.",
      "Card name not found among cards with this number in the selected set.",
      "Rarity mismatch for this card, set, and number.",
      "Card number not found in the selected TCGdex set and language.",
      "Card number not found in the selected TCGdex set and language.",
    ]);
    expect(preview.records.map((item: { status: string }) => item.status)).toEqual([
      "unmatched", "needs-review", "needs-review", "unmatched", "unmatched",
    ]);
    expect(preview.records[1].candidates).toHaveLength(1);
    expect(preview.records[2].candidates).toHaveLength(1);
    expect(preview.records[1].candidates[0]).toMatchObject({
      confidenceScore: 80,
      suggestionReason: "Set and card number match, but the card name differs. Verify this candidate manually.",
    });
    expect(preview.records[2].candidates[0]).toMatchObject({
      confidenceScore: 95,
      suggestionReason: "Set, number, and name match, but rarity differs. Verify this candidate manually.",
    });
  });

  it("uses verified shared TCGdex IDs for localized names and keeps language-specific prints separate", async () => {
    const englishSet = await Set.create({ sourceId: "sv10-localized", name: "Destined Rivals", language: "en" });
    const japaneseSet = await Set.create({ sourceId: "sv10-localized", name: "ロケット団の栄光", language: "ja" });
    await Card.create([
      {
        sourceId: "sv10-localized-091",
        name: "Deerling",
        set: englishSet._id,
        setId: englishSet.sourceId,
        setName: englishSet.name,
        localId: "091",
        rarity: "Illustration rare",
        cardType: "POKEMON",
        classification: "ILLUSTRATION_RARE",
        language: "en",
        syncedAt: new Date(),
      },
      {
        sourceId: "sv10-localized-091",
        name: "シキジカ",
        set: japaneseSet._id,
        setId: japaneseSet.sourceId,
        setName: japaneseSet.name,
        localId: "091",
        rarity: "SAR",
        cardType: "POKEMON",
        classification: "ILLUSTRATION_RARE",
        language: "ja",
        syncedAt: new Date(),
      },
    ]);

    const response = await fetch(`${httpBase}/api/collectr/preview`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        text: [
          "Deerling (JP)",
          "Deerling (JP)",
          "Destined Rivals",
          "SAR",
          "091/086",
          "Qty: 1",
        ].join("\n"),
      }),
    });
    const preview = await response.json();

    expect(response.status).toBe(200);
    expect(preview.summary).toMatchObject({ matched: 1, needsReview: 0, unmatched: 0 });
    expect(preview.records[0]).toMatchObject({
      record: { language: "ja" },
      match: { cardId: expect.any(String), confidenceScore: 100 },
      status: "matched",
    });
    const chosen = await Card.findById(preview.records[0].match.cardId).lean();
    expect(chosen?.language).toBe("ja");
    expect(preview.records[0].match.explanation).toContain("verified shared TCGdex set ID");
  });

  it("persists review decisions on the preview without changing collection data", async () => {
    const set = await Set.create({ sourceId: "manual-review-set", name: "Review Set" });
    const card = await Card.create({
      sourceId: "manual-review-card",
      name: "Deerling",
      set: set._id,
      setId: set.sourceId,
      setName: set.name,
      localId: "091",
      rarity: "Illustration rare",
      cardType: "POKEMON",
      classification: "ILLUSTRATION_RARE",
      language: "en",
      syncedAt: new Date(),
    });
    const previewResponse = await fetch(`${httpBase}/api/collectr/preview`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: "Deerling\nDeerling\nReview Set\n091/086\nQty: 1" }),
    });
    const preview = await previewResponse.json();
    const decisionResponse = await fetch(
      `${httpBase}/api/collectr/${preview.importId}/records/0/decision`,
      {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cardId: String(card._id), ignored: false }),
      },
    );

    expect(decisionResponse.status).toBe(200);
    expect(await CollectionItem.countDocuments()).toBe(0);
    const history = await ImportHistory.findById(preview.importId).lean();
    expect(history?.records[0]).toMatchObject({
      manualDecision: { cardId: String(card._id), ignored: false },
    });
  });

  it("carries an explicitly reviewed card match into a separate re-preview", async () => {
    const set = await Set.create({ sourceId: "persistent-review-set", name: "Persistent Review" });
    const card = await Card.create({
      sourceId: "persistent-review-card",
      name: "Deerling",
      set: set._id,
      setId: set.sourceId,
      setName: set.name,
      localId: "091",
      rarity: "Illustration rare",
      cardType: "POKEMON",
      classification: "ILLUSTRATION_RARE",
      language: "en",
      syncedAt: new Date(),
    });
    const text = "Deerling\nDeerling\nPersistent Review\n091/086\nQty: 1";
    const firstResponse = await fetch(`${httpBase}/api/collectr/preview`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
    });
    const first = await firstResponse.json();
    const decisionResponse = await fetch(
      `${httpBase}/api/collectr/${first.importId}/records/0/decision`,
      {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cardId: String(card._id), ignored: false }),
      },
    );
    const decision = await decisionResponse.json();
    expect(decision.record).toMatchObject({
      status: "matched",
      match: { cardId: String(card._id), confidence: "manual", confidenceScore: 100 },
      manualDecision: { cardId: String(card._id), source: "manual" },
    });
    expect(await CollectrMatchOverride.countDocuments()).toBe(1);
    expect(await CollectionItem.countDocuments()).toBe(0);

    const secondResponse = await fetch(`${httpBase}/api/collectr/preview`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
    });
    const second = await secondResponse.json();
    expect(second.importId).not.toBe(first.importId);
    expect(second.records[0]).toMatchObject({
      status: "matched",
      match: { cardId: String(card._id), confidence: "manual", confidenceScore: 100 },
      manualDecision: { cardId: String(card._id), source: "manual" },
    });
    expect(await CollectionItem.countDocuments()).toBe(0);
  });

  it("maps CN to zh-cn and never chooses a Traditional Chinese printing", async () => {
    const simplifiedSet = await Set.create({
      sourceId: "cn-collectr-set",
      name: "Collect 151 Surprise",
      language: "zh-cn",
    });
    const traditionalSet = await Set.create({
      sourceId: "cn-collectr-set",
      name: "Collect 151 Surprise",
      language: "zh-tw",
    });
    const baseCard = {
      name: "Mew ex",
      localId: "191",
      rarity: "Special Art Rare",
      cardType: "POKEMON" as const,
      classification: "SPECIAL_ILLUSTRATION_RARE" as const,
      syncedAt: new Date(),
    };
    await Card.create([
      {
        ...baseCard,
        sourceId: "cn-collectr-card",
        set: simplifiedSet._id,
        setId: simplifiedSet.sourceId,
        setName: simplifiedSet.name,
        language: "zh-cn",
      },
      {
        ...baseCard,
        sourceId: "cn-collectr-card",
        set: traditionalSet._id,
        setId: traditionalSet.sourceId,
        setName: traditionalSet.name,
        language: "zh-tw",
      },
    ]);
    const response = await fetch(`${httpBase}/api/collectr/preview`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        text: "Mew ex (CN)\nMew ex (CN)\nCollect 151 Surprise\nSpecial Art Rare\n191/151\nQty: 1",
      }),
    });
    const preview = await response.json();

    expect(response.status).toBe(200);
    expect(preview.records[0]).toMatchObject({
      record: { language: "zh-cn" },
      status: "matched",
      match: { cardId: String((await Card.findOne({ language: "zh-cn" }).lean())?._id) },
    });
    expect(preview.records[0].candidates.map((candidate: { language: string }) => candidate.language).sort())
      .toEqual(["zh-cn"]);
  });

  it("keeps conflicting language markers in Needs Review and permits only those marked languages", async () => {
    const japaneseSet = await Set.create({ sourceId: "conflict-set", name: "Language Test", language: "ja" });
    const simplifiedSet = await Set.create({ sourceId: "conflict-set", name: "Language Test", language: "zh-cn" });
    const cards = await Card.create([
      {
        sourceId: "conflict-card",
        name: "Pikachu",
        image: "https://assets.tcgdex.net/ja/sv/test/001",
        set: japaneseSet._id,
        setId: japaneseSet.sourceId,
        setName: japaneseSet.name,
        localId: "001",
        rarity: "Art Rare",
        cardType: "POKEMON",
        classification: "ILLUSTRATION_RARE",
        language: "ja",
        syncedAt: new Date(),
      },
      {
        sourceId: "conflict-card",
        name: "Pikachu",
        image: "https://assets.tcgdex.net/zh-cn/sv/test/001",
        set: simplifiedSet._id,
        setId: simplifiedSet.sourceId,
        setName: simplifiedSet.name,
        localId: "001",
        rarity: "Art Rare",
        cardType: "POKEMON",
        classification: "ILLUSTRATION_RARE",
        language: "zh-cn",
        syncedAt: new Date(),
      },
    ]);
    const response = await fetch(`${httpBase}/api/collectr/preview`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        text: "Pikachu (JP) (CN)\nPikachu (JP) (CN)\nLanguage Test\nArt Rare\n001/010\nQty: 1",
      }),
    });
    const preview = await response.json();

    expect(preview.records[0]).toMatchObject({
      record: { language: "ja", languageCandidates: ["ja", "zh-cn"] },
      status: "needs-review",
      match: null,
      reason: "Conflicting language markers (ja, zh-cn); select a printing manually.",
    });
    expect(preview.records[0].candidates.map((candidate: { language: string }) => candidate.language).sort())
      .toEqual(["ja", "zh-cn"]);

    const decisionResponse = await fetch(
      `${httpBase}/api/collectr/${preview.importId}/records/0/decision`,
      {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cardId: String(cards[1]._id), ignored: false }),
      },
    );
    expect(decisionResponse.status).toBe(200);
    expect((await decisionResponse.json()).record.record.languageCandidates).toEqual(["ja", "zh-cn"]);
    const rePreviewResponse = await fetch(`${httpBase}/api/collectr/preview`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        text: "Pikachu (JP) (CN)\nPikachu (JP) (CN)\nLanguage Test\nArt Rare\n001/010\nQty: 1",
      }),
    });
    const rePreview = await rePreviewResponse.json();
    expect(rePreview.records[0]).toMatchObject({
      status: "matched",
      match: { cardId: String(cards[1]._id), confidence: "manual" },
      manualDecision: { cardId: String(cards[1]._id), source: "manual" },
    });
    expect(await CollectionItem.countDocuments()).toBe(0);
  });

  it("places an exact Pokémon printing in Needs Review when its art classification is uncertain", async () => {
    const set = await Set.create({ sourceId: "uncertain-art-set", name: "Battle Styles" });
    const card = await Card.create({
      sourceId: "uncertain-art-card",
      name: "Empoleon V",
      set: set._id,
      setId: set.sourceId,
      setName: set.name,
      localId: "146",
      rarity: "Ultra Rare",
      cardType: "POKEMON",
      classification: "NEEDS_REVIEW",
      language: "en",
      syncedAt: new Date(),
    });
    const response = await fetch(`${httpBase}/api/collectr/preview`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        text: "Empoleon V (Alternate Full Art)\nEmpoleon V (Alternate Full Art)\nBattle Styles\nUltra Rare\n146/163\nQty: 1",
      }),
    });
    const preview = await response.json();

    expect(response.status).toBe(200);
    expect(preview.records[0]).toMatchObject({
      status: "needs-review",
      reason: "Card identity matches, but its Special Art classification needs manual review before import.",
      candidates: [{ _id: String(card._id) }],
    });
    const decisionResponse = await fetch(
      `${httpBase}/api/collectr/${preview.importId}/records/0/decision`,
      {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cardId: String(card._id), ignored: false }),
      },
    );
    expect(decisionResponse.status).toBe(400);
    expect(await CollectionItem.countDocuments()).toBe(0);
  });

  it("auto-matches verified Black White Rare and Gallery printings but not ordinary Trainers", async () => {
    const blackSet = await Set.create({ sourceId: "black-bolt-test", name: "Black Bolt" });
    const gallerySet = await Set.create({ sourceId: "swsh12.5gg", name: "Crown Zenith Galarian Gallery" });
    await Card.create([
      {
        sourceId: "black-bolt-172",
        name: "Zekrom ex",
        set: blackSet._id,
        setId: blackSet.sourceId,
        setName: blackSet.name,
        localId: "172",
        rarity: "Black White Rare",
        cardType: "POKEMON",
        classification: "BLACK_WHITE_RARE",
        language: "en",
        syncedAt: new Date(),
      },
      {
        sourceId: "gallery-gg68",
        name: "Origin Forme Dialga VSTAR",
        set: gallerySet._id,
        setId: gallerySet.sourceId,
        setName: gallerySet.name,
        localId: "GG68",
        rarity: "Secret Rare",
        cardType: "POKEMON",
        classification: "VSTAR_SPECIAL_ART",
        language: "en",
        syncedAt: new Date(),
      },
    ]);
    const response = await fetch(`${httpBase}/api/collectr/preview`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        text: [
          "Zekrom ex\nZekrom ex\nBlack Bolt\nBlack White Rare\n172/086\nQty: 1",
          "Origin Forme Dialga VSTAR (Secret)\nOrigin Forme Dialga VSTAR (Secret)\nCrown Zenith: Galarian Gallery\nSecret Rare\nGG68/GG70\nQty: 1",
        ].join("\n"),
      }),
    });
    const preview = await response.json();

    expect(response.status).toBe(200);
    expect(preview.summary).toMatchObject({ recordsDetected: 2, matched: 2, needsReview: 0, unmatched: 0 });
    expect(preview.records.map((record: { match: { cardId: string } }) => record.match.cardId))
      .toEqual(expect.arrayContaining((await Card.find({ sourceId: { $in: ["black-bolt-172", "gallery-gg68"] } }).lean()).map((card) => String(card._id))));
  });

  it("serves only the four supported card languages and blocks unsupported Collectr imports without deleting data", async () => {
    const supportedLanguages = ["en", "ja", "zh-cn", "zh-tw"];
    const hiddenLanguages = ["ko", "fr"];
    const pokemon = await Pokemon.create({
      nationalDex: 25,
      pokeApiId: 25,
      name: "pikachu",
      generation: 1,
      types: ["electric"],
      syncedAt: new Date(),
    });
    const allLanguages = [...supportedLanguages, ...hiddenLanguages];
    const sets = await Set.create(allLanguages.map((language) => ({
      sourceId: `${language}-language-filter-set`,
      name: `${language} Language Filter Set`,
      language,
      cardCount: { official: 1, total: 1 },
    })));
    const cards = await Card.create(sets.map((set, index) => ({
      sourceId: `${allLanguages[index]}-language-filter-card`,
      name: "Language Pikachu",
      category: "Pokemon",
      cardType: "POKEMON",
      set: set._id,
      setId: set.sourceId,
      setName: set.name,
      localId: "1",
      rarity: "Illustration rare",
      classification: "ILLUSTRATION_RARE",
      language: allLanguages[index],
      dexIds: [25],
      syncedAt: new Date(),
    })));
    await PokemonCard.create(cards.map((card) => ({
      pokemon: pokemon._id,
      card: card._id,
      verificationStatus: "VERIFIED",
      sourceField: "tcgdex.dexId",
    })));
    await CollectionItem.create(cards.filter((_, index) => index !== 3).map((card) => ({
      card: card._id,
      language: card.language,
      finish: "holofoil",
      condition: "Near Mint",
      quantity: 1,
    })));
    await CollectionItem.create({
      card: cards[0]._id,
      language: "ja",
      finish: "holofoil",
      condition: "Near Mint",
      quantity: 1,
    });
    const reviewCards = await Card.create([
      {
        sourceId: "en-review-language-filter", name: "Pikachu", setId: "review-set-en", setName: "Review Set EN",
        localId: "2", category: "Pokemon", cardType: "POKEMON", classification: "NEEDS_REVIEW", language: "en",
        syncedAt: new Date(),
      },
      {
        sourceId: "ko-review-language-filter", name: "Pikachu", setId: "review-set-ko", setName: "Review Set KO",
        localId: "2", category: "Pokemon", cardType: "POKEMON", classification: "NEEDS_REVIEW", language: "ko",
        syncedAt: new Date(),
      },
    ]);
    await SyncStatus.create({
      key: "main",
      status: "idle",
      localeProgress: { en: { status: "completed" }, ko: { status: "completed" }, fr: { status: "completed" } },
      currentSetLanguage: "ko",
      currentSetId: "hidden-set",
      currentSetName: "Hidden Set",
    });
    const before = {
      cards: await Card.countDocuments(),
      sets: await Set.countDocuments(),
      links: await PokemonCard.countDocuments(),
      items: await CollectionItem.countDocuments(),
      hiddenCards: await Card.countDocuments({ language: { $in: hiddenLanguages } }),
      hiddenItems: await CollectionItem.countDocuments({ language: { $in: hiddenLanguages } }),
    };

    const [pokemonResponse, detailResponse, collectionResponse, missingResponse, optionsResponse, statsResponse,
      reviewResponse, coverageResponse, settingsResponse, syncResponse] = await Promise.all([
      fetch(`${httpBase}/api/pokemon`),
      fetch(`${httpBase}/api/pokemon/25`),
      fetch(`${httpBase}/api/collection`),
      fetch(`${httpBase}/api/cards/missing`),
      fetch(`${httpBase}/api/filters/options`),
      fetch(`${httpBase}/api/stats`),
      fetch(`${httpBase}/api/classification/review/summary`),
      fetch(`${httpBase}/api/settings/catalog-coverage`),
      fetch(`${httpBase}/api/settings`),
      fetch(`${httpBase}/api/sync/status`),
    ]);
    const [pokemonRows, detail, collection, missing, options, stats, review, coverage, settings, sync] = await Promise.all([
      pokemonResponse.json(), detailResponse.json(), collectionResponse.json(), missingResponse.json(), optionsResponse.json(),
      statsResponse.json(), reviewResponse.json(), coverageResponse.json(), settingsResponse.json(), syncResponse.json(),
    ]);

    expect(pokemonRows[0].totalCards).toBe(4);
    expect(detail.cards.map((card: { language: string }) => card.language).sort()).toEqual(supportedLanguages);
    expect(collection.map((item: { language: string }) => item.language).sort()).toEqual(["en", "ja", "zh-cn"]);
    expect(missing.map((card: { language: string }) => card.language)).toEqual(["zh-tw"]);
    expect(options.languages.sort()).toEqual(supportedLanguages);
    expect(stats).toMatchObject({ specialCardsTotal: 4, uniqueCardsOwned: 3, physicalCopiesOwned: 3 });
    expect(review.total).toBe(1);
    expect(coverage.byLanguage).toEqual(expect.objectContaining({ en: expect.any(Object), ja: expect.any(Object), "zh-cn": expect.any(Object), "zh-tw": expect.any(Object) }));
    expect(Object.keys(coverage.byLanguage).sort()).toEqual(supportedLanguages);
    expect(settings.counts).toMatchObject({ cards: 5, sets: 4, specialArtCards: 4 });
    expect(settings.tcgDexLanguages).toEqual(supportedLanguages);
    expect(Object.keys(settings.counts.byLanguage.cards).sort()).toEqual(supportedLanguages);
    expect(sync.localeProgress).toEqual({ en: { status: "completed" } });
    expect(sync.currentSetLanguage).toBeUndefined();
    for (const row of [...detail.cards, ...collection.map((item: { card: { language: string } }) => item.card), ...missing]) {
      expect(supportedLanguages).toContain(row.language);
    }

    const unsupportedSearch = await fetch(`${httpBase}/api/collectr/cards/search?q=Pikachu&language=ko`);
    expect(await unsupportedSearch.json()).toEqual([]);
    const supportedSearch = await fetch(`${httpBase}/api/collectr/cards/search?q=Language%20Pikachu&language=en`);
    expect((await supportedSearch.json()).map((card: { language: string }) => card.language)).toEqual(["en"]);
    const previewResponse = await fetch(`${httpBase}/api/collectr/preview`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: "Pikachu (KR)\nPikachu\nHidden Set\nIllustration Rare\n1/1\nNear Mint\nHolofoil\nQty: 1" }),
    });
    const preview = await previewResponse.json();
    expect(preview.records[0]).toMatchObject({
      record: { language: "ko" }, status: "unmatched", candidates: [], match: null,
    });
    expect(preview.records[0].reason).toContain("Unsupported language ko");
    const koCardId = String(cards[4]._id);
    const decisionResponse = await fetch(`${httpBase}/api/collectr/${preview.importId}/records/0/decision`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ cardId: koCardId, ignored: false }),
    });
    expect(decisionResponse.status).toBe(400);
    const commitResponse = await fetch(`${httpBase}/api/collectr/${preview.importId}/commit`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ decisions: [{ index: 0, cardId: koCardId }] }),
    });
    expect(commitResponse.status).toBe(400);

    expect(await Card.countDocuments()).toBe(before.cards);
    expect(await Set.countDocuments()).toBe(before.sets);
    expect(await PokemonCard.countDocuments()).toBe(before.links);
    expect(await CollectionItem.countDocuments()).toBe(before.items);
    expect(await Card.countDocuments({ language: { $in: hiddenLanguages } })).toBe(before.hiddenCards);
    expect(await CollectionItem.countDocuments({ language: { $in: hiddenLanguages } })).toBe(before.hiddenItems);
    expect(await Card.countDocuments({ _id: { $in: reviewCards.map((card) => card._id) }, classification: "NEEDS_REVIEW" })).toBe(2);

    await UserSettings.create({
      key: "local",
      filters: { collection: { language: "ko", search: "Pikachu" }, missing: { language: "fr" } },
    });
    const preferencesResponse = await fetch(`${httpBase}/api/settings/preferences`);
    const preferences = await preferencesResponse.json();
    expect(preferences.filters).toEqual({
      collection: { language: "", search: "Pikachu" },
      missing: { language: "" },
    });
    expect((await UserSettings.findOne({ key: "local" }).lean())?.filters).toEqual({
      collection: { language: "ko", search: "Pikachu" },
      missing: { language: "fr" },
    });
  });
});
