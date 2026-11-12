export const REVIEW_CLASSIFICATIONS = [
  ["ILLUSTRATION_RARE", "Illustration / Art Rare"],
  ["SPECIAL_ILLUSTRATION_RARE", "Special Illustration / Art Rare"],
  ["ALTERNATE_ART", "Alternate Art"],
  ["FULL_ART", "Full Art"],
  ["BLACK_WHITE_RARE", "Black White Rare"],
  ["AMAZING_RARE", "Amazing Rare"],
  ["GALLERY_ART", "Gallery Art"],
  ["V_SPECIAL_ART", "V Special Art"],
  ["VMAX_SPECIAL_ART", "VMAX Special Art"],
  ["VSTAR_SPECIAL_ART", "VSTAR Special Art"],
  ["SPECIAL_ART_PROMO", "Special Art Promo"],
] as const;

export type VisualReviewShortcut = "confirm" | "reject" | "undecided" | "next" | "previous" | "zoom" | null;

export function visualReviewShortcut(key: string): VisualReviewShortcut {
  const normalized = key.toLocaleLowerCase();
  if (normalized === "a") return "confirm";
  if (normalized === "d") return "reject";
  if (normalized === "s") return "undecided";
  if (key === "ArrowRight") return "next";
  if (key === "ArrowLeft") return "previous";
  if (normalized === "z") return "zoom";
  return null;
}

export function visualReviewNeighbor(currentIndex: number, length: number, direction: -1 | 1): number | null {
  if (length <= 0) return null;
  return Math.min(Math.max(currentIndex + direction, 0), length - 1);
}
