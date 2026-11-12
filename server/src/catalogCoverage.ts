export interface TcgSetCardSummary {
  id: string;
  localId?: string;
}

export interface SetCoverageInput {
  detailAvailable: boolean;
  expectedTotal?: number | null;
  sourceCards: TcgSetCardSummary[];
  localCardIds: string[];
  localCardNumbers: string[];
}

export interface SetCoverageResult {
  status: "FULL" | "PARTIAL" | "MISSING_DATA";
  sourceCardIds: string[];
  sourceCardNumbers: string[];
  missingSourceCardIds: string[];
  extraLocalCardIds: string[];
  missingCardNumbers: string[];
  duplicateSourceCardIds: number;
  expectedTotal: number | null;
  sourceCardCount: number;
  localCardCount: number;
  issue: string;
}

export function evaluateSetCoverage(input: SetCoverageInput): SetCoverageResult {
  const sourceCardIds: string[] = [];
  const sourceCardNumbers: string[] = [];
  const seenSourceCardIds = new Set<string>();
  let duplicateSourceCardIds = 0;

  for (const card of input.sourceCards) {
    const id = card.id.trim();
    if (!id) continue;
    if (seenSourceCardIds.has(id)) {
      duplicateSourceCardIds += 1;
      continue;
    }
    seenSourceCardIds.add(id);
    sourceCardIds.push(id);
    sourceCardNumbers.push(card.localId?.trim() ?? "");
  }

  const localCardIds = new Set(input.localCardIds.map((id) => id.trim()).filter(Boolean));
  const localCardNumbers = new Set(input.localCardNumbers.map((id) => id.trim()).filter(Boolean));
  const missingSourceCardIds = sourceCardIds.filter((id) => !localCardIds.has(id));
  const extraLocalCardIds = [...localCardIds].filter((id) => !seenSourceCardIds.has(id));
  const missingCardNumbers = [...new Set(sourceCardNumbers.filter(Boolean))].filter((id) => !localCardNumbers.has(id));
  const expectedTotal = Number.isInteger(input.expectedTotal) && Number(input.expectedTotal) >= 0
    ? Number(input.expectedTotal)
    : null;
  const sourceCardCount = sourceCardIds.length;
  const localCardCount = localCardIds.size;

  let status: SetCoverageResult["status"];
  let issue = "";
  if (!input.detailAvailable || expectedTotal === null) {
    status = "MISSING_DATA";
    issue = !input.detailAvailable
      ? "TCGdex set detail was unavailable during the last check."
      : "TCGdex did not provide cardCount.total for this set.";
  } else if (expectedTotal > 0 && sourceCardCount === 0) {
    status = "MISSING_DATA";
    issue = "TCGdex reports cards for this set but returned an empty card list.";
  } else if (
    sourceCardCount !== expectedTotal
    || missingSourceCardIds.length > 0
    || extraLocalCardIds.length > 0
    || duplicateSourceCardIds > 0
  ) {
    status = "PARTIAL";
    const issues: string[] = [];
    if (sourceCardCount !== expectedTotal) issues.push(`TCGdex listed ${sourceCardCount}/${expectedTotal} card IDs`);
    if (missingSourceCardIds.length > 0) issues.push(`${missingSourceCardIds.length} listed cards are missing locally`);
    if (extraLocalCardIds.length > 0) issues.push(`${extraLocalCardIds.length} local cards are absent from the latest TCGdex list`);
    if (duplicateSourceCardIds > 0) issues.push(`${duplicateSourceCardIds} duplicate card IDs were returned`);
    if (missingCardNumbers.length > 0) issues.push(`${missingCardNumbers.length} listed card numbers are missing locally`);
    issue = issues.join("; ");
  } else {
    status = "FULL";
  }

  return {
    status,
    sourceCardIds,
    sourceCardNumbers,
    missingSourceCardIds,
    extraLocalCardIds,
    missingCardNumbers,
    duplicateSourceCardIds,
    expectedTotal,
    sourceCardCount,
    localCardCount,
    issue,
  };
}
