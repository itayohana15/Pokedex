export interface ReviewImageIdentity {
  sourceId: string;
  name: string;
  language: string;
  setId: string;
  localId: string;
  artist?: string;
}

export interface ReviewImageCandidate {
  id: string;
  source: string;
  sourceType: "official" | "community";
  sourceId: string;
  imageUrl: string;
  sourceUrl: string;
  checkedAt: string;
  confidence: number;
  confidenceReason: string;
  matchedFields: string[];
  identity: ReviewImageIdentity;
}

const VERIFIED_REVIEW_IMAGES: Record<string, ReviewImageCandidate[]> = {
  "SV-P-200": [{
    id: "pokemon-jp-sv-p-200-n-zorua",
    source: "Pokémon Japan official card database",
    sourceType: "official",
    sourceId: "SV-P-200",
    imageUrl: "https://www.pokemon-card.com/assets/images/card_images/large/SV-P/047165_P_NNOZOROA.jpg",
    sourceUrl: "https://www.pokemon-card.com/card-search/details.php/card/47165",
    checkedAt: "2026-11-12",
    confidence: 100,
    confidenceReason: "Official card detail matches name, language, SV-P set, printed card number, and illustrator.",
    matchedFields: ["name", "language", "setId", "localId", "artist"],
    identity: { sourceId: "SV-P-200", name: "Nのゾロア", language: "ja", setId: "SV-P", localId: "200", artist: "Jiro Sasumo" },
  }],
  "mep-003": [{
    id: "tcgpromos-mep-003-alakazam",
    source: "TCG Promos (community-provided scan)",
    sourceType: "community",
    sourceId: "mep-003",
    imageUrl: "https://tcgpromos.com/media/20261016-gen34/alakazam-mep-003-owner.webp",
    sourceUrl: "https://tcgpromos.com/cards/pokemon-mep-003",
    checkedAt: "2026-11-12",
    confidence: 95,
    confidenceReason: "Card page identifies the English Alakazam printing as MEP 003; TCGdex identity supplies the matching set and language.",
    matchedFields: ["name", "language", "setId", "localId"],
    identity: { sourceId: "mep-003", name: "Alakazam", language: "en", setId: "mep", localId: "003", artist: "cochi8i" },
  }],
  "mep-009": [{
    id: "tcgpromos-mep-009-alakazam",
    source: "TCG Promos (community-provided scan)",
    sourceType: "community",
    sourceId: "mep-009",
    imageUrl: "https://tcgpromos.com/media/20261016-gen34/alakazam-mep-009-holo-owner.webp",
    sourceUrl: "https://tcgpromos.com/cards/pokemon-mep-009",
    checkedAt: "2026-11-12",
    confidence: 95,
    confidenceReason: "Card page identifies the English Alakazam printing as MEP 009; TCGdex identity supplies the matching set and language.",
    matchedFields: ["name", "language", "setId", "localId"],
    identity: { sourceId: "mep-009", name: "Alakazam", language: "en", setId: "mep", localId: "009", artist: "Aya Kusube" },
  }],
  "mep-094": [{
    id: "tcgpromos-mep-094-alolan-exeggutor",
    source: "TCG Promos (community-provided scan)",
    sourceType: "community",
    sourceId: "mep-094",
    imageUrl: "https://tcgpromos.com/media/20261016-gen34/mep-094-owner.webp",
    sourceUrl: "https://tcgpromos.com/cards/pokemon-mep-094",
    checkedAt: "2026-11-12",
    confidence: 95,
    confidenceReason: "Card page identifies the English Alolan Exeggutor printing as MEP 094; TCGdex identity supplies the matching set and language.",
    matchedFields: ["name", "language", "setId", "localId"],
    identity: { sourceId: "mep-094", name: "Alolan Exeggutor", language: "en", setId: "mep", localId: "094", artist: "yuu" },
  }],
};

function normalized(value: unknown): string {
  return typeof value === "string" ? value.trim().normalize("NFKC").toLocaleLowerCase() : "";
}

export function matchingReviewImageCandidates(candidates: ReviewImageCandidate[], card: ReviewImageIdentity): ReviewImageCandidate[] {
  return candidates.filter((candidate) => {
    const identity = candidate.identity;
    return normalized(card.name) === normalized(identity.name)
      && card.language === identity.language
      && card.setId === identity.setId
      && card.localId === identity.localId
      && (!identity.artist || normalized(card.artist) === normalized(identity.artist));
  });
}

export function verifiedReviewImageCandidates(card: ReviewImageIdentity): ReviewImageCandidate[] {
  return matchingReviewImageCandidates(VERIFIED_REVIEW_IMAGES[card.sourceId] ?? [], card);
}

export function verifiedReviewImageCandidate(card: ReviewImageIdentity, candidateId: string): ReviewImageCandidate | undefined {
  return verifiedReviewImageCandidates(card).find((candidate) => candidate.id === candidateId);
}
