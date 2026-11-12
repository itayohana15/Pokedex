import { createHash } from "node:crypto";
import type { CollectrRecord } from "./collectr.js";

export interface MatchableCard {
  _id: unknown;
  name: string;
  setName: string;
  localId: string;
  rarity: string;
  language: string;
  setId: string;
  classification: string;
  image: string;
}

export function normalizeIdentity(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLocaleLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "");
}

export function normalizeCardName(value: string): string {
  return normalizeIdentity(
    value.replace(/\((?:alternate\s+full\s+art|alternate\s+art|alt\s+art|full\s+art|secret)\)/gi, " "),
  );
}

export function matchingLanguages(language: string): string[] | null {
  if (language === "unknown") return ["en"];
  if (language === "conflict") return [];
  if (language === "zh-unknown") return ["zh-cn", "zh-tw"];
  return [language];
}

export function recordLanguageMatches(recordLanguage: string, cardLanguage: string): boolean {
  const languages = matchingLanguages(recordLanguage);
  return languages === null || languages.includes(cardLanguage);
}

export function recordLanguageOptions(record: Pick<CollectrRecord, "language" | "languageCandidates">): string[] {
  if (record.languageCandidates?.length) return [...new Set(record.languageCandidates)];
  return matchingLanguages(record.language) ?? ["en"];
}

export function matchesRecordLanguage(
  record: Pick<CollectrRecord, "language" | "languageCandidates">,
  cardLanguage: string,
): boolean {
  return recordLanguageOptions(record).includes(cardLanguage);
}

export function collectrRecordIdentity(record: CollectrRecord): Record<string, string> {
  const identity = {
    cardName: normalizeCardName(record.cardName),
    setName: normalizeIdentity(record.setName),
    cardNumber: normalizeCardNumber(record.cardNumber),
    rarity: normalizeRarity(record.rarity),
    language: record.language,
  };
  return record.languageCandidates?.length
    ? { ...identity, languageCandidates: record.languageCandidates.slice().sort().join(",") }
    : identity;
}

export function collectrRecordKey(record: CollectrRecord): string {
  return createHash("sha256").update(JSON.stringify(collectrRecordIdentity(record))).digest("hex");
}

export function collectrRecordKeyVariants(record: CollectrRecord): string[] {
  const keys = [collectrRecordKey(record)];
  if (record.language === "en" && !record.languageCandidates?.length) {
    keys.push(collectrRecordKey({ ...record, language: "unknown" }));
  }
  return [...new Set(keys)];
}

export function normalizeCardNumber(value: string): string {
  return value
    .split("/")[0]
    .normalize("NFKC")
    .replace(/\s+/g, "")
    .toLocaleUpperCase()
    .replace(/\d+/g, (digits) => digits.replace(/^0+(?=\d)/, ""));
}

export function normalizeRarity(value: string): string {
  const normalized = normalizeIdentity(value);
  const aliases: Record<string, string> = {
    ir: "illustrationrare",
    ar: "artrare",
    sir: "specialillustrationrare",
    sar: "specialillustrationrare",
    specialartrare: "specialillustrationrare",
    altart: "alternateart",
    alternatefullart: "fullart",
    blackandwhiterare: "blackwhiterare",
    bwr: "blackwhiterare",
  };
  return aliases[normalized] ?? normalized;
}

export function cardNumberVariants(value: string): string[] {
  const raw = value.split("/")[0]?.normalize("NFKC").replace(/\s+/g, "") ?? "";
  const normalized = normalizeCardNumber(raw);
  return [...new Set([raw, normalized].filter(Boolean))];
}

export function matchesCardIdentity(record: CollectrRecord, card: MatchableCard): boolean {
  return Boolean(
    record.cardName.trim()
    && record.setName.trim()
    && record.cardNumber.trim()
    && normalizeCardName(record.cardName) === normalizeCardName(card.name)
    && normalizeIdentity(record.setName) === normalizeIdentity(card.setName)
    && (!record.rarity.trim() || normalizeRarity(record.rarity) === normalizeRarity(card.rarity))
    && normalizeCardNumber(record.cardNumber) === normalizeCardNumber(card.localId),
  );
}
