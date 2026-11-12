import "./config.js";
import mongoose from "mongoose";
import { Card, Set as CardSet, SyncStatus } from "./models.js";

const port = Number(process.env.PORT ?? 5000);
const mongoUri = process.env.MONGODB_URI;

if (!mongoUri) {
  throw new Error("MONGODB_URI is required. Copy .env.example to .env and configure MongoDB.");
}

const configuredDatabase = new URL(mongoUri).pathname.replace(/^\/+/, "").split("/")[0];
if (configuredDatabase !== "Pokedex") {
  throw new Error(`MONGODB_URI must target the Pokedex database; got "${configuredDatabase || "(missing)"}".`);
}

async function migrateMultilingualIndexes(): Promise<void> {
  for (const model of [Card, CardSet]) {
    const duplicates = await model.aggregate([
      {
        $group: {
          _id: {
            language: { $ifNull: ["$language", "en"] },
            sourceId: "$sourceId",
          },
          count: { $sum: 1 },
        },
      },
      { $match: { count: { $gt: 1 } } },
      { $limit: 1 },
    ]);
    if (duplicates.length > 0) {
      throw new Error(`Cannot migrate ${model.collection.collectionName}: duplicate language/sourceId records exist.`);
    }

    const indexes = await model.collection.listIndexes().toArray();
    for (const index of indexes) {
      if (index.unique && Object.keys(index.key ?? {}).length === 1 && index.key?.sourceId === 1) {
        await model.collection.dropIndex(index.name);
      }
    }
    await model.updateMany({ language: { $exists: false } }, { $set: { language: "en" } });
    await model.collection.createIndex({ language: 1, sourceId: 1 }, { unique: true });
  }
  await Card.collection.createIndex({ language: 1, setId: 1, localId: 1 });
}

try {
  await mongoose.connect(mongoUri, { serverSelectionTimeoutMS: 10_000 });
  if (mongoose.connection.readyState !== 1 || mongoose.connection.db?.databaseName !== "Pokedex") {
    throw new Error("MongoDB connection did not reach the Pokedex database.");
  }
  console.info(`Connected to MongoDB database "${mongoose.connection.db.databaseName}".`);
  await migrateMultilingualIndexes();
  console.info("Verified language-scoped unique indexes for TCGdex sets and cards.");
  const interruptedSync = await SyncStatus.findOne({ key: "main", status: "running" }).lean();
  const lockExpired = !interruptedSync?.lockExpiresAt || interruptedSync.lockExpiresAt <= new Date();
  if (interruptedSync && lockExpired) {
    await SyncStatus.updateOne(
      {
        _id: interruptedSync._id,
        status: "running",
        $or: [{ lockExpiresAt: { $lte: new Date() } }, { lockExpiresAt: { $exists: false } }],
      },
      {
        $set: {
          status: "failed",
          lockOwner: "",
          lockExpiresAt: null,
          pokemonStatus: interruptedSync.pokemonStatus === "running" ? "failed" : interruptedSync.pokemonStatus,
          tcgDexStatus: interruptedSync.tcgDexStatus === "running" ? "failed" : interruptedSync.tcgDexStatus,
          completedAt: new Date(),
          error: "Synchronization was interrupted by an API server restart. Saved progress can be resumed.",
        },
      },
    );
    console.warn("Marked interrupted synchronization as failed; saved per-set progress is available to resume.");
  } else if (interruptedSync) {
    console.info(`Synchronization is active in another API process (lease expires ${interruptedSync.lockExpiresAt?.toISOString()}).`);
  }
} catch (error) {
  console.error("MongoDB connection failed:", error);
  throw error;
}
const { default: app } = await import("./app.js");

const server = app.listen(port, () => {
  console.info(`API listening at http://localhost:${port}`);
});

async function shutdown(signal: string): Promise<void> {
  console.info(`${signal} received; shutting down.`);
  server.close(async (error) => {
    if (error) {
      console.error("HTTP server shutdown failed:", error);
      process.exitCode = 1;
    }
    await mongoose.disconnect();
    process.exit();
  });
}

process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));
