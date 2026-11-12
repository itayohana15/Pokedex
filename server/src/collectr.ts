export type CollectrReviewReason =
  | "missing-card-name"
  | "missing-set"
  | "missing-card-number"
  | "conflicting-language-markers"
  | "missing-condition"
  | "missing-finish"
  | "incomplete-record";

export interface CollectrRecord {
  originalText: string;
  productName: string;
  cardName: string;
  setName: string;
  rarity: string;
  cardNumber: string;
  language: string;
  condition: string;
  finish: string;
  quantity: number;
  languageCandidates?: string[];
  marketPrice?: number;
  priceChange?: number;
  priceChangePercent?: number;
  parseStatus: "ready" | "needs-review";
  reviewReasons: CollectrReviewReason[];
}

export interface CollectrParseResult {
  records: CollectrRecord[];
  ignoredLines: number;
  inputLines: number;
}

const CONDITIONS = [
  "Near Mint",
  "Lightly Played",
  "Moderately Played",
  "Heavily Played",
  "Damaged",
  "Poor",
];
const RARITIES = [
  "Special Illustration Rare",
  "Special Art Rare",
  "Special Illustration",
  "Special Art",
  "Secret Art Rare",
  "Mega Attack Rare",
  "Radiant Rare",
  "ACE Spec Rare",
  "Hyper Rare",
  "Super Rare",
  "Special Rare",
  "Shiny Rare",
  "Black White Rare",
  "Illustration Rare",
  "Art Rare",
  "Alternate Art",
  "Alternate Full Art",
  "Full Art",
  "Black White Rare",
  "Black and White Rare",
  "Amazing Rare",
  "Ultra Rare",
  "Secret Rare",
  "Promo",
  "Double Rare",
  "Holo Rare",
  "Rare Holo",
  "Rare",
  "Uncommon",
  "Common",
  "RRR",
  "SIR",
  "SAR",
  "IR",
  "AR",
  "None",
];
const FINISHES = [
  "Reverse Holofoil",
  "Holofoil",
  "Cosmos Holo",
  "Non-Holo",
  "Non Holo",
  "Reverse Holo",
  "Holo",
];
const CHROME_LINES = new Set([
  "search",
  "export",
  "bulk actions",
  "portfolio",
  "products",
  "filters",
  "filter",
  "clear filters",
  "clear all",
  "sort",
  "sort by",
  "add filter",
  "add filters",
  "select all",
  "select",
  "cancel",
  "apply",
  "apply filters",
  "close",
  "menu",
  "home",
  "dashboard",
  "market",
  "collection",
  "my collection",
  "wishlist",
  "settings",
  "profile",
  "account",
  "products",
  "pokemon",
  "pokémon",
  "total value",
  "market value",
  "value",
  "price",
  "price change",
  "quantity",
  "qty",
]);

interface SourceLine {
  raw: string;
  value: string;
  index: number;
}

function parseMoney(value: string | undefined): number | undefined {
  if (!value) return undefined;
  const parsed = Number(value.replace(/[$,\s]/g, ""));
  return Number.isFinite(parsed) ? parsed : undefined;
}

const LANGUAGE_MARKERS: Record<string, string> = {
  EN: "en", ENGLISH: "en",
  JP: "ja", JA: "ja", JPN: "ja", JAPANESE: "ja",
  CN: "zh-cn", SC: "zh-cn", SIMPLIFIEDCHINESE: "zh-cn",
  TW: "zh-tw", CH: "zh-tw", TC: "zh-tw", TRADITIONALCHINESE: "zh-tw",
  KR: "ko", KO: "ko", KOR: "ko", KOREAN: "ko",
  FR: "fr", FRENCH: "fr", DE: "de", GERMAN: "de",
  IT: "it", ITALIAN: "it", ES: "es", SPANISH: "es",
  PT: "pt", PORTUGUESE: "pt",
  CHINESE: "zh-unknown",
};

function extractLanguage(name: string): { name: string; language: string; languages: string[]; conflict: boolean } {
  const markers = [...name.matchAll(/\((ENGLISH|JAPANESE|JPN|JP|JA|SIMPLIFIED\s+CHINESE|SC|CN|TRADITIONAL\s+CHINESE|TC|TW|CH|KOREAN|KOR|KR|KO|FRENCH|FR|GERMAN|DE|ITALIAN|IT|SPANISH|ES|PORTUGUESE|PT|CHINESE|EN)\)/gi)];
  const suffix = markers.length === 0
    ? name.match(/(?:^|\s)(SIMPLIFIED\s+CHINESE|TRADITIONAL\s+CHINESE|CHINESE|JPN|JP|JA|SC|CN|TC|TW|CH|ENGLISH|EN|FRENCH|FR|GERMAN|DE|ITALIAN|IT|SPANISH|ES|PORTUGUESE|PT|KOREAN|KOR|KR|KO)\s*$/i)
    : null;
  const codes = markers.map((match) => match[1].replace(/\s+/g, "").toUpperCase());
  if (suffix) codes.push(suffix[1].replace(/\s+/g, "").toUpperCase());
  const languages = [...new Set(codes.map((code) => LANGUAGE_MARKERS[code]).filter(Boolean))];
  const cleanName = name
    .replace(/\s*\((?:ENGLISH|JAPANESE|JPN|JP|JA|SIMPLIFIED\s+CHINESE|SC|CN|TRADITIONAL\s+CHINESE|TC|TW|CH|KOREAN|KOR|KR|KO|FRENCH|FR|GERMAN|DE|ITALIAN|IT|SPANISH|ES|PORTUGUESE|PT|CHINESE|EN)\)\s*/gi, " ")
    .replace(/(?:^|\s)(?:SIMPLIFIED\s+CHINESE|TRADITIONAL\s+CHINESE|CHINESE|JPN|JP|JA|SC|CN|TC|TW|CH|ENGLISH|EN|FRENCH|FR|GERMAN|DE|ITALIAN|IT|SPANISH|ES|PORTUGUESE|PT|KOREAN|KOR|KR|KO)\s*$/i, " ")
    .replace(/\s+/g, " ")
    .trim();
  return {
    name: cleanName,
    language: languages[0] ?? "en",
    languages,
    conflict: languages.length > 1,
  };
}

function isCardNumber(value: string): boolean {
  return /^(?:[A-Z]{1,6}\s*-?\s*)?\d{1,4}(?:\.\d+)?(?:\s*\/\s*[\p{L}\d.-]+)?$/iu.test(value);
}

function isChromeLine(value: string): boolean {
  const normalized = value.toLocaleLowerCase().replace(/\s+/g, " ").trim();
  return CHROME_LINES.has(normalized)
    || /^(?:search|export|bulk actions|filters?)\b\s*[:(]/i.test(value)
    || /^(?:showing|sort(?:ed)? by|viewing)\s+\d+/i.test(value)
    || /^(?:page|per page)\s+\d+/i.test(value)
    || /^(?:all|owned|missing|unowned)\s+\(\d+\)$/i.test(value);
}

function isCondition(value: string): boolean {
  return CONDITIONS.some((condition) => condition.toLocaleLowerCase() === value.toLocaleLowerCase());
}

function isRarity(value: string): boolean {
  return RARITIES.some((rarity) => rarity.toLocaleLowerCase() === value.toLocaleLowerCase());
}

function isFinish(value: string): boolean {
  return FINISHES.some((finish) => finish.toLocaleLowerCase() === value.toLocaleLowerCase());
}

function findRepeatedTitle(
  lines: SourceLine[],
  beforeIndex: number,
): { startIndex: number; endIndex: number } | null {
  for (let index = lines.length - 1; index > 0; index -= 1) {
    const previous = lines[index - 1];
    const current = lines[index];
    if (
      previous &&
      current.value.length > 1 &&
      current.index < beforeIndex &&
      previous.value.toLocaleLowerCase() === current.value.toLocaleLowerCase()
    ) {
      return { startIndex: previous.index, endIndex: current.index };
    }
  }
  return null;
}

function parseRecord(
  chunk: SourceLine[],
  originalText?: string,
): { record: CollectrRecord; includedLineCount: number } | null {
  const quantityLineIndex = chunk.findIndex((line) => /^qty\s*:/i.test(line.value));
  if (quantityLineIndex < 0) return null;
  const quantityMatch = chunk[quantityLineIndex].value.match(/^qty\s*:\s*(\d+)\b/i);
  const quantity = quantityMatch ? Number(quantityMatch[1]) : NaN;
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > 9999) return null;

  const quantityLine = chunk[quantityLineIndex];
  const beforeQuantity = chunk.slice(0, quantityLineIndex);
  const priceLines = beforeQuantity.filter((line) => /^\$[\d,]+(?:\.\d{1,2})?$/.test(line.value));
  const prices = priceLines
    .map((line) => line.value.match(/^\$([\d,]+(?:\.\d{1,2})?)$/)?.[1])
    .filter((price): price is string => Boolean(price));
  const percentage = beforeQuantity
    .map((line) => line.value.match(/^\(([+-]?[\d.]+)%\)$/)?.[1])
    .find(Boolean);
  const cardNumberLine = beforeQuantity.find((line) => isCardNumber(line.value));
  const conditionLine = beforeQuantity.find((line) => isCondition(line.value));
  const finishLine = beforeQuantity.find((line) => isFinish(line.value));
  const rarityLine = beforeQuantity.find((line) => isRarity(line.value));
  const metadataAnchor = Math.min(
    ...[cardNumberLine, conditionLine, finishLine, rarityLine, ...priceLines]
      .map((item) => item?.index ?? -1)
      .filter((index) => index >= 0),
    quantityLine.index,
  );
  const meaningful = beforeQuantity.filter((line) =>
    !isChromeLine(line.value)
    && line.value !== "•"
    && !line.value.startsWith("$")
    && !/^\([+-]?[\d.]+%\)$/.test(line.value)
    && !isCardNumber(line.value)
    && !isCondition(line.value)
    && !isFinish(line.value)
    && !isRarity(line.value),
  );

  const repeatedTitle = findRepeatedTitle(meaningful, metadataAnchor);
  const titleLine = repeatedTitle === null
    ? meaningful[0]
    : meaningful.find((line) => line.index === repeatedTitle.startIndex);
  if (!titleLine) return null;

  const titlePairEnd = repeatedTitle === null
    ? titleLine.index + 1
    : repeatedTitle.endIndex + 1;
  const setLine = meaningful.find((line) =>
    line.index >= titlePairEnd
    && line.index < metadataAnchor
    && line.index !== titleLine.index,
  );
  const identityEvidence = Boolean(
    repeatedTitle !== null
    || (cardNumberLine && (setLine || conditionLine || finishLine || rarityLine))
    || (rarityLine && setLine)
    || (conditionLine && finishLine),
  );
  if (!identityEvidence) return null;

  const extractedTitleLanguage = extractLanguage(titleLine.value);
  const languagesInRecord = [...new Set(beforeQuantity.flatMap((line) => extractLanguage(line.value).languages))];
  const languageResult = {
    ...extractedTitleLanguage,
    language: languagesInRecord[0] ?? "en",
    languages: languagesInRecord,
    conflict: languagesInRecord.length > 1,
  };
  const cardNumber = cardNumberLine?.value.replace(/\s/g, "") ?? "";
  const setName = setLine?.value ?? "";
  const reviewReasons: CollectrReviewReason[] = [];
  if (!languageResult.name) reviewReasons.push("missing-card-name");
  if (!setName) reviewReasons.push("missing-set");
  if (!cardNumber) reviewReasons.push("missing-card-number");
  if (languageResult.conflict) reviewReasons.push("conflicting-language-markers");
  if (!conditionLine) reviewReasons.push("missing-condition");
  if (!finishLine) reviewReasons.push("missing-finish");

  const recordLines = chunk.filter((line) => line.index >= titleLine.index);
  return {
    record: {
      originalText: originalText ?? recordLines.map((line) => line.raw).join("\n").trim(),
      productName: titleLine.value,
      cardName: languageResult.name,
      setName,
      rarity: rarityLine?.value ?? "",
      cardNumber,
      language: languageResult.language,
      condition: conditionLine?.value ?? "Unknown",
      finish: finishLine?.value ?? "Unknown",
      quantity,
      ...(languageResult.conflict ? { languageCandidates: languageResult.languages } : {}),
      marketPrice: parseMoney(prices[0]),
      priceChange: parseMoney(prices[1]),
      priceChangePercent: percentage ? Number(percentage) : undefined,
      parseStatus: reviewReasons.length === 0 ? "ready" : "needs-review",
      reviewReasons,
    },
    includedLineCount: recordLines.filter((line) => line.value.length > 0).length,
  };
}

function findRepeatedTitleInText(value: string): { title: string; start: number; end: number } | null {
  const tokens = [...value.matchAll(/\S+/g)].map((match) => ({
    value: match[0],
    start: match.index,
    end: match.index + match[0].length,
  }));
  let best: { title: string; start: number; end: number; length: number } | null = null;
  for (let start = 0; start < tokens.length - 1; start += 1) {
    const maxLength = Math.min(20, Math.floor((tokens.length - start) / 2));
    for (let length = maxLength; length > (best?.length ?? 0); length -= 1) {
      const repeats = tokens
        .slice(start, start + length)
        .every((token, offset) =>
          token.value.toLocaleLowerCase() === tokens[start + length + offset]?.value.toLocaleLowerCase(),
        );
      if (repeats) {
        best = {
          title: tokens.slice(start, start + length).map((token) => token.value).join(" "),
          start: tokens[start].start,
          end: tokens[start + (length * 2) - 1].end,
          length,
        };
        break;
      }
    }
  }
  return best;
}

function parseFlattenedRecord(
  chunkText: string,
): { record: CollectrRecord; titleStart: number } | null {
  const quantityMatch = /\bqty\s*:\s*\d+\b/i.exec(chunkText);
  if (!quantityMatch) return null;
  const beforeQuantity = chunkText.slice(0, quantityMatch.index);
  const conditionMatch = CONDITIONS
    .map((condition) => ({ condition, index: beforeQuantity.toLocaleLowerCase().indexOf(condition.toLocaleLowerCase()) }))
    .filter((match) => match.index >= 0)
    .sort((left, right) => left.index - right.index)[0];
  const beforeCondition = conditionMatch
    ? beforeQuantity.slice(0, conditionMatch.index)
    : beforeQuantity;
  const beforeConditionTokens = [...beforeCondition.matchAll(/\S+/g)];
  const cardNumberToken = [...beforeConditionTokens].reverse().find((match, index, matches) => {
    const value = match[0].replace(/[•,]/g, "");
    const previous = matches[index + 1]?.[0];
    return isCardNumber(value) && (value.includes("/") || previous === "•");
  });
  const cardNumber = cardNumberToken?.[0].replace(/[•,]/g, "").replace(/\s/g, "");
  const repeatedTitle = findRepeatedTitleInText(beforeCondition);
  if (!repeatedTitle) return null;

  const metadataStart = cardNumberToken?.index ?? beforeCondition.length;
  if (repeatedTitle.end > metadataStart) return null;
  const identityText = beforeCondition
    .slice(repeatedTitle.end, metadataStart)
    .replace(/[•]/g, " ")
    .trim();
  const rarity = RARITIES.find((candidate) =>
    identityText.toLocaleLowerCase().endsWith(candidate.toLocaleLowerCase()),
  ) ?? "";
  const setName = rarity
    ? identityText.slice(0, identityText.length - rarity.length).trim()
    : identityText;
  const finish = FINISHES.find((candidate) =>
    chunkText.slice(conditionMatch ? conditionMatch.index + conditionMatch.condition.length : 0, quantityMatch.index)
      .toLocaleLowerCase()
      .includes(candidate.toLocaleLowerCase()),
  ) ?? "";
  if (!cardNumber && !(setName && rarity) && !(conditionMatch && finish)) return null;

  const priceMatches = [...beforeQuantity.matchAll(/-?\$[\d,]+(?:\.\d{1,2})?/g)].map((match) => match[0]);
  const percentage = beforeQuantity.match(/\(([+-]?[\d.]+)%\)/)?.[1];
  const quantityLine = quantityMatch[0];
  const fields = [
    repeatedTitle.title,
    repeatedTitle.title,
    setName,
    rarity,
    cardNumber ?? "",
    conditionMatch?.condition ?? "",
    finish,
    ...priceMatches,
    ...(percentage ? [`(${percentage}%)`] : []),
    quantityLine,
  ].filter(Boolean);
  const sourceLines = fields.map((value, index) => ({ raw: value, value, index }));
  const originalText = chunkText.slice(repeatedTitle.start).trim();
  const parsed = parseRecord(sourceLines, originalText);
  return parsed ? { record: parsed.record, titleStart: repeatedTitle.start } : null;
}

function parseFlattenedCollectrText(text: string): CollectrParseResult | null {
  const quantityMarkers = [...text.matchAll(/\bqty\s*:\s*\d+\b/gi)];
  if (quantityMarkers.length === 0) return null;

  const records: CollectrRecord[] = [];
  let ignoredLines = 0;
  let chunkStart = 0;
  for (const marker of quantityMarkers) {
    const end = marker.index + marker[0].length;
    const chunk = text.slice(chunkStart, end);
    const parsed = parseFlattenedRecord(chunk);
    if (parsed) {
      records.push(parsed.record);
      if (chunk.slice(0, parsed.titleStart).trim()) ignoredLines += 1;
    } else {
      ignoredLines += 1;
    }
    chunkStart = end;
  }
  if (text.slice(chunkStart).trim()) ignoredLines += 1;

  return {
    records,
    inputLines: quantityMarkers.length + ignoredLines,
    ignoredLines,
  };
}

export function parseCollectrText(text: string): CollectrParseResult {
  if (!/[\r\n]/.test(text)) {
    const flattened = parseFlattenedCollectrText(text);
    if (flattened) return flattened;
  }

  const lines: SourceLine[] = text
    .split(/\r\n?|\n/)
    .map((raw, index) => ({ raw, value: raw.trim(), index }))
    .filter((line) => line.value.length > 0);
  const records: CollectrRecord[] = [];
  let chunkStart = 0;
  let includedLineCount = 0;

  for (let index = 0; index < lines.length; index += 1) {
    if (!/^qty\s*:/i.test(lines[index].value)) continue;
    const parsed = parseRecord(lines.slice(chunkStart, index + 1));
    if (parsed) {
      records.push(parsed.record);
      includedLineCount += parsed.includedLineCount;
    }
    chunkStart = index + 1;
  }

  return {
    records,
    inputLines: lines.length,
    ignoredLines: Math.max(0, lines.length - includedLineCount),
  };
}
