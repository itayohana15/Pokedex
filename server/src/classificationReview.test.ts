import { describe, expect, it } from "vitest";
import {
  buildClassificationEvidence,
  getPrimaryReviewReason,
  getReviewMetadataCompleteness,
  getReviewReasonGroups,
  summarizeClassificationReview,
} from "./classificationReview.js";

const base = {
  _id: "card-1",
  sourceId: "sv1-203",
  name: "Pikachu",
  setId: "sv1",
  setName: "Scarlet & Violet",
  localId: "203",
  rarity: "Ultra Rare",
  image: "https://assets.tcgdex.net/en/sv/sv1/203",
  language: "en",
  category: "Pokemon",
  cardType: "POKEMON",
  classification: "NEEDS_REVIEW",
  classificationConfidence: 20,
  syncedAt: new Date("2026-11-11T10:00:00.000Z"),
  sourceData: {
    id: "sv1-203",
    name: "Pikachu",
    localId: "203",
    category: "Pokemon",
    rarity: "Ultra Rare",
    set: { id: "sv1", name: "Scarlet & Violet" },
  },
};

describe("classification review evidence and grouping", () => {
  it("groups missing rarity and missing image without making a classification decision", () => {
    const card = { ...base, rarity: "", image: "", sourceData: { ...base.sourceData, rarity: "", image: "" } };
    expect(getPrimaryReviewReason(card)).toBe("rarity_missing");
    expect(getReviewReasonGroups(card)).toEqual(expect.arrayContaining([
      "rarity_missing",
      "image_missing",
      "source_insufficient",
    ]));
    expect(card.classification).toBe("NEEDS_REVIEW");
  });

  it("separates ambiguous rarity, Full Art, Alternate Art, and promo candidate groups", () => {
    expect(getPrimaryReviewReason({ ...base, rarity: "Ultra Rare" })).toBe("rarity_ambiguous");
    expect(getPrimaryReviewReason({ ...base, rarity: "Full Art" })).toBe("full_art_possible");
    expect(getPrimaryReviewReason({ ...base, rarity: "Alternate Art" })).toBe("alternate_art_possible");
    expect(getPrimaryReviewReason({ ...base, rarity: "Promo" })).toBe("special_promo_possible");
  });

  it("scores only source metadata completeness and keeps image availability separate", () => {
    expect(getReviewMetadataCompleteness(base)).toMatchObject({ score: 100, present: 8, total: 8, missingFields: [] });
    expect(getReviewMetadataCompleteness({ ...base, rarity: "None" })).toMatchObject({
      score: 88,
      present: 7,
      total: 8,
      missingFields: ["rarity"],
    });
  });

  it("records TCGdex source identity, verification date, and evidence per field", () => {
    const evidence = buildClassificationEvidence(base);
    expect(evidence[0]).toMatchObject({
      field: "cardName",
      value: "Pikachu",
      source: "TCGdex",
      sourceId: "sv1-203",
      sourceUrl: "https://api.tcgdex.net/v2/en/cards/sv1-203",
      checkedAt: "2026-11-11T10:00:00.000Z",
      confidence: "direct-source-field",
    });
    expect(evidence.find((field) => field.field === "rarity")?.value).toBe("Ultra Rare");
    expect(evidence.find((field) => field.field === "image")?.note).toContain("does not prove");
  });

  it("summarizes overlapping reason flags without changing card classifications", () => {
    const cards = [base, { ...base, rarity: "", image: "", sourceData: { ...base.sourceData, rarity: "", image: "" } }, { ...base, rarity: "Promo" }];
    expect(summarizeClassificationReview(cards)).toMatchObject({
      total: 3,
      imageUrlCount: 2,
      imageUrlMissing: 1,
      completeMetadataCount: 2,
      reasonGroupCounts: {
        rarity_missing: 1,
        rarity_ambiguous: 1,
        special_promo_possible: 1,
        image_missing: 1,
        source_insufficient: 3,
      },
    });
    expect(cards.every((card) => card.classification === "NEEDS_REVIEW")).toBe(true);
  });
});
