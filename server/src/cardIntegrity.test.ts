import { describe, expect, it } from "vitest";
import { buildCardIntegrityPlan } from "./cardIntegrity.js";

describe("buildCardIntegrityPlan", () => {
  it("verifies only the source dexId and retains cameo or unrelated links for review", () => {
    const plan = buildCardIntegrityPlan(
      [
        {
          id: "pokemon-card",
          category: "Pokemon",
          sourceCategory: "Pokemon",
          rarity: "Illustration rare",
          image: "https://assets.tcgdex.net/card",
          dexIds: [1],
          cameoDexIds: [2],
        },
      ],
      [
        {
          cardId: "pokemon-card",
          pokemonDexId: 1,
          currentVerificationStatus: "NEEDS_REVIEW",
          currentSourceField: "legacy",
        },
        {
          cardId: "pokemon-card",
          pokemonDexId: 2,
          currentVerificationStatus: "VERIFIED",
          currentSourceField: "tcgdex.cameoDexIds",
        },
      ],
      new Set([1, 2]),
    );

    expect(plan.relationshipUpdates).toEqual([
      {
        cardId: "pokemon-card",
        pokemonDexId: 1,
        verificationStatus: "VERIFIED",
        sourceField: "tcgdex.dexId",
        reviewReason: "",
      },
      {
        cardId: "pokemon-card",
        pokemonDexId: 2,
        verificationStatus: "NEEDS_REVIEW",
        sourceField: "tcgdex.cameoDexIds",
        reviewReason: "Only cameoDexIds identify this Pokémon; TCGdex does not document them as primary Pokémon relationships.",
      },
    ]);
    expect(plan.relationshipAdditions).toEqual([]);
  });

  it("plans a missing direct source relationship without inventing related evolutions", () => {
    const plan = buildCardIntegrityPlan(
      [
        {
          id: "bulbasaur-card",
          category: "Pokemon",
          sourceCategory: "Pokemon",
          rarity: "Illustration rare",
          image: "https://assets.tcgdex.net/card",
          dexIds: [1],
        },
      ],
      [],
      new Set([1, 2, 3]),
    );

    expect(plan.relationshipAdditions).toEqual([
      {
        cardId: "bulbasaur-card",
        pokemonDexId: 1,
        verificationStatus: "VERIFIED",
        sourceField: "tcgdex.dexId",
        reviewReason: "",
      },
    ]);
  });

  it("supports multiple source-identified Pokémon without adding cameo IDs", () => {
    const plan = buildCardIntegrityPlan(
      [{
        id: "multi-pokemon-card",
        category: "Pokemon",
        sourceCategory: "Pokemon",
        rarity: "Illustration rare",
        image: "https://assets.tcgdex.net/card",
        dexIds: [1, 25],
        cameoDexIds: [2],
      }],
      [],
      new Set([1, 2, 25]),
    );

    expect(plan.relationshipAdditions.map((link) => link.pokemonDexId)).toEqual([1, 25]);
  });

  it("flags Trainer links and preserves their records for audit instead of deleting them", () => {
    const plan = buildCardIntegrityPlan(
      [{
        id: "trainer-card",
        category: "Trainer",
        sourceCategory: "Trainer",
        rarity: "Special illustration rare",
        image: "https://assets.tcgdex.net/card",
        dexIds: [25],
      }],
      [{
        cardId: "trainer-card",
        pokemonDexId: 25,
        currentVerificationStatus: "VERIFIED",
        currentSourceField: "tcgdex.dexId",
      }],
      new Set([25]),
    );

    expect(plan.cards[0]).toMatchObject({
      classification: { cardType: "TRAINER", classification: "EXCLUDED" },
      pokemonRelationshipStatus: "NOT_APPLICABLE",
    });
    expect(plan.relationshipUpdates[0]).toMatchObject({
      verificationStatus: "NEEDS_REVIEW",
      reviewReason: "trainer cards cannot be linked to Pokémon pages.",
    });
    expect(plan.relationshipAdditions).toEqual([]);
  });

  it("applies manual classification overrides and records evidence changes", () => {
    const plan = buildCardIntegrityPlan(
      [{
        id: "manual-card",
        category: "Pokemon",
        sourceCategory: "Pokemon",
        rarity: "Common",
        image: "https://assets.tcgdex.net/card",
        dexIds: [1],
        currentClassification: "EXCLUDED",
        manualOverride: "ALTERNATE_ART",
      }],
      [],
      new Set([1]),
    );

    expect(plan.cards[0]).toMatchObject({
      classification: {
        classification: "ALTERNATE_ART",
        classificationSource: "manual",
        classificationReviewed: true,
      },
      classificationChanged: true,
      metadataChanged: true,
    });
  });
});
