import { describe, expect, it } from "vitest";
import { parseCollectrText } from "./collectr.js";
import {
  collectrRecordKey,
  matchesRecordLanguage,
  matchingLanguages,
  normalizeCardName,
  normalizeCardNumber,
  normalizeRarity,
  recordLanguageMatches,
} from "./cardMatching.js";

describe("Collectr card identity normalization", () => {
  it("removes only known product-art labels from the comparison name", () => {
    expect(normalizeCardName("Empoleon V (Alternate Full Art)")).toBe(normalizeCardName("Empoleon V"));
    expect(normalizeCardName("Origin Forme Dialga VSTAR (Secret)"))
      .toBe(normalizeCardName("Origin Forme Dialga VSTAR"));
    expect(normalizeCardName("Origin Forme Dialga VSTAR")).not.toBe(normalizeCardName("Dialga VSTAR"));
  });

  it("normalizes leading zeros and rarity capitalization without erasing card suffixes", () => {
    expect(normalizeCardNumber("091/086")).toBe(normalizeCardNumber("91"));
    expect(normalizeCardNumber("SWSH181")).toBe(normalizeCardNumber("swsh181"));
    expect(normalizeCardNumber("GG68/GG70")).toBe(normalizeCardNumber("gg68"));
    expect(normalizeRarity("Black White Rare")).toBe(normalizeRarity("black white rare"));
  });

  it("resolves CN to Simplified Chinese and blocks other printing languages", () => {
    const [record] = parseCollectrText([
      "Mew ex (CN)",
      "Mew ex (CN)",
      "Collect 151 Surprise",
      "Special Art Rare",
      "191/151",
      "Qty: 1",
    ].join("\n")).records;
    expect(record.language).toBe("zh-cn");
    expect(matchingLanguages(record.language)).toEqual(["zh-cn"]);
    expect(recordLanguageMatches(record.language, "zh-cn")).toBe(true);
    expect(recordLanguageMatches(record.language, "zh-tw")).toBe(false);
    expect(recordLanguageMatches(record.language, "en")).toBe(false);
  });

  it("defaults omitted language to English and keeps explicit printings in the identity", () => {
    const [english] = parseCollectrText("Mew ex\nCollect 151 Surprise\nSpecial Art Rare\n191/151\nQty: 1").records;
    const [japanese] = parseCollectrText("Mew ex (JP)\nCollect 151 Surprise\nSpecial Art Rare\n191/151\nQty: 1").records;
    expect(english.language).toBe("en");
    expect(matchesRecordLanguage(english, "en")).toBe(true);
    expect(matchesRecordLanguage(english, "ja")).toBe(false);
    expect(collectrRecordKey(english)).not.toBe(collectrRecordKey(japanese));
  });

  it("allows language candidates only for conflicting markers that require review", () => {
    const [record] = parseCollectrText("Pikachu (JP) (CN)\nTest Set\nRare\n001/010\nQty: 1").records;
    expect(record.parseStatus).toBe("needs-review");
    expect(matchesRecordLanguage(record, "ja")).toBe(true);
    expect(matchesRecordLanguage(record, "zh-cn")).toBe(true);
    expect(matchesRecordLanguage(record, "en")).toBe(false);
  });

  it("keeps an unspecific Chinese language marker separate from both exact locales", () => {
    const [record] = parseCollectrText("Pikachu (Chinese)\nTest Set\nRare\n001/010\nQty: 1").records;
    expect(record.language).toBe("zh-unknown");
    expect(matchesRecordLanguage(record, "zh-cn")).toBe(true);
    expect(matchesRecordLanguage(record, "zh-tw")).toBe(true);
    expect(matchesRecordLanguage(record, "en")).toBe(false);
  });

  it("creates stable manual-override identity keys from normalized card identity", () => {
    const [first] = parseCollectrText("Deerling\nWhite Flare\nIllustration Rare\n091/086\nQty: 1").records;
    const [second] = parseCollectrText("Deerling\nwhite   flare\nillustration rare\n91/086\nQty: 2").records;
    expect(collectrRecordKey(first)).toBe(collectrRecordKey(second));
  });
});
