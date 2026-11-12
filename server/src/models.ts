import mongoose, { Schema } from "mongoose";

const pokemonSchema = new Schema(
  {
    nationalDex: { type: Number, required: true, unique: true, index: true },
    pokeApiId: { type: Number, required: true, unique: true, index: true },
    name: { type: String, required: true, index: true },
    image: { type: String, default: "" },
    artwork: { type: String, default: "" },
    type1: { type: String, default: "" },
    type2: { type: String, default: "" },
    types: { type: [String], default: [] },
    generation: { type: Number, required: true, min: 1, max: 9 },
    sourceData: { type: Schema.Types.Mixed },
    syncedAt: { type: Date, required: true },
  },
  { timestamps: true },
);

const setSchema = new Schema(
  {
    sourceId: { type: String, required: true },
    language: { type: String, required: true, default: "en", index: true },
    name: { type: String, required: true },
    logo: { type: String, default: "" },
    cardCount: { type: Schema.Types.Mixed },
    sourceCardIds: { type: [String], default: undefined },
    sourceCardNumbers: { type: [String], default: undefined },
    catalogStatus: {
      type: String,
      enum: ["FULL", "PARTIAL", "MISSING_DATA", "NOT_CHECKED"],
      default: "NOT_CHECKED",
      index: true,
    },
    catalogSourceChecked: { type: Boolean, default: false },
    catalogIssue: { type: String, default: "" },
    catalogCheckedAt: { type: Date },
    updatedAtSource: { type: Date },
  },
  { timestamps: true },
);
setSchema.index({ language: 1, sourceId: 1 }, { unique: true });

const cardSchema = new Schema(
  {
    sourceId: { type: String, required: true },
    name: { type: String, required: true, index: true },
    image: { type: String, default: "" },
    set: { type: Schema.Types.ObjectId, ref: "Set" },
    setId: { type: String, required: true, index: true },
    setName: { type: String, required: true, index: true },
    localId: { type: String, required: true, index: true },
    rarity: { type: String, default: "" },
    cardType: {
      type: String,
      enum: ["POKEMON", "TRAINER", "ENERGY", "OTHER", "UNKNOWN"],
      default: "UNKNOWN",
      index: true,
    },
    classification: {
      type: String,
      enum: [
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
        "EXCLUDED",
        "NEEDS_REVIEW",
      ],
      required: true,
      index: true,
    },
    isSpecialArt: { type: Boolean, default: false, index: true },
    classificationConfidence: { type: Number, min: 0, max: 100, default: 0 },
    classificationReason: { type: String, default: "" },
    classificationSource: { type: String, enum: ["tcgdex", "manual"], default: "tcgdex" },
    classificationReviewed: { type: Boolean, default: false },
    pokemonRelationshipStatus: {
      type: String,
      enum: ["VERIFIED", "NEEDS_REVIEW", "NOT_APPLICABLE"],
      default: "NEEDS_REVIEW",
      index: true,
    },
    pokemonRelationshipReason: { type: String, default: "" },
    artist: { type: String, default: "" },
    language: { type: String, required: true, default: "en", index: true },
    variants: { type: Schema.Types.Mixed },
    dexIds: { type: [Number], default: [] },
    cameoDexIds: { type: [Number], default: [] },
    category: { type: String, default: "" },
    sourceData: { type: Schema.Types.Mixed },
    sourceUpdatedAt: { type: Date },
    syncedAt: { type: Date, required: true },
  },
  { timestamps: true },
);
cardSchema.index({ language: 1, sourceId: 1 }, { unique: true });
cardSchema.index({ language: 1, setId: 1, localId: 1 });

const pokemonCardSchema = new Schema(
  {
    pokemon: { type: Schema.Types.ObjectId, ref: "Pokemon", required: true },
    card: { type: Schema.Types.ObjectId, ref: "Card", required: true },
    verificationStatus: {
      type: String,
      enum: ["VERIFIED", "NEEDS_REVIEW"],
      default: "NEEDS_REVIEW",
      index: true,
    },
    sourceField: { type: String, enum: ["tcgdex.dexId", "tcgdex.cameoDexIds", "legacy"], default: "legacy" },
    reviewReason: { type: String, default: "" },
  },
  { timestamps: true },
);
pokemonCardSchema.index({ pokemon: 1, card: 1 }, { unique: true });

const collectionItemSchema = new Schema(
  {
    card: { type: Schema.Types.ObjectId, ref: "Card", required: true },
    language: { type: String, required: true, default: "en" },
    finish: { type: String, required: true, default: "normal" },
    condition: {
      type: String,
      required: true,
      default: "Near Mint",
      enum: ["Near Mint", "Lightly Played", "Moderately Played", "Heavily Played", "Damaged", "Unknown"],
    },
    quantity: { type: Number, required: true, min: 0, default: 1 },
  },
  { timestamps: true },
);
collectionItemSchema.index({ card: 1, language: 1, finish: 1, condition: 1 }, { unique: true });

const importHistorySchema = new Schema(
  {
    source: { type: String, required: true, enum: ["collectr"] },
    status: { type: String, required: true, enum: ["previewed", "completed", "failed", "rolled-back"] },
    originalText: { type: String, required: true },
    records: { type: [Schema.Types.Mixed], default: [] },
    error: { type: String },
    completedAt: { type: Date },
  },
  { timestamps: true },
);

const collectrMatchOverrideSchema = new Schema(
  {
    recordKey: { type: String, required: true, unique: true },
    card: { type: Schema.Types.ObjectId, ref: "Card", required: true },
    recordIdentity: { type: Schema.Types.Mixed, required: true },
    source: { type: String, enum: ["manual"], required: true, default: "manual" },
  },
  { timestamps: true },
);

const classificationOverrideSchema = new Schema(
  {
    card: { type: Schema.Types.ObjectId, ref: "Card", required: true, unique: true },
    classification: {
      type: String,
      enum: [
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
        "EXCLUDED",
        "NEEDS_REVIEW",
      ],
      required: true,
    },
  },
  { timestamps: true },
);

const cardReviewActionSchema = new Schema(
  {
    card: { type: Schema.Types.ObjectId, ref: "Card", required: true, index: true },
    action: {
      type: String,
      enum: ["CONFIRM_SPECIAL_ART", "MARK_NOT_SPECIAL_ART", "KEEP_NEEDS_REVIEW", "SKIP"],
      required: true,
    },
    classification: {
      type: String,
      enum: [
        "ILLUSTRATION_RARE", "SPECIAL_ILLUSTRATION_RARE", "ALTERNATE_ART", "FULL_ART",
        "BLACK_WHITE_RARE", "AMAZING_RARE", "GALLERY_ART", "V_SPECIAL_ART",
        "VMAX_SPECIAL_ART", "VSTAR_SPECIAL_ART", "SPECIAL_ART_PROMO", "EXCLUDED",
      ],
    },
    previousClassification: { type: String, default: "" },
    resultingClassification: { type: String, default: "" },
    evidence: { type: [Schema.Types.Mixed], default: [] },
    sourceId: { type: String, default: "" },
    sourceUrl: { type: String, default: "" },
    actor: { type: String, default: "local user" },
    note: { type: String, default: "" },
  },
  { timestamps: true },
);
cardReviewActionSchema.index({ card: 1, createdAt: -1 });

const userSettingsSchema = new Schema(
  {
    key: { type: String, required: true, unique: true, default: "local" },
    defaultSort: { type: String, default: "nationalDex" },
    view: { type: String, enum: ["grid", "list"], default: "grid" },
    filters: { type: Schema.Types.Mixed, default: {} },
    theme: { type: String, enum: ["light", "dark"], default: "light" },
  },
  { timestamps: true },
);

const syncStatusSchema = new Schema(
  {
    key: { type: String, required: true, unique: true, default: "main" },
    status: { type: String, enum: ["idle", "running", "completed", "failed"], default: "idle" },
    startedAt: { type: Date },
    completedAt: { type: Date },
    lastSuccessfulAt: { type: Date },
    pokemonProcessed: { type: Number, default: 0 },
    pokemonTotal: { type: Number, default: 0 },
    pokemonStatus: { type: String, enum: ["idle", "running", "completed", "failed"], default: "idle" },
    cardsProcessed: { type: Number, default: 0 },
    cardsTotal: { type: Number, default: 0 },
    setsProcessed: { type: Number, default: 0 },
    setsTotal: { type: Number, default: 0 },
    tcgDexStatus: { type: String, enum: ["idle", "running", "completed", "failed"], default: "idle" },
    completedSetIds: { type: [String], default: [] },
    localeProgress: { type: Schema.Types.Mixed, default: {} },
    lockOwner: { type: String, default: "" },
    lockExpiresAt: { type: Date },
    currentSetId: { type: String, default: "" },
    currentSetName: { type: String, default: "" },
    currentSetLanguage: { type: String, default: "" },
    error: { type: String },
  },
  { timestamps: true },
);

export const Pokemon = mongoose.model("Pokemon", pokemonSchema, "pokemons");
export const Set = mongoose.model("Set", setSchema, "sets");
export const Card = mongoose.model("Card", cardSchema, "cards");
export const PokemonCard = mongoose.model("PokemonCard", pokemonCardSchema, "pokemoncards");
export const CollectionItem = mongoose.model("CollectionItem", collectionItemSchema, "collectionitems");
export const ImportHistory = mongoose.model("ImportHistory", importHistorySchema, "importhistories");
export const CollectrMatchOverride = mongoose.model(
  "CollectrMatchOverride",
  collectrMatchOverrideSchema,
  "collectrmatchoverrides",
);
export const CardClassificationOverride = mongoose.model(
  "CardClassificationOverride",
  classificationOverrideSchema,
  "cardclassificationoverrides",
);
export const CardReviewAction = mongoose.model("CardReviewAction", cardReviewActionSchema, "cardreviewactions");
export const UserSettings = mongoose.model("UserSettings", userSettingsSchema, "usersettings");
export const SyncStatus = mongoose.model("SyncStatus", syncStatusSchema, "syncstatuses");
