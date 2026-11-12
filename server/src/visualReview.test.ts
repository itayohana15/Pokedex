import { describe, expect, it } from "vitest";
import { visualReviewNeighbor, visualReviewShortcut } from "../../client/src/visualReview.js";
import {
  matchingReviewImageCandidates,
  verifiedReviewImageCandidates,
  type ReviewImageCandidate,
  type ReviewImageIdentity,
} from "./visualReviewImageSources.js";

describe("Visual Gallery keyboard and image identity helpers", () => {
  it("maps the requested review keyboard shortcuts", () => {
    expect(visualReviewShortcut("a")).toBe("confirm");
    expect(visualReviewShortcut("D")).toBe("reject");
    expect(visualReviewShortcut("s")).toBe("undecided");
    expect(visualReviewShortcut("ArrowRight")).toBe("next");
    expect(visualReviewShortcut("ArrowLeft")).toBe("previous");
    expect(visualReviewShortcut("z")).toBe("zoom");
    expect(visualReviewShortcut("Escape")).toBeNull();
  });

  it("moves through the current page without wrapping at either edge", () => {
    expect(visualReviewNeighbor(0, 3, -1)).toBe(0);
    expect(visualReviewNeighbor(1, 3, 1)).toBe(2);
    expect(visualReviewNeighbor(2, 3, 1)).toBe(2);
    expect(visualReviewNeighbor(0, 0, 1)).toBeNull();
  });

  it("only exposes verified alternatives for the exact source identity", () => {
    const exact: ReviewImageIdentity = {
      sourceId: "SV-P-200", name: "Nのゾロア", language: "ja", setId: "SV-P", localId: "200", artist: "Jiro Sasumo",
    };
    const match = verifiedReviewImageCandidates(exact);
    expect(match).toHaveLength(1);
    expect(match[0]).toMatchObject({ sourceType: "official", sourceId: "SV-P-200", confidence: 100 });
    expect(verifiedReviewImageCandidates({ ...exact, language: "en" })).toEqual([]);
    expect(verifiedReviewImageCandidates({ ...exact, localId: "201" })).toEqual([]);
    expect(verifiedReviewImageCandidates({ ...exact, setId: "M-P" })).toEqual([]);
    expect(verifiedReviewImageCandidates({ ...exact, name: "Zorua" })).toEqual([]);
    expect(verifiedReviewImageCandidates({ ...exact, artist: "Another artist" })).toEqual([]);
  });

  it("can present multiple independently verified sources for one exact card", () => {
    const identity: ReviewImageIdentity = { sourceId: "fixture-1", name: "Eevee", language: "en", setId: "fixture-set", localId: "001" };
    const candidate = (id: string): ReviewImageCandidate => ({
      id,
      source: `Source ${id}`,
      sourceType: "community",
      sourceId: identity.sourceId,
      imageUrl: `https://images.example.test/${id}.jpg`,
      sourceUrl: `https://source.example.test/${id}`,
      checkedAt: "2026-11-12",
      confidence: 95,
      confidenceReason: "Matched language, set, card number and name.",
      matchedFields: ["name", "language", "setId", "localId"],
      identity,
    });
    const candidates = matchingReviewImageCandidates([candidate("one"), candidate("two")], identity);
    expect(candidates.map((item) => item.id)).toEqual(["one", "two"]);
  });
});
