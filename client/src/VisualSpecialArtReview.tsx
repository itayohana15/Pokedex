import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, imageUrl, type ClassificationReviewAction, type ClassificationReviewItem, type ReviewImageCandidate, type VisualReviewPage, type VisualReviewSummary } from "./api";
import { REVIEW_CLASSIFICATIONS, visualReviewNeighbor, visualReviewShortcut } from "./visualReview";

const LANGUAGES = ["en", "ja", "zh-cn", "zh-tw"] as const;
type Filters = { language: string; setId: string; setLanguage: string; pokemon: string; rarity: string; image: string; reviewStatus: string; decision: string; sort: string };
const DEFAULT_FILTERS: Filters = { language: "", setId: "", setLanguage: "", pokemon: "", rarity: "", image: "", reviewStatus: "all", decision: "all", sort: "set" };
const STORAGE_KEY = "pokedex-visual-review-progress";

function readSavedProgress(): { page?: number; cardId?: string; filters?: Partial<Filters>; resumePage?: number; resumeFilters?: Partial<Filters> } {
  try { return JSON.parse(window.localStorage.getItem(STORAGE_KEY) || "{}"); } catch { return {}; }
}

function candidateFor(card: ClassificationReviewItem): ReviewImageCandidate | undefined {
  return card.imageCandidates?.[0];
}

function cardArtwork(card: ClassificationReviewItem, selectedCandidateId = ""): { url: string; source: string } | null {
  const selectedCandidate = card.imageCandidates?.find((candidate) => candidate.id === selectedCandidateId);
  if (selectedCandidate) return { url: selectedCandidate.imageUrl, source: selectedCandidate.source };
  const tcgDexImage = imageUrl(card.image);
  if (tcgDexImage) return { url: tcgDexImage, source: "TCGdex" };
  const candidate = candidateFor(card);
  return candidate ? { url: candidate.imageUrl, source: candidate.source } : null;
}

function officialLookupUrl(language: string): string {
  if (language === "ja") return "https://www.pokemon-card.com/card-search/";
  if (language === "zh-tw") return "https://asia.pokemon-card.com/tw/card-search/";
  if (language === "en") return "https://www.pokemon.com/us/pokemon-tcg/pokemon-cards/";
  return "https://nstrelow.github.io/ptcg-image-atlas/";
}

export function VisualSpecialArtReview() {
  const queryClient = useQueryClient();
  const saved = useMemo(readSavedProgress, []);
  const [filters, setFilters] = useState<Filters>({ ...DEFAULT_FILTERS, ...saved.filters });
  const [page, setPage] = useState(Math.max(1, saved.page ?? 1));
  const [pageSize, setPageSize] = useState(36);
  const [imageSize, setImageSize] = useState<"small" | "medium" | "large">("medium");
  const [selectedId, setSelectedId] = useState("");
  const [zoom, setZoom] = useState(false);
  const [classification, setClassification] = useState("");
  const [note, setNote] = useState("");
  const [imageCandidateId, setImageCandidateId] = useState("");
  const [compareItems, setCompareItems] = useState<ClassificationReviewItem[]>([]);
  const [compareOpen, setCompareOpen] = useState(false);
  const [resumeId, setResumeId] = useState("");
  const [lastCardId, setLastCardId] = useState(saved.cardId ?? "");
  const [lastCardPage, setLastCardPage] = useState(Math.max(1, saved.resumePage ?? saved.page ?? 1));
  const [lastCardFilters, setLastCardFilters] = useState<Filters>({ ...DEFAULT_FILTERS, ...(saved.resumeFilters ?? saved.filters) });
  const [pendingDirection, setPendingDirection] = useState<"next" | "previous" | "resume" | "set" | "" >("");
  const [imageFailed, setImageFailed] = useState(false);
  const detailRef = useRef<HTMLDivElement>(null);

  const summaryQuery = useQuery({ queryKey: ["visual-review-summary"], queryFn: () => api<VisualReviewSummary>("/classification/review/visual/summary") });
  const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize), sort: filters.sort, reviewStatus: filters.reviewStatus, decision: filters.decision });
  for (const key of ["language", "setId", "setLanguage", "pokemon", "rarity", "image"] as const) if (filters[key]) params.set(key, filters[key]);
  const pageQuery = useQuery({ queryKey: ["visual-review-page", params.toString()], queryFn: () => api<VisualReviewPage>(`/classification/review/visual?${params.toString()}`) });
  const summary = summaryQuery.data;
  const result = pageQuery.data;
  const selectedIndex = result?.items.findIndex((item) => item._id === selectedId) ?? -1;
  const selected = selectedIndex >= 0 ? result?.items[selectedIndex] : undefined;
  const compareCards = compareItems;

  const actionMutation = useMutation({
    mutationFn: ({ cardId, action, category, imageCandidateId: selectedCandidateId, note: actionNote }: { cardId: string; action: ClassificationReviewAction["action"]; category?: string; imageCandidateId?: string; note?: string }) => api(`/classification/review/${cardId}/action`, {
      method: "POST",
      body: JSON.stringify({ action, reviewScope: "promo-visual-gallery", ...(category ? { classification: category } : {}), ...(selectedCandidateId ? { imageCandidateId: selectedCandidateId } : {}), ...(actionNote ? { note: actionNote } : {}) }),
    }),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["visual-review-page"] }),
        queryClient.invalidateQueries({ queryKey: ["visual-review-summary"] }),
        queryClient.invalidateQueries({ queryKey: ["classification-review"] }),
        queryClient.invalidateQueries({ queryKey: ["classification-review-summary"] }),
        queryClient.invalidateQueries({ queryKey: ["settings"] }),
      ]);
    },
  });

  useEffect(() => {
    if (selectedId) {
      setLastCardId(selectedId);
      setLastCardPage(page);
      setLastCardFilters(filters);
    }
  }, [selectedId, page, filters]);

  useEffect(() => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({
      page, filters, cardId: selectedId || lastCardId,
      resumePage: selectedId ? page : lastCardPage,
      resumeFilters: selectedId ? filters : lastCardFilters,
    }));
  }, [page, selectedId, filters, lastCardId, lastCardPage, lastCardFilters]);

  useEffect(() => {
    if (!result || !pendingDirection || pageQuery.isFetching || result.pagination.page !== page || result.sort !== filters.sort) return;
    if (pendingDirection === "resume") {
      const found = result.items.find((item) => item._id === resumeId);
      if (found) setSelectedId(found._id);
    } else if (pendingDirection === "next" || pendingDirection === "set") {
      if (result.items[0]) setSelectedId(result.items[0]._id);
    } else if (pendingDirection === "previous") {
      const last = result.items[result.items.length - 1];
      if (last) setSelectedId(last._id);
    }
    setPendingDirection("");
  }, [result, pendingDirection, resumeId, page, filters.sort, pageQuery.isFetching]);

  useEffect(() => {
    setClassification("");
    setNote("");
    setImageCandidateId(selected && !imageUrl(selected.image) ? candidateFor(selected)?.id ?? "" : "");
    setZoom(false);
    setImageFailed(false);
  }, [selectedId]);

  useEffect(() => {
    if (!selected) return;
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target;
      if (target instanceof HTMLElement && (target.isContentEditable || ["INPUT", "SELECT", "TEXTAREA"].includes(target.tagName))) return;
      const shortcut = visualReviewShortcut(event.key);
      if (!shortcut) return;
      if (["next", "previous", "zoom"].includes(shortcut)) event.preventDefault();
      if (shortcut === "next") moveSelection(1);
      if (shortcut === "previous") moveSelection(-1);
      if (shortcut === "zoom") setZoom((value) => !value);
      if (shortcut === "confirm" && classification) performAction("CONFIRM_SPECIAL_ART");
      if (shortcut === "reject") performAction("MARK_NOT_SPECIAL_ART");
      if (shortcut === "undecided") performAction("KEEP_NEEDS_REVIEW");
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  });

  function updateFilter(key: keyof Filters, value: string) {
    setFilters((current) => ({ ...current, [key]: value, ...(key === "language" && current.setLanguage !== value ? { setId: "", setLanguage: "" } : {}) }));
    setPage(1);
    setSelectedId("");
  }

  function moveSelection(direction: -1 | 1) {
    if (!result || selectedIndex < 0) return;
    const nextIndex = visualReviewNeighbor(selectedIndex, result.items.length, direction);
    if (nextIndex !== null && nextIndex !== selectedIndex) {
      setSelectedId(result.items[nextIndex]._id);
      return;
    }
    if (direction > 0 && page < result.pagination.pageCount) {
      setPendingDirection("next");
      setPage((current) => current + 1);
    } else if (direction < 0 && page > 1) {
      setPendingDirection("previous");
      setPage((current) => current - 1);
    }
  }

  function performAction(action: ClassificationReviewAction["action"]) {
    if (!selected || actionMutation.isPending) return;
    if (action === "CONFIRM_SPECIAL_ART" && !classification) {
      detailRef.current?.querySelector<HTMLSelectElement>("[data-artwork-category]")?.focus();
      return;
    }
    actionMutation.mutate({ cardId: selected._id, action, ...(classification ? { category: classification } : {}), ...(imageCandidateId ? { imageCandidateId } : {}), ...(note.trim() ? { note: note.trim() } : {}) });
  }

  function resumeLast() {
    const progress = readSavedProgress();
    if (!progress.cardId) return;
    setResumeId(progress.cardId);
    setPendingDirection("resume");
    setFilters({ ...DEFAULT_FILTERS, ...(progress.resumeFilters ?? progress.filters) });
    setPage(Math.max(1, progress.resumePage ?? progress.page ?? 1));
  }

  function toggleCompare(card: ClassificationReviewItem) {
    setCompareItems((current) => current.some((item) => item._id === card._id)
      ? current.filter((item) => item._id !== card._id)
      : current.length < 2 ? [...current, card] : current);
  }

  function reviewThisSet(card: ClassificationReviewItem) {
    setFilters({ ...DEFAULT_FILTERS, setId: card.setId, setLanguage: card.language, language: card.language, sort: "number" });
    setPage(1);
    setPendingDirection("set");
  }

  return <section className="visual-review">
    <div className="visual-review-heading">
      <div><h2>Visual Gallery <span className="count-dot">{summary?.total.toLocaleString() ?? "…"}</span></h2><p>Review the real printing artwork. No decision is selected for you; every choice is saved as an explicit manual action.</p></div>
      <div className="visual-progress"><strong>{summary?.reviewed.toLocaleString() ?? "—"} / {summary?.total.toLocaleString() ?? "—"}</strong><span>reviewed</span><div className="visual-progress-track"><i style={{ width: `${summary?.total ? Math.min(100, (summary.reviewed / summary.total) * 100) : 0}%` }} /></div></div>
    </div>
    <div className="visual-review-metrics">
      <span><b>{summary?.confirmed.toLocaleString() ?? "—"}</b> Confirmed Special Art</span><span><b>{summary?.rejected.toLocaleString() ?? "—"}</b> Not Special Art</span><span><b>{summary?.undecided.toLocaleString() ?? "—"}</b> Undecided</span><span><b>{summary?.unreviewed.toLocaleString() ?? "—"}</b> Not reviewed</span><span><b>{summary?.withImage.toLocaleString() ?? "—"}</b> TCGdex image</span><span><b>{summary?.missingImage.toLocaleString() ?? "—"}</b> Missing TCGdex image</span>
      <button className="secondary-button" onClick={resumeLast} disabled={!lastCardId}>Resume last card</button>
    </div>
    <div className="visual-review-filters">
      <label><span>Language</span><select value={filters.language} onChange={(event) => updateFilter("language", event.target.value)}><option value="">All supported languages</option>{LANGUAGES.map((language) => <option key={language} value={language}>{language.toUpperCase()} · {summary?.byLanguage[language] ?? 0}</option>)}</select></label>
      <label><span>Set</span><select value={filters.setId ? `${filters.setLanguage}::${filters.setId}` : ""} onChange={(event) => { const [setLanguage, ...setId] = event.target.value.split("::"); setFilters((current) => ({ ...current, setId: setId.join("::"), setLanguage: setId.length ? setLanguage : "" })); setPage(1); setSelectedId(""); }}><option value="">All Sets</option>{summary?.options.sets.filter((set) => !filters.language || set.language === filters.language).map((set) => <option key={`${set.language}:${set.setId}`} value={`${set.language}::${set.setId}`}>{set.setName} · {set.language.toUpperCase()} · {set.count}</option>)}</select></label>
      <label><span>Pokémon</span><select value={filters.pokemon} onChange={(event) => updateFilter("pokemon", event.target.value)}><option value="">All Pokémon</option>{summary?.options.pokemon.map((pokemon) => <option key={pokemon.nationalDex} value={pokemon.nationalDex}>#{pokemon.nationalDex} {pokemon.name}</option>)}</select></label>
      <label><span>Rarity</span><select value={filters.rarity} onChange={(event) => updateFilter("rarity", event.target.value)}><option value="">All rarity</option>{summary?.options.rarities.map((rarity) => <option key={rarity.value} value={rarity.value}>{rarity.value} · {rarity.count}</option>)}</select></label>
      <label><span>Image</span><select value={filters.image} onChange={(event) => updateFilter("image", event.target.value)}><option value="">Has or missing image</option><option value="yes">Has TCGdex image</option><option value="no">Missing TCGdex image</option></select></label>
      <label><span>Review status</span><select value={filters.reviewStatus} onChange={(event) => updateFilter("reviewStatus", event.target.value)}><option value="all">All cards</option><option value="unreviewed">Not reviewed</option><option value="reviewed">Reviewed before</option></select></label>
      <label><span>Decision</span><select value={filters.decision} onChange={(event) => updateFilter("decision", event.target.value)}><option value="all">All decisions</option><option value="undecided">Undecided</option><option value="confirmed">Confirmed</option><option value="rejected">Not Special Art</option></select></label>
      <label><span>Sort</span><select value={filters.sort} onChange={(event) => updateFilter("sort", event.target.value)}><option value="set">Set</option><option value="number">Card number</option><option value="pokemon">Pokémon</option><option value="language">Language</option><option value="name">Card name</option></select></label>
      <label><span>Image size</span><select value={imageSize} onChange={(event) => setImageSize(event.target.value as typeof imageSize)}><option value="small">Small</option><option value="medium">Medium</option><option value="large">Large</option></select></label>
    </div>
    {pageQuery.error && <div className="notice error">{pageQuery.error.message}</div>}
    {summaryQuery.error && <div className="notice error">{summaryQuery.error.message}</div>}
    {pageQuery.isLoading ? <div className="loading">Loading card page…</div> : !result?.items.length ? <div className="inline-empty">No cards match these filters.</div> : <>
      <div className="visual-gallery-toolbar"><span>Showing {((result.pagination.page - 1) * result.pagination.pageSize + 1).toLocaleString()}–{Math.min(result.pagination.page * result.pagination.pageSize, result.pagination.total).toLocaleString()} of {result.pagination.total.toLocaleString()}</span><label>Per page <select value={pageSize} onChange={(event) => { setPageSize(Number(event.target.value)); setPage(1); }}><option value={24}>24</option><option value={36}>36</option><option value={60}>60</option><option value={100}>100</option></select></label><button className="secondary-button" disabled={compareItems.length !== 2} onClick={() => setCompareOpen(true)}>Compare selected ({compareItems.length}/2)</button></div>
      <div className={`visual-gallery-grid size-${imageSize}`}>{result.items.map((card) => <VisualReviewTile key={card._id} card={card} selected={compareItems.some((item) => item._id === card._id)} onCompare={() => toggleCompare(card)} onOpen={() => { setSelectedId(card._id); setImageFailed(false); }} />)}</div>
      {result.pagination.pageCount > 1 && <nav className="review-pagination" aria-label="Visual Gallery pages"><button className="secondary-button" disabled={page <= 1} onClick={() => setPage((current) => Math.max(1, current - 1))}>Previous</button><span>Page {page} of {result.pagination.pageCount}</span><button className="secondary-button" disabled={page >= result.pagination.pageCount} onClick={() => setPage((current) => Math.min(result.pagination.pageCount, current + 1))}>Next</button></nav>}
    </>}
    <p className="visual-review-help">Shortcuts while a card is open: A confirm · D not special · S keep undecided · ← / → previous or next · Z zoom. Confirm requires choosing an existing artwork category.</p>
    {actionMutation.error && <div className="notice error">{actionMutation.error.message}</div>}

    {selected && <div className="visual-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setSelectedId(""); }}><section className="visual-detail-modal" role="dialog" aria-modal="true" aria-label={`${selected.name} review`} ref={detailRef}>
      <header><div><span className={`visual-decision-badge decision-${(selected.visualDecision ?? "UNDECIDED").toLocaleLowerCase()}`}>{selected.visualDecision === "CONFIRMED" ? "CONFIRMED SPECIAL ART" : selected.visualDecision === "REJECTED" ? "NOT SPECIAL ART" : selected.visuallyReviewed ? "REVIEWED · UNDECIDED" : "NOT REVIEWED"}</span><h2>{selected.name}</h2><p>{selected.setName} · #{selected.localId} · {selected.language.toUpperCase()} · {selected.rarity || "Rarity missing"}</p></div><button className="modal-close" onClick={() => setSelectedId("")} aria-label="Close">×</button></header>
      <div className="visual-detail-body"><div className="visual-detail-art-column"><div className="visual-detail-art"><DetailArtwork card={selected} candidateId={imageCandidateId} zoom={zoom} imageFailed={imageFailed} setImageFailed={setImageFailed} /></div><div className="visual-art-source">{imageFailed ? "Image could not be loaded" : cardArtwork(selected, imageCandidateId)?.source ?? "No verified image URL"}</div>
        <div className="visual-image-sources">{selected.image && <label><input type="radio" name="image-source" checked={!imageCandidateId} onChange={() => setImageCandidateId("")} /> TCGdex image</label>}{selected.imageCandidates?.map((candidate) => <label key={candidate.id}><input type="radio" name="image-source" checked={imageCandidateId === candidate.id} onChange={() => setImageCandidateId(candidate.id)} /> {candidate.sourceType === "official" ? "Official" : "Community"}: {candidate.source} ({candidate.confidence}% match)</label>)}
          {!selected.image && !selected.imageCandidates?.length && <div className="visual-placeholder"><b>No verified card image</b><span>Open the source details to check the exact printing. No other Pokémon's image is substituted.</span></div>}
        </div>
        <div className="visual-source-links"><a href={selected.sourceUrl ?? `https://api.tcgdex.net/v2/${encodeURIComponent(selected.language)}/cards/${encodeURIComponent(selected.sourceId)}`} target="_blank" rel="noreferrer">Open TCGdex record</a><a href={officialLookupUrl(selected.language)} target="_blank" rel="noreferrer">Open official card search</a><a href="https://nstrelow.github.io/ptcg-image-atlas/" target="_blank" rel="noreferrer">Open PTCG Image Atlas</a>{selected.imageCandidates?.map((candidate) => <a key={candidate.id} href={candidate.sourceUrl} target="_blank" rel="noreferrer">Open {candidate.source} source</a>)}</div>
      </div><div className="visual-detail-info"><div className="visual-detail-facts"><span><b>Set</b>{selected.setName} ({selected.setId})</span><span><b>Card number</b>{selected.localId}</span><span><b>Language</b>{selected.language}</span><span><b>Rarity</b>{selected.rarity || "Missing"}</span><span><b>Pokémon</b>{selected.pokemonInfo?.map((pokemon) => pokemon.name).join(", ") || selected.dexIds?.map((id) => `#${id}`).join(", ") || "Not linked"}</span><span><b>Artist</b>{selected.artist || "Not provided"}</span><span><b>Card category</b>{selected.category || "Missing"} / {selected.cardType}</span><span><b>Review reason</b>{selected.reasonGroups.map((reason) => reason.replace(/_/g, " ")).join(", ") || "Manual visual check"}</span><span><b>Classifier confidence</b>{selected.classificationConfidence}%</span><span><b>Current classification</b>{selected.classification}</span><span><b>Classifier note</b>{selected.classificationReason || "No automatic classification note."}</span></div>
        <details className="visual-evidence-details"><summary>Evidence and image source details</summary><div>{selected.evidence.map((field) => <p key={field.field}><b>{field.field}:</b> {typeof field.value === "string" ? field.value : JSON.stringify(field.value)} · {field.source} · checked {field.checkedAt ? new Date(field.checkedAt).toLocaleDateString() : "date unavailable"}</p>)}{selected.imageCandidates?.map((candidate) => <p key={candidate.id}><b>{candidate.source}:</b> {candidate.confidenceReason} Matched: {candidate.matchedFields.join(", ")}. Checked {candidate.checkedAt}. <a href={candidate.sourceUrl} target="_blank" rel="noreferrer">Source</a></p>)}</div></details>
        <details className="visual-evidence-details"><summary>Decision history · {selected.reviewHistory.length}</summary><div>{selected.reviewHistory.map((entry, index) => <p key={`${entry.createdAt}:${index}`}><b>{new Date(entry.createdAt).toLocaleString()}</b> · {entry.action} · {entry.actor ?? "local user"}{entry.classification ? ` · ${entry.classification}` : ""}{entry.note ? ` · ${entry.note}` : ""}</p>)}</div></details>
        <label className="visual-category-select"><span>Artwork category required for confirmation</span><select data-artwork-category value={classification} onChange={(event) => setClassification(event.target.value)}><option value="">Choose a category…</option>{REVIEW_CLASSIFICATIONS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
        <label className="visual-note-input"><span>Decision note (optional)</span><textarea value={note} onChange={(event) => setNote(event.target.value)} placeholder="What visual detail supports the decision?" rows={2} /></label>
        <div className="visual-action-buttons"><button className="primary-button" disabled={actionMutation.isPending || !classification} onClick={() => performAction("CONFIRM_SPECIAL_ART")}>CONFIRM SPECIAL ART</button><button className="review-decline-button" disabled={actionMutation.isPending} onClick={() => performAction("MARK_NOT_SPECIAL_ART")}>NOT SPECIAL ART</button><button className="secondary-button" disabled={actionMutation.isPending} onClick={() => performAction("KEEP_NEEDS_REVIEW")}>KEEP UNDECIDED</button></div>
      </div></div>
      <footer className="visual-modal-nav"><button className="secondary-button" onClick={() => moveSelection(-1)} disabled={page <= 1 && selectedIndex <= 0}>← Previous</button><span>{selectedIndex + 1} of {result?.pagination.total ?? 0} in this filter</span><button className="secondary-button" onClick={() => moveSelection(1)} disabled={!result || (page >= result.pagination.pageCount && selectedIndex >= result.items.length - 1)}>Next →</button><button className="secondary-button" onClick={() => setZoom((current) => !current)}>{zoom ? "Close zoom (Z)" : "Zoom (Z)"}</button><button className="secondary-button" onClick={() => reviewThisSet(selected)}>Review this Set</button></footer>
    </section></div>}

    {compareOpen && <div className="visual-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setCompareOpen(false); }}><section className="visual-compare-modal" role="dialog" aria-modal="true" aria-label="Compare cards"><header><h2>Compare two printings</h2><button className="modal-close" onClick={() => setCompareOpen(false)}>×</button></header><div className="visual-compare-grid">{compareCards.map((card) => <CompareCard key={card._id} card={card} onOpen={() => { setSelectedId(card._id); setCompareOpen(false); }} />)}</div></section></div>}
  </section>;
}

function VisualReviewTile({ card, selected, onCompare, onOpen }: { card: ClassificationReviewItem; selected: boolean; onCompare: () => void; onOpen: () => void }) {
  const [failed, setFailed] = useState(false);
  const artwork = cardArtwork(card);
  return <article className={`visual-card-tile ${selected ? "is-compared" : ""}`}>
    <label className="visual-compare-check"><input type="checkbox" checked={selected} onChange={onCompare} aria-label={`Select ${card.name} for comparison`} />Compare</label>
    <button className="visual-tile-open" onClick={onOpen} aria-label={`Open ${card.name}`}><div className="visual-tile-image">{artwork && !failed ? <img src={artwork.url} alt={`${card.name} card artwork`} loading="lazy" decoding="async" onError={() => setFailed(true)} /> : <div className="visual-placeholder"><b>{failed ? "Image unavailable" : "No verified image"}</b><span>Open card details</span></div>}</div><div className="visual-tile-image-source">{artwork && !failed ? artwork.source : "Image missing"}</div>
      <div className="visual-tile-meta"><span className={`visual-decision-badge decision-${(card.visualDecision ?? "UNDECIDED").toLocaleLowerCase()}`}>{card.visualDecision === "CONFIRMED" ? "Confirmed" : card.visualDecision === "REJECTED" ? "Not Special Art" : card.visuallyReviewed ? "Undecided" : "Not reviewed"}</span><h3>{card.name}</h3><p>{card.language.toUpperCase()} · {card.setName}</p><p>#{card.localId} · {card.rarity || "Rarity missing"}</p></div></button>
  </article>;
}

function DetailArtwork({ card, candidateId, zoom, imageFailed, setImageFailed }: { card: ClassificationReviewItem; candidateId: string; zoom: boolean; imageFailed: boolean; setImageFailed: (failed: boolean) => void }) {
  const artwork = cardArtwork(card, candidateId);
  if (!artwork || imageFailed) return <div className="visual-placeholder"><b>No verified card image</b><span>Use source links to inspect this exact card. An unrelated Pokémon image is never shown.</span></div>;
  return <img className={zoom ? "is-zoomed" : ""} src={artwork.url} alt={`${card.name} card artwork from ${artwork.source}`} onError={() => setImageFailed(true)} onClick={() => setImageFailed(false)} />;
}

function CompareCard({ card, onOpen }: { card: ClassificationReviewItem; onOpen: () => void }) {
  const artwork = cardArtwork(card);
  return <article><button className="visual-compare-art" onClick={onOpen}>{artwork ? <img src={artwork.url} alt={`${card.name} artwork`} loading="lazy" decoding="async" /> : <div className="visual-placeholder">No verified image</div>}</button><h3>{card.name}</h3><p>{card.setName} · #{card.localId}</p><p>{card.language.toUpperCase()} · {card.rarity || "Rarity missing"}</p><p>{artwork?.source ?? "Image missing"}</p><button className="secondary-button" onClick={onOpen}>Open review details</button></article>;
}
