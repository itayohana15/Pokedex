import { describe, expect, it } from "vitest";
import {
  applyClassificationOverride,
  classifyCard,
  getSpecialArtDecisionStatus,
  getRelationshipReviewReason,
  getVerifiedDexIds,
} from "./classification.js";

describe("classifyCard", () => {
  it("uses the source category to exclude Trainer, Energy, and other non-Pokémon cards", () => {
    expect(classifyCard({ category: "Trainer", rarity: "Special illustration rare", hasArtwork: true }))
      .toMatchObject({ cardType: "TRAINER", classification: "EXCLUDED", isSpecialArt: false });
    expect(classifyCard({ category: "Energy", rarity: "Promo", hasArtwork: true }))
      .toMatchObject({ cardType: "ENERGY", classification: "EXCLUDED" });
    expect(classifyCard({ category: "Other", rarity: "Illustration Rare", hasArtwork: true }))
      .toMatchObject({ cardType: "OTHER", classification: "EXCLUDED" });
  });

  it("requires a known, non-conflicting category to include a Pokémon card", () => {
    expect(classifyCard({ rarity: "Illustration Rare", hasArtwork: true }))
      .toMatchObject({ cardType: "UNKNOWN", classification: "NEEDS_REVIEW" });
    expect(classifyCard({
      category: "Pokemon",
      sourceCategory: "Trainer",
      rarity: "Illustration Rare",
      hasArtwork: true,
    })).toMatchObject({ cardType: "UNKNOWN", classification: "NEEDS_REVIEW" });
  });

  it.each([
    ["Illustration Rare", "ILLUSTRATION_RARE"],
    ["Art Rare", "ILLUSTRATION_RARE"],
    ["AR", "ILLUSTRATION_RARE"],
    ["Character Rare", "ILLUSTRATION_RARE"],
    ["Special Illustration Rare", "SPECIAL_ILLUSTRATION_RARE"],
    ["Special Art Rare", "SPECIAL_ILLUSTRATION_RARE"],
    ["SAR", "SPECIAL_ILLUSTRATION_RARE"],
    ["SIR", "SPECIAL_ILLUSTRATION_RARE"],
    ["Character Super Rare", "SPECIAL_ILLUSTRATION_RARE"],
    ["Alternate Art", "ALTERNATE_ART"],
    ["Alt Art", "ALTERNATE_ART"],
    ["Special Art Promo", "SPECIAL_ART_PROMO"],
  ] as const)("classifies explicit Pokémon special-art rarity %s", (rarity, classification) => {
    expect(classifyCard({ category: "Pokemon", rarity, hasArtwork: true }))
      .toMatchObject({
        cardType: "POKEMON",
        classification,
        isSpecialArt: true,
        classificationConfidence: 95,
        classificationSource: "tcgdex",
      });
  });

  it("does not rely on an unverified image URL when category and explicit rarity identify Special Art", () => {
    expect(classifyCard({ category: "Pokemon", rarity: "Illustration Rare", hasArtwork: false }))
      .toMatchObject({ classification: "ILLUSTRATION_RARE", isSpecialArt: true, classificationConfidence: 95 });
  });

  it("classifies Black White Rare and metadata-identified VSTAR gallery cards", () => {
    expect(classifyCard({
      category: "Pokemon",
      rarity: "Black White Rare",
      hasArtwork: true,
    })).toMatchObject({ classification: "BLACK_WHITE_RARE", isSpecialArt: true });

    expect(classifyCard({
      category: "Pokemon",
      rarity: "Secret Rare",
      hasArtwork: false,
      name: "Origin Forme Dialga VSTAR",
      setId: "swsh12.5gg",
      localId: "GG68",
    })).toMatchObject({
      classification: "VSTAR_SPECIAL_ART",
      isSpecialArt: true,
      classificationSource: "tcgdex",
    });

    expect(classifyCard({
      category: "Trainer",
      rarity: "Secret Rare",
      hasArtwork: true,
      name: "Pokémon VSTAR",
      setId: "swsh12.5gg",
      localId: "GG68",
    })).toMatchObject({ cardType: "TRAINER", classification: "EXCLUDED", isSpecialArt: false });
  });

  it("recognizes Gallery artwork and Amazing Rare without promoting ordinary Pokémon", () => {
    expect(classifyCard({
      category: "Pokemon",
      rarity: "Rare",
      hasArtwork: false,
      name: "Turtwig",
      setId: "swsh12.5gg",
      localId: "GG31",
    })).toMatchObject({ classification: "GALLERY_ART", isSpecialArt: true });

    expect(classifyCard({ category: "Pokemon", rarity: "Amazing Rare", hasArtwork: true }))
      .toMatchObject({ classification: "AMAZING_RARE", isSpecialArt: true });

    expect(classifyCard({
      category: "Pokemon",
      rarity: "Rare",
      hasArtwork: true,
      name: "Turtwig",
      setId: "swsh12.5",
      localId: "GG31",
    })).toMatchObject({ classification: "EXCLUDED", isSpecialArt: false });
  });

  it("does not promote ordinary V, VMAX, VSTAR, or promos without artwork evidence", () => {
    for (const name of ["Glaceon V", "Jolteon VMAX", "Mew VSTAR"]) {
      expect(classifyCard({ category: "Pokemon", rarity: "Double Rare", name, hasArtwork: true }))
        .toMatchObject({ classification: "EXCLUDED", isSpecialArt: false });
    }
    expect(classifyCard({ category: "Pokemon", rarity: "Promo", name: "Vaporeon V", hasArtwork: true }))
      .toMatchObject({ classification: "NEEDS_REVIEW", isSpecialArt: false });
  });

  it("does not promote ordinary or ambiguous rarities based on rarity alone", () => {
    expect(classifyCard({ category: "Pokemon", rarity: "Double Rare", hasArtwork: true }))
      .toMatchObject({ classification: "EXCLUDED" });
    for (const rarity of ["Promo", "Ultra Rare", "Secret Rare", "None", ""]) {
      expect(classifyCard({ category: "Pokemon", rarity, hasArtwork: true }))
        .toMatchObject({ classification: "NEEDS_REVIEW", isSpecialArt: false });
    }
  });

  it("keeps generic Full Art and Promo cards for review without stronger source evidence", () => {
    for (const rarity of ["Full Art", "Full Art Promo", "Promo"]) {
      expect(classifyCard({ category: "Pokemon", rarity, hasArtwork: true }))
        .toMatchObject({ classification: "NEEDS_REVIEW", isSpecialArt: false });
    }
  });

  it("keeps a manual classification override ahead of automatic classification", () => {
    const automatic = classifyCard({ category: "Pokemon", rarity: "Common", hasArtwork: true });
    expect(applyClassificationOverride(automatic, "ALTERNATE_ART")).toMatchObject({
      cardType: "POKEMON",
      classification: "ALTERNATE_ART",
      isSpecialArt: true,
      classificationConfidence: 100,
      classificationSource: "manual",
      classificationReviewed: true,
    });
    expect(applyClassificationOverride(automatic, "NEEDS_REVIEW")).toMatchObject({
      cardType: "POKEMON",
      classification: "NEEDS_REVIEW",
      isSpecialArt: false,
      classificationSource: "manual",
      classificationReviewed: true,
    });
  });

  it("does not let a manual Special Art override include a Trainer or unknown card type", () => {
    const trainer = classifyCard({ category: "Trainer", rarity: "Rare", hasArtwork: true });
    expect(applyClassificationOverride(trainer, "SPECIAL_ILLUSTRATION_RARE"))
      .toMatchObject({ cardType: "TRAINER", classification: "EXCLUDED", isSpecialArt: false });
    const unknown = classifyCard({ rarity: "Rare", hasArtwork: true });
    expect(applyClassificationOverride(unknown, "SPECIAL_ILLUSTRATION_RARE"))
      .toMatchObject({ cardType: "UNKNOWN", classification: "NEEDS_REVIEW", isSpecialArt: false });
  });

  it("exposes the three collection decisions independently of the specific Special Art family", () => {
    expect(getSpecialArtDecisionStatus("POKEMON", "ILLUSTRATION_RARE")).toBe("CONFIRMED_SPECIAL_ART");
    expect(getSpecialArtDecisionStatus("POKEMON", "NEEDS_REVIEW")).toBe("NEEDS_REVIEW");
    expect(getSpecialArtDecisionStatus("TRAINER", "EXCLUDED")).toBe("NOT_SPECIAL_ART");
    expect(getSpecialArtDecisionStatus("POKEMON", "EXCLUDED")).toBe("NOT_SPECIAL_ART");
  });
});

describe("verified Pokémon relationships", () => {
  it("uses only documented dexIds and never adds cameo or evolution-family IDs", () => {
    expect(getVerifiedDexIds("POKEMON", [1, 1, 0, -2, 2.5])).toEqual([1]);
    expect(getVerifiedDexIds("TRAINER", [25])).toEqual([]);
    expect(getRelationshipReviewReason("POKEMON", [1], [2], new Set([1, 2]))).toBeNull();
  });

  it("marks cameo-only and unresolved source relationships for review", () => {
    expect(getRelationshipReviewReason("POKEMON", [], [25], new Set([25])))
      .toContain("Only cameoDexIds");
    expect(getRelationshipReviewReason("POKEMON", [25], [], new Set()))
      .toContain("missing from the local Pokédex");
    expect(getRelationshipReviewReason("POKEMON", [], [], new Set()))
      .toContain("no verified dexId");
  });
});
