import { describe, expect, it } from "vitest";
import { parseCollectrText } from "./collectr.js";

describe("parseCollectrText", () => {
  it("parses a Collectr entry with market values", () => {
    const parsed = parseCollectrText([
      "Pikachu ex",
      "Pikachu ex",
      "Start Deck 100 Battle Collection",
      "•",
      "764/742",
      "Near Mint",
      "•",
      "Holofoil",
      "",
      "$999.88",
      "$0.00",
      "(0.00%)",
      "Qty: 1",
    ].join("\n"));

    expect(parsed.records).toHaveLength(1);
    expect(parsed.records[0]).toMatchObject({
      cardName: "Pikachu ex",
      setName: "Start Deck 100 Battle Collection",
      cardNumber: "764/742",
      language: "en",
      condition: "Near Mint",
      finish: "Holofoil",
      quantity: 1,
      marketPrice: 999.88,
      priceChange: 0,
      priceChangePercent: 0,
    });
    expect(parsed.records[0].originalText).toContain("Pikachu ex\nPikachu ex");
    expect(parsed.records[0].parseStatus).toBe("ready");
  });

  it("keeps language variants separate and parses multiple records", () => {
    const parsed = parseCollectrText([
      "Cubone (Full Art) (CN)",
      "Cubone (Full Art) (CN)",
      "Gem Pack Vol. 3",
      "Art Rare",
      "0407/07",
      "Lightly Played",
      "Holofoil",
      "Qty: 2",
      "Mew ex (JP)",
      "Collect 151 Surprise",
      "Special Art Rare",
      "191/151",
      "Qty: 1",
    ].join("\n"));

    expect(parsed.records).toHaveLength(2);
    expect(parsed.records[0]).toMatchObject({ cardName: "Cubone (Full Art)", language: "zh-cn", quantity: 2 });
    expect(parsed.records[1]).toMatchObject({ cardName: "Mew ex", language: "ja", quantity: 1 });
  });

  it("ignores fragments without valid positive quantities", () => {
    expect(parseCollectrText("Pikachu\nSome set\nQty: 0").records).toEqual([]);
    expect(parseCollectrText("Pikachu\nSome set").records).toEqual([]);
  });

  it("recognizes card numbers without a denominator", () => {
    const [record] = parseCollectrText("Pikachu\nPikachu\nPromo set\nPR-001\nQty: 1").records;
    expect(record.cardNumber).toBe("PR-001");
  });

  it("finds the supplied card records inside page-wide navigation and filter text", () => {
    const text = [
      "Portfolio",
      "Products",
      "Search",
      "Export",
      "Bulk Actions",
      "Filters",
      "Pikachu ex",
      "Pikachu ex",
      "Start Deck 100 Battle Collection",
      "•",
      "764/742",
      "Near Mint",
      "•",
      "Holofoil",
      "$999.88",
      "$0.00",
      "(0.00%)",
      "Qty: 1",
      "Cubone (Full Art) (CN)",
      "Cubone (Full Art) (CN)",
      "Gem Pack Vol. 3",
      "Art Rare",
      "•",
      "0407/07",
      "Near Mint",
      "•",
      "Holofoil",
      "Qty: 1",
      "Mew ex (JP)",
      "Mew ex (JP)",
      "Special Art Rare",
      "•",
      "191/151",
      "Near Mint",
      "•",
      "Holofoil",
      "Qty: 1",
    ].join("\n");
    const parsed = parseCollectrText(text);

    expect(parsed.records).toHaveLength(3);
    expect(parsed.records.map((record) => record.cardName)).toEqual([
      "Pikachu ex",
      "Cubone (Full Art)",
      "Mew ex",
    ]);
    expect(parsed.ignoredLines).toBe(6);
  });

  it("parses a whitespace-flattened whole-page copy from Collectr", () => {
    const text = [
      "Portfolio Products Search Export Bulk Actions Filters",
      "Pikachu ex  Pikachu ex Start Deck 100 Battle Collection • 764/742 Near Mint • Holofoil $999.88 $0.00 (0.00%) Qty: 1",
      "Zekrom ex  Zekrom ex Black Bolt Black White Rare • 172/086 Near Mint • Holofoil $577.23 -$10.30 (-1.75%) Qty: 1",
      "Ponyta (Full Art) CN  Ponyta (Full Art) CN Gem Pack Vol. 4 RRR • 0107/07 Near Mint • Holofoil $105.57 -$2.73 (-2.52%) Qty: 1",
      "Jolteon VMAX  Jolteon VMAX Sword & Shield Promo Promo • SWSH184 Near Mint • Holofoil $73.67 -$0.44 (-0.59%) Qty: 1",
    ].join(" ");
    const parsed = parseCollectrText(text);

    expect(parsed.records).toHaveLength(4);
    expect(parsed.records.map((record) => ({
      cardName: record.cardName,
      setName: record.setName,
      cardNumber: record.cardNumber,
      language: record.language,
    }))).toEqual([
      { cardName: "Pikachu ex", setName: "Start Deck 100 Battle Collection", cardNumber: "764/742", language: "en" },
      { cardName: "Zekrom ex", setName: "Black Bolt", cardNumber: "172/086", language: "en" },
      { cardName: "Ponyta (Full Art)", setName: "Gem Pack Vol. 4", cardNumber: "0107/07", language: "zh-cn" },
      { cardName: "Jolteon VMAX", setName: "Sword & Shield Promo", cardNumber: "SWSH184", language: "en" },
    ]);
    expect(parsed.records[3].rarity).toBe("Promo");
    expect(parsed.records[0].originalText).toContain("Pikachu ex  Pikachu ex");
    expect(parsed.ignoredLines).toBe(1);
  });

  it("resolves CN to Simplified Chinese and extracts language regardless of qualifier order", () => {
    const parsed = parseCollectrText([
      "Cubone (Full Art) (CN)",
      "Cubone (Full Art) (CN)",
      "Gem Pack Vol. 3",
      "Art Rare",
      "0407/07",
      "Qty: 1",
      "Mimikyu (CN) (Full Art)",
      "Mimikyu (CN) (Full Art)",
      "Gem Pack Vol. 3",
      "Art Rare",
      "1307/07",
      "Qty: 1",
      "Empoleon V (Alternate Full Art) (JP)",
      "Empoleon V (Alternate Full Art) (JP)",
      "Battle Styles",
      "Ultra Rare",
      "146/163",
      "Qty: 1",
    ].join("\n"));

    expect(parsed.records.map((record) => ({
      productName: record.productName,
      cardName: record.cardName,
      language: record.language,
    }))).toEqual([
      { productName: "Cubone (Full Art) (CN)", cardName: "Cubone (Full Art)", language: "zh-cn" },
      { productName: "Mimikyu (CN) (Full Art)", cardName: "Mimikyu (Full Art)", language: "zh-cn" },
      { productName: "Empoleon V (Alternate Full Art) (JP)", cardName: "Empoleon V (Alternate Full Art)", language: "ja" },
    ]);
  });

  it("keeps incomplete supplied records for review without inventing fields", () => {
    const parsed = parseCollectrText([
      "Mew ex (JP)",
      "Mew ex (JP)",
      "Special Art Rare",
      "191/151",
      "Qty: 1",
    ].join("\n"));

    expect(parsed.records).toHaveLength(1);
    expect(parsed.records[0]).toMatchObject({
      cardName: "Mew ex",
      setName: "",
      cardNumber: "191/151",
      language: "ja",
      condition: "Unknown",
      finish: "Unknown",
      parseStatus: "needs-review",
      reviewReasons: ["missing-set", "missing-condition", "missing-finish"],
    });
  });

  it("scales to one hundred entries using only the supplied Collectr examples", () => {
    const suppliedRecords = [
      "Pikachu ex\nPikachu ex\nStart Deck 100 Battle Collection\n764/742\nNear Mint\nHolofoil\nQty: 1",
      "Cubone (Full Art) (CN)\nCubone (Full Art) (CN)\nGem Pack Vol. 3\nArt Rare\n0407/07\nNear Mint\nHolofoil\nQty: 1",
      "Mew ex (JP)\nMew ex (JP)\nCollect 151 Surprise\nSpecial Art Rare\n191/151\nNear Mint\nHolofoil\nQty: 1",
    ];
    const text = Array.from({ length: 100 }, (_, index) => suppliedRecords[index % suppliedRecords.length]).join("\n");
    const parsed = parseCollectrText(text);

    expect(parsed.records).toHaveLength(100);
    expect(parsed.records.every((record) => record.originalText.includes("\nQty: 1"))).toBe(true);
  });

  it("reports all non-card page text as ignored instead of failing an empty preview", () => {
    const parsed = parseCollectrText("Portfolio\nProducts\nSearch\nExport\nBulk Actions\nFilters");
    expect(parsed).toMatchObject({ records: [], inputLines: 6, ignoredLines: 6 });
  });

  it("defaults unmarked and explicit English records to en", () => {
    const records = ["Pikachu", "Pikachu (EN)", "Pikachu (English)"].map((name) =>
      parseCollectrText(`${name}\nTest Set\nRare\n001/010\nNear Mint\nHolofoil\nQty: 1`).records[0],
    );
    expect(records.map((record) => ({ cardName: record.cardName, language: record.language }))).toEqual([
      { cardName: "Pikachu", language: "en" },
      { cardName: "Pikachu", language: "en" },
      { cardName: "Pikachu", language: "en" },
    ]);
  });

  it.each([
    "Holo Rare",
    "Secret Art Rare",
    "Special Rare",
    "Super Rare",
    "Shiny Rare",
    "Mega Attack Rare",
    "Hyper Rare",
    "ACE Spec Rare",
    "Radiant Rare",
  ])("extracts the printed rarity label %s", (rarity) => {
    const record = parseCollectrText(`Pikachu\nTest Set\n${rarity}\n001/010\nNear Mint\nHolofoil\nQty: 1`).records[0];
    expect(record).toMatchObject({ cardName: "Pikachu", setName: "Test Set", rarity, cardNumber: "001/010" });
  });

  it("finds an explicit language marker elsewhere in the copied record", () => {
    const record = parseCollectrText([
      "Pikachu",
      "Pikachu",
      "Test Set",
      "(Japanese)",
      "Rare",
      "001/010",
      "Qty: 1",
    ].join("\n")).records[0];
    expect(record).toMatchObject({ cardName: "Pikachu", language: "ja" });
  });

  it.each([
    ["Glaceon V (JP)", "Glaceon V", "ja"],
    ["Glaceon V (Japanese)", "Glaceon V", "ja"],
    ["Glaceon V (JPN)", "Glaceon V", "ja"],
    ["Cubone (Full Art) (CN)", "Cubone (Full Art)", "zh-cn"],
    ["Pikachu (Full Art) (TW)", "Pikachu (Full Art)", "zh-tw"],
    ["Charizard ex (KR)", "Charizard ex", "ko"],
    ["Charizard ex (Korean)", "Charizard ex", "ko"],
  ])("extracts language marker from %s", (productName, cardName, language) => {
    const record = parseCollectrText(`${productName}\nTest Set\nRare\n001/010\nNear Mint\nHolofoil\nQty: 1`).records[0];
    expect(record).toMatchObject({ productName, cardName, language });
    expect(record.originalText).toContain(productName);
  });

  it("strips language markers after multiple product qualifiers without removing qualifiers", () => {
    const record = parseCollectrText("Pikachu (Full Art) (Secret) (CN)\nTest Set\nRare\n001/010\nQty: 1").records[0];
    expect(record).toMatchObject({ cardName: "Pikachu (Full Art) (Secret)", language: "zh-cn" });
  });

  it("marks contradictory language markers for manual review", () => {
    const record = parseCollectrText("Pikachu (JP) (CN)\nTest Set\nRare\n001/010\nNear Mint\nHolofoil\nQty: 1").records[0];
    expect(record).toMatchObject({
      cardName: "Pikachu",
      language: "ja",
      languageCandidates: ["ja", "zh-cn"],
      parseStatus: "needs-review",
      reviewReasons: ["conflicting-language-markers"],
    });
  });
});
