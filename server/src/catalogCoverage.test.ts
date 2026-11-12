import { describe, expect, it } from "vitest";
import { evaluateSetCoverage } from "./catalogCoverage.js";

describe("evaluateSetCoverage", () => {
  it("marks a set full only when source count, source IDs, and saved cards agree", () => {
    expect(evaluateSetCoverage({
      detailAvailable: true,
      expectedTotal: 2,
      sourceCards: [{ id: "set-1", localId: "1" }, { id: "set-2", localId: "2" }],
      localCardIds: ["set-1", "set-2"],
      localCardNumbers: ["1", "2"],
    })).toMatchObject({ status: "FULL", sourceCardCount: 2, localCardCount: 2, missingCardNumbers: [] });
  });

  it("marks an incomplete source card list PARTIAL and reports exact missing card numbers", () => {
    expect(evaluateSetCoverage({
      detailAvailable: true,
      expectedTotal: 3,
      sourceCards: [{ id: "set-1", localId: "1" }, { id: "set-2", localId: "2" }, { id: "set-3", localId: "3" }],
      localCardIds: ["set-1", "set-3"],
      localCardNumbers: ["1", "3"],
    })).toMatchObject({
      status: "PARTIAL",
      missingSourceCardIds: ["set-2"],
      missingCardNumbers: ["2"],
      issue: expect.stringContaining("1 listed cards are missing locally"),
    });
  });

  it("marks empty TCGdex card lists as MISSING_DATA without deleting saved cards", () => {
    expect(evaluateSetCoverage({
      detailAvailable: true,
      expectedTotal: 10,
      sourceCards: [],
      localCardIds: ["old-card"],
      localCardNumbers: ["1"],
    })).toMatchObject({ status: "MISSING_DATA", extraLocalCardIds: ["old-card"] });
  });

  it("deduplicates repeated source IDs and reports the inconsistency", () => {
    expect(evaluateSetCoverage({
      detailAvailable: true,
      expectedTotal: 2,
      sourceCards: [{ id: "set-1", localId: "1" }, { id: "set-1", localId: "1" }],
      localCardIds: ["set-1"],
      localCardNumbers: ["1"],
    })).toMatchObject({ status: "PARTIAL", sourceCardCount: 1, duplicateSourceCardIds: 1 });
  });

  it("marks unavailable or incomplete source metadata MISSING_DATA", () => {
    expect(evaluateSetCoverage({
      detailAvailable: false,
      expectedTotal: 5,
      sourceCards: [],
      localCardIds: [],
      localCardNumbers: [],
    }).status).toBe("MISSING_DATA");
    expect(evaluateSetCoverage({
      detailAvailable: true,
      sourceCards: [],
      localCardIds: [],
      localCardNumbers: [],
    }).status).toBe("MISSING_DATA");
  });
});
