import "./config.js";
import mongoose from "mongoose";
import { summarizeClassificationReview } from "./classificationReview.js";
import { Card, CardClassificationOverride, CardReviewAction, CollectionItem, PokemonCard } from "./models.js";

const mongoUri = process.env.MONGODB_URI;
if (!mongoUri) throw new Error("MONGODB_URI is required.");
if (new URL(mongoUri).pathname.replace(/^\/+/, "").split("/")[0] !== "Pokedex") {
  throw new Error("Review audit may only read the Pokedex database.");
}

await mongoose.connect(mongoUri, { serverSelectionTimeoutMS: 10_000 });
try {
  if (mongoose.connection.db?.databaseName !== "Pokedex") {
    throw new Error(`Connected to unexpected database ${mongoose.connection.db?.databaseName ?? "(missing)"}.`);
  }
  const cards = await Card.find({ classification: "NEEDS_REVIEW" })
    .select("sourceId name image setId setName localId rarity language category cardType artist variants dexIds classification classificationReason classificationConfidence sourceUpdatedAt syncedAt sourceData.category sourceData.set sourceData.variants sourceData.updated sourceData.illustrator sourceData.image sourceData.dexId")
    .lean();
  const [overrideCount, actionCount, cardCount, collectionItemCount, pokemonCardCount] = await Promise.all([
    CardClassificationOverride.countDocuments(),
    CardReviewAction.countDocuments(),
    Card.countDocuments(),
    CollectionItem.countDocuments(),
    PokemonCard.countDocuments(),
  ]);
  const { bySet, ...compactReport } = summarizeClassificationReview(cards);
  console.log(JSON.stringify({
    database: "Pokedex",
    mode: "read-only audit",
    analyzedAt: new Date().toISOString(),
    cardsAnalyzed: cards.length,
    totalCards: cardCount,
    collectionItems: collectionItemCount,
    pokemonCardRelations: pokemonCardCount,
    classificationOverrides: overrideCount,
    reviewActions: actionCount,
    report: { ...compactReport, setLanguageGroups: bySet.length },
  }, null, 2));
} finally {
  await mongoose.disconnect();
}
