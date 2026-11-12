import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { Link, NavLink, Route, Routes, useLocation, useNavigate, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  BarChart3,
  Check,
  CircleHelp,
  ClipboardPaste,
  Database,
  Layers3,
  LayoutGrid,
  List,
  LoaderCircle,
  Moon,
  RefreshCw,
  Search,
  Settings,
  ShieldAlert,
  Sparkles,
  Sun,
  Trophy,
  UsersRound,
  X,
} from "lucide-react";
import {
  api,
  imageUrl,
  type CardEntry,
  type CardFilterOptions,
  type CatalogCoverageData,
  type CatalogCoverageSet,
  type ClassificationReviewAction,
  type ClassificationReviewItem,
  type ClassificationReviewPage,
  type ClassificationReviewReason,
  type ClassificationReviewSummary,
  type CollectionEntry,
  type DashboardStats,
  type ImportHistoryDetails,
  type ImportHistoryEntry,
  type ImportPreview,
  type ImportPreviewRecord,
  type PokemonEntry,
  type SettingsData,
} from "./api";
import { VisualSpecialArtReview } from "./VisualSpecialArtReview";
import { REVIEW_CLASSIFICATIONS } from "./visualReview";

const TYPES = [
  "normal", "fire", "water", "electric", "grass", "ice", "fighting", "poison", "ground",
  "flying", "psychic", "bug", "rock", "ghost", "dragon", "dark", "steel", "fairy",
];
const DISPLAY_CARD_LANGUAGES = ["en", "ja", "zh-cn", "zh-tw"] as const;

function recordDisplayLanguages(record: ImportPreviewRecord["record"]): string[] {
  if (record.languageCandidates?.length) return [...new Set(record.languageCandidates)];
  if (record.language === "zh-unknown") return ["zh-cn", "zh-tw"];
  if (record.language === "unknown") return ["en"];
  return [record.language];
}

function recordLanguageIsSupported(record: ImportPreviewRecord["record"]): boolean {
  return recordDisplayLanguages(record).every((language) => (DISPLAY_CARD_LANGUAGES as readonly string[]).includes(language));
}
const TYPE_COLORS: Record<string, string> = {
  normal: "#a8a77a", fire: "#ee8130", water: "#6390f0", electric: "#f7d02c",
  grass: "#7ac74c", ice: "#96d9d6", fighting: "#c22e28", poison: "#a33ea1",
  ground: "#e2bf65", flying: "#a98ff3", psychic: "#f95587", bug: "#a6b91a",
  rock: "#b6a136", ghost: "#735797", dragon: "#6f35fc", dark: "#705746",
  steel: "#b7b7ce", fairy: "#d685ad",
};
const NAV_ITEMS = [
  { to: "/", label: "Pokédex", icon: LayoutGrid },
  { to: "/dashboard", label: "Dashboard", icon: BarChart3 },
  { to: "/collection", label: "My Collection", icon: Sparkles },
  { to: "/missing", label: "Missing Cards", icon: CircleHelp },
  { to: "/import", label: "Collectr Import", icon: ClipboardPaste },
  { to: "/settings", label: "Settings", icon: Settings },
];

function mixHex(color: string, mix: string, amount: number): string {
  const channels = [1, 3, 5].map((index) => {
    const value = Number.parseInt(color.slice(index, index + 2), 16);
    const target = Number.parseInt(mix.slice(index, index + 2), 16);
    return Math.round(value + (target - value) * amount).toString(16).padStart(2, "0");
  });
  return `#${channels.join("")}`;
}

function pokemonTypeGradient(types: string[]): string {
  const colors = types.map((type) => TYPE_COLORS[type.toLowerCase()]).filter(Boolean);
  const first = colors[0] ?? "#a8b2c8";
  const second = colors[1];
  if (!second) {
    return `linear-gradient(135deg, ${mixHex(first, "#ffffff", 0.4)}, ${first} 58%, ${mixHex(first, "#000000", 0.12)})`;
  }
  return `linear-gradient(135deg, ${mixHex(first, "#ffffff", 0.35)}, ${first} 28%, ${second} 72%, ${mixHex(second, "#000000", 0.12)})`;
}

function pokemonTypeColor(types: string[]): string {
  return TYPE_COLORS[types[0]?.toLowerCase() ?? ""] ?? "#e53935";
}

function useApiQuery<T>(key: string, path: string) {
  return useQuery({ queryKey: [key, path], queryFn: () => api<T>(path) });
}

interface CardListFilters {
  search: string;
  pokemon: string;
  generation: string;
  type: string;
  set: string;
  language: string;
  category: string;
  sort: string;
}

const EMPTY_CARD_FILTERS: CardListFilters = {
  search: "",
  pokemon: "",
  generation: "",
  type: "",
  set: "",
  language: "",
  category: "",
  sort: "name",
};

function useCardListFilters(scope: "collection" | "missing") {
  const { data } = useApiQuery<{ filters?: Record<string, CardListFilters> }>("settings-preferences", "/settings/preferences");
  const [filters, setFilters] = useState<CardListFilters>(EMPTY_CARD_FILTERS);
  const hydrated = useRef(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saveMutation = useMutation({
    mutationFn: (savedFilters: Record<string, CardListFilters>) => api("/settings/preferences", {
      method: "PUT",
      body: JSON.stringify({ filters: savedFilters }),
    }),
  });
  useEffect(() => {
    if (data && !hydrated.current) {
      const saved = data.filters?.[scope];
      if (saved) setFilters({ ...EMPTY_CARD_FILTERS, ...saved });
      hydrated.current = true;
    }
  }, [data, scope]);
  useEffect(() => {
    if (!hydrated.current) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      saveMutation.mutate({ ...(data?.filters ?? {}), [scope]: filters });
    }, 500);
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, [data?.filters, filters, scope]);
  const update = (patch: Partial<CardListFilters>) => setFilters((current) => ({ ...current, ...patch }));
  return { filters, update, saveError: saveMutation.error };
}

function ErrorState({ message }: { message: string }) {
  return <div className="notice error"><ShieldAlert size={18} /><span>{message}</span></div>;
}

function EmptyState({ title, text }: { title: string; text: string }) {
  return <div className="empty-state"><div className="empty-icon"><Sparkles size={24} /></div><h3>{title}</h3><p>{text}</p></div>;
}

function Loading() {
  return <div className="loading"><span className="loading-pokeball" aria-hidden="true" /> Loading saved data…</div>;
}

function Shell() {
  const [globalSearch, setGlobalSearch] = useState("");
  const [theme, setTheme] = useState<"light" | "dark">(() =>
    window.localStorage.getItem("pokedex-theme") === "dark" ? "dark" : "light",
  );
  const navigate = useNavigate();
  const location = useLocation();
  const { data: preferences } = useApiQuery<{ theme?: "light" | "dark" }>("settings-preferences", "/settings/preferences");
  const { data: stats } = useApiQuery<DashboardStats>("stats", "/stats");
  const { data: settings } = useApiQuery<SettingsData>("settings", "/settings");
  const saveTheme = useMutation({
    mutationFn: (nextTheme: "light" | "dark") => api("/settings/preferences", {
      method: "PUT",
      body: JSON.stringify({ theme: nextTheme }),
    }),
  });
  useEffect(() => {
    if (!preferences?.theme) return;
    setTheme(preferences.theme);
    window.localStorage.setItem("pokedex-theme", preferences.theme);
  }, [preferences?.theme]);
  const toggleTheme = () => {
    const nextTheme = theme === "dark" ? "light" : "dark";
    setTheme(nextTheme);
    window.localStorage.setItem("pokedex-theme", nextTheme);
    saveTheme.mutate(nextTheme);
  };
  useEffect(() => {
    setGlobalSearch(new URLSearchParams(location.search).get("search") ?? "");
  }, [location.search]);
  return (
    <div className="app-shell" data-theme={theme}>
      <aside className="sidebar">
        <Link className="brand" to="/"><span className="brand-mark" aria-hidden="true"><i /></span><span><b>Pokémon</b><span className="brand-sub">COLLECTION</span></span></Link>
        <div className="side-label">YOUR TRACKER</div>
        <nav className="nav-list">
          {NAV_ITEMS.map(({ to, label, icon: Icon }) => (
            <NavLink key={to} to={to} end={to === "/"} title={label} className={({ isActive }) => `nav-link${isActive ? " active" : ""}`}>
              <Icon size={18} strokeWidth={1.8} /><span>{label}</span>{label === "Collectr Import" && <span className="nav-new">NEW</span>}
            </NavLink>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="sidebar-note"><span className={`note-dot${settings?.database.status === "connected" ? " is-connected" : " is-disconnected"}`} /><span>{settings?.database.status === "connected" ? "Database connected" : "Database status"}</span></div>
          <div className="sidebar-stats"><span><Database size={13} /> {stats?.pokemonTotal.toLocaleString() ?? "—"} Pokémon scanned</span><span><Trophy size={13} /> {stats?.completionPercent ?? 0}% collection complete</span></div>
          <p>Your local trainer profile</p>
        </div>
      </aside>
      <main className="main-area">
        <PikachuBackground />
        <header className="topbar">
          <div className="breadcrumb">Collection <span>/</span> <b>{NAV_ITEMS.find((item) => item.to === location.pathname)?.label ?? "Pokémon"}</b></div>
          <form className="global-search" onSubmit={(event) => { event.preventDefault(); navigate(`/?search=${encodeURIComponent(globalSearch)}`); }}>
            <Search size={16} /><input value={globalSearch} onChange={(event) => setGlobalSearch(event.target.value)} placeholder="Search Pokémon or card…" aria-label="Search Pokémon or card" /><kbd>↵</kbd>
          </form>
          <button className="theme-toggle" type="button" onClick={toggleTheme} aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} mode`} title={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}>
            {theme === "dark" ? <Sun size={18} /> : <Moon size={18} />}
          </button>
        </header>
        <div className="main-route-content">
          <Routes>
            <Route path="/" element={<PokedexPage />} />
            <Route path="/dashboard" element={<DashboardPage />} />
            <Route path="/pokemon/:nationalDex" element={<PokemonDetailPage />} />
            <Route path="/collection" element={<CollectionPage />} />
            <Route path="/missing" element={<MissingPage />} />
            <Route path="/import" element={<CollectrImportPage />} />
            <Route path="/settings" element={<SettingsPage />} />
            <Route path="*" element={<PokedexPage />} />
          </Routes>
        </div>
      </main>
    </div>
  );
}

export default function App() {
  return <Shell />;
}

function PokedexPage() {
  const location = useLocation();
  const searchParams = new URLSearchParams(location.search);
  const [search, setSearch] = useState(searchParams.get("search") ?? "");
  useEffect(() => {
    setSearch(new URLSearchParams(location.search).get("search") ?? "");
  }, [location.search]);
  const [generation, setGeneration] = useState("");
  const [type, setType] = useState<string[]>([]);
  const [status, setStatus] = useState("");
  const [sort, setSort] = useState("dex");
  const [view, setView] = useState<"grid" | "list">("grid");
  const { data: stats } = useApiQuery<DashboardStats>("stats", "/stats");
  const query = new URLSearchParams();
  if (search.trim()) query.set("search", search.trim());
  if (generation) query.set("generation", generation);
  if (type.length) query.set("type", type.join(","));
  if (status) query.set("status", status);
  const { data, isLoading, error } = useApiQuery<PokemonEntry[]>("pokemon", `/pokemon?${query.toString()}`);
  const sorted = useMemo(() => {
    const list = [...(data ?? [])];
    if (sort === "name-asc") list.sort((a, b) => a.name.localeCompare(b.name));
    if (sort === "name-desc") list.sort((a, b) => b.name.localeCompare(a.name));
    if (sort === "progress-asc") list.sort((a, b) => a.progress - b.progress);
    if (sort === "progress-desc") list.sort((a, b) => b.progress - a.progress);
    if (sort === "most-owned") list.sort((a, b) => b.ownedCards - a.ownedCards);
    if (sort === "most-missing") list.sort((a, b) => (b.totalCards - b.ownedCards) - (a.totalCards - a.ownedCards));
    return list;
  }, [data, sort]);

  return (
    <section className="page page-enter">
      <div className="page-heading pokedex-hero">
        <div className="pokedex-hero-copy"><p className="eyebrow">YOUR PERSONAL COLLECTION</p><h1>Pokémon Pokédex</h1><p className="page-description">Your journey to complete the ultimate Pokémon collection.</p></div>
        <div className="pokedex-hero-actions"><span className="hero-kicker"><Sparkles size={15} /> TRAINER HUB</span><Link className="primary-button" to="/import"><ClipboardPaste size={16} /> Import collection</Link></div>
        <div className="hero-pokeball" aria-hidden="true"><i /></div>
      </div>
      <div className="trainer-stats" aria-label="Collection overview">
        <StatCard icon={<Database size={19} />} label="Total Pokémon" value={stats?.pokemonTotal} tone="red" />
        <StatCard icon={<UsersRound size={19} />} label="Pokémon owned" value={stats?.pokemonOwned} tone="blue" />
        <StatCard icon={<Trophy size={19} />} label="Collection complete" value={`${stats?.completionPercent ?? 0}%`} tone="gold" />
        <StatCard icon={<Layers3 size={19} />} label="Special Art owned" value={stats?.uniqueCardsOwned} tone="green" />
      </div>
      <div className="filter-panel">
        <label className="filter-search"><Search size={16} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search by name or Pokédex number" />{search && <button className="clear-search" type="button" onClick={() => setSearch("")} aria-label="Clear search"><X size={15} /></button>}<kbd>⌘ K</kbd></label>
        <select value={generation} onChange={(event) => setGeneration(event.target.value)} aria-label="Filter by generation"><option value="">All generations</option>{Array.from({ length: 9 }, (_, i) => <option key={i + 1} value={i + 1}>Generation {i + 1}</option>)}</select>
        <select value={status} onChange={(event) => setStatus(event.target.value)} aria-label="Filter by collection status"><option value="">All status</option><option value="owned">Owned</option><option value="missing">Missing</option><option value="completed">Completed</option><option value="no-cards">No cards known</option></select>
        <select value={sort} onChange={(event) => setSort(event.target.value)} aria-label="Sort Pokémon"><option value="dex">Pokédex number</option><option value="name-asc">Name A–Z</option><option value="name-desc">Name Z–A</option><option value="progress-asc">Progress low to high</option><option value="progress-desc">Progress high to low</option><option value="most-owned">Most owned</option><option value="most-missing">Most missing</option></select>
        <div className="view-switch"><button className={view === "grid" ? "selected" : ""} onClick={() => setView("grid")} aria-label="Grid view"><LayoutGrid size={17} /></button><button className={view === "list" ? "selected" : ""} onClick={() => setView("list")} aria-label="List view"><List size={17} /></button></div>
      </div>
      <div className="type-filters" aria-label="Filter by Pokémon type">
        {TYPES.map((item) => <button key={item} style={{ "--type-color": TYPE_COLORS[item] } as CSSProperties} className={`type-chip ${item}${type.includes(item) ? " selected" : ""}`} onClick={() => setType((old) => old.includes(item) ? old.filter((entry) => entry !== item) : [...old, item])}><span className="type-chip-dot" />{item}</button>)}
      </div>
      {isLoading ? <Loading /> : error ? <ErrorState message={error.message} /> : sorted.length === 0 ? <EmptyState title="No Pokémon in your database yet" text="Sync PokeAPI and TCGdex in Settings to populate the Pokédex with real card and Pokémon data." /> : (
        <div className={view === "grid" ? "pokemon-grid" : "pokemon-list"}>
          {sorted.map((pokemon) => <PokemonTile key={pokemon._id} pokemon={pokemon} list={view === "list"} />)}
        </div>
      )}
      {!isLoading && !error && sorted.length > 0 && <div className="result-count">Showing <b>{sorted.length}</b> Pokémon from your database</div>}
    </section>
  );
}

function PokemonTile({ pokemon, list }: { pokemon: PokemonEntry; list: boolean }) {
  const statusLabel = pokemon.collectionStatus === "completed" ? "Complete" : pokemon.collectionStatus === "owned" ? "Collecting" : "To discover";
  return (
    <Link
      className={`pokemon-tile${list ? " list-tile" : ""}`}
      to={`/pokemon/${pokemon.nationalDex}`}
      style={{ "--pokemon-type-gradient": pokemonTypeGradient(pokemon.types) } as CSSProperties}
    >
      <div className="pokemon-art">
        <span className="dex-number">#{String(pokemon.nationalDex).padStart(4, "0")}</span>
        {pokemon.artwork || pokemon.image ? <img loading="lazy" src={pokemon.artwork || pokemon.image} alt={pokemon.name} /> : <Sparkles size={30} />}
        <span className={`status-mark ${pokemon.collectionStatus}`} title={statusLabel}>{pokemon.collectionStatus === "completed" && <Check size={12} />}<span>{statusLabel}</span></span>
      </div>
      <div className="pokemon-info">
        <div className="pokemon-name-line"><h3>{pokemon.name}</h3><span className="gen-label">GEN {pokemon.generation}</span></div>
        <div className="pokemon-types">{pokemon.types.map((item) => <span className={`type-pill ${item}`} key={item}>{item}</span>)}</div>
        <div className="progress-copy"><span>Special Art</span><b>{pokemon.ownedCards} / {pokemon.totalCards}</b></div>
        <div className="progress-track"><span style={{ width: `${pokemon.progress}%` }} /></div>
        <div className="progress-percent">{pokemon.totalCards === 0 ? "No known cards" : `${pokemon.progress}% complete`}</div>
      </div>
    </Link>
  );
}

function StatCard({ icon, label, value, tone }: { icon: ReactNode; label: string; value: string | number | undefined; tone: string }) {
  return <div className={`stat-card ${tone}`}><span className="stat-icon">{icon}</span><div><b>{typeof value === "number" ? value.toLocaleString() : value ?? "—"}</b><span>{label}</span></div></div>;
}

function PokemonDetailPage() {
  const { nationalDex } = useParams();
  const { data, isLoading, error } = useApiQuery<{ pokemon: PokemonEntry; cards: CardEntry[] }>("pokemon-detail", `/pokemon/${nationalDex}`);
  const [setFilter, setSetFilter] = useState("");
  const [languageFilter, setLanguageFilter] = useState("");
  const [rarityFilter, setRarityFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const queryClient = useQueryClient();
  const update = useMutation({
    mutationFn: ({ cardId, quantity }: { cardId: string; quantity: number }) => api(`/collection/${cardId}`, { method: "PUT", body: JSON.stringify({ quantity }) }),
    onSuccess: () => queryClient.invalidateQueries(),
  });
  if (isLoading) return <section className="page"><Loading /></section>;
  if (error) return <section className="page"><ErrorState message={error.message} /></section>;
  if (!data) return null;
  const owned = data.cards.filter((card) => card.collection?.some((item) => item.quantity > 0)).length;
  const cards = data.cards.filter((card) => {
    const cardOwned = Boolean(card.collection?.some((item) => item.quantity > 0));
    return (!setFilter || card.setName === setFilter)
      && (!languageFilter || card.language === languageFilter)
      && (!rarityFilter || card.rarity === rarityFilter)
      && (!statusFilter || (statusFilter === "owned" ? cardOwned : !cardOwned));
  });
  return (
    <section className="page page-enter">
      <Link to="/" className="back-link">← Back to Pokédex</Link>
      <div className="detail-hero" style={{ "--pokemon-type-gradient": pokemonTypeGradient(data.pokemon.types), "--pokemon-type-color": pokemonTypeColor(data.pokemon.types) } as CSSProperties}>
        <div className="detail-art">{data.pokemon.artwork || data.pokemon.image ? <img src={data.pokemon.artwork || data.pokemon.image} alt={data.pokemon.name} /> : <Sparkles size={42} />}</div>
        <div><p className="eyebrow">#{String(data.pokemon.nationalDex).padStart(4, "0")} · GENERATION {data.pokemon.generation}</p><h1>{data.pokemon.name}</h1><div className="pokemon-types">{data.pokemon.types.map((item) => <span className={`type-pill ${item}`} key={item}>{item}</span>)}</div><p className="page-description">{owned} of {data.cards.length} known Special Art cards owned</p></div>
        <div className="detail-progress"><strong>{data.cards.length ? Math.round((owned / data.cards.length) * 100) : 0}%</strong><span>collection complete</span></div>
      </div>
      <div className="section-title"><div><p className="eyebrow">COLLECTOR CHECKLIST</p><h2>Special Art cards <span>{data.cards.length}</span></h2></div></div>
      {data.cards.length === 0 ? <EmptyState title="No classified cards found" text="There are no confirmed Special Art cards linked to this Pokémon in your database yet." /> : (
        <>
        <div className="filter-panel detail-filters">
          <select value={setFilter} onChange={(event) => setSetFilter(event.target.value)} aria-label="Filter by set"><option value="">All sets</option>{[...new Set(data.cards.map((card) => card.setName))].sort().map((set) => <option key={set} value={set}>{set}</option>)}</select>
          <select value={languageFilter} onChange={(event) => setLanguageFilter(event.target.value)} aria-label="Filter by language"><option value="">All languages</option>{[...new Set(data.cards.map((card) => card.language))].filter((language) => (DISPLAY_CARD_LANGUAGES as readonly string[]).includes(language)).sort().map((language) => <option key={language} value={language}>{language.toUpperCase()}</option>)}</select>
          <select value={rarityFilter} onChange={(event) => setRarityFilter(event.target.value)} aria-label="Filter by rarity"><option value="">All rarities</option>{[...new Set(data.cards.map((card) => card.rarity).filter(Boolean))].sort().map((rarity) => <option key={rarity} value={rarity}>{rarity}</option>)}</select>
          <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} aria-label="Filter by collection status"><option value="">All cards</option><option value="owned">Owned</option><option value="missing">Missing</option></select>
        </div>
        <div className="card-grid">
          {cards.map((card) => {
            const count = card.collection?.reduce((sum, item) => sum + item.quantity, 0) ?? 0;
            return <CardTile key={card._id} card={card} owned={count > 0} quantity={count} onQuantity={(quantity) => update.mutate({ cardId: card._id, quantity })} />;
          })}
        </div>
        {cards.length === 0 && <EmptyState title="No matching cards" text="Adjust the filters to see more of this Pokémon’s Special Art cards." />}
        </>
      )}
    </section>
  );
}

function CardTile({ card, owned, quantity, onQuantity, list = false }: { card: CardEntry; owned: boolean; quantity: number; onQuantity: (quantity: number) => void; list?: boolean }) {
  const [previewOpen, setPreviewOpen] = useState(false);
  return (
    <>
    <article className={`card-tile${owned ? " card-owned" : ""}${quantity === 0 ? " card-missing" : ""}${list ? " card-list-tile" : ""}`}>
      <button className="card-image" type="button" onClick={() => setPreviewOpen(true)} aria-label={`View ${card.name} card details`}>
        {card.image ? <img loading="lazy" src={imageUrl(card.image)} alt={card.name} onError={(event) => { event.currentTarget.src = card.image; }} /> : <div className="card-no-image">Card image unavailable</div>}
        {owned && <span className="owned-badge yes">OWNED</span>}
        {quantity === 0 && <span className="missing-badge">MISSING</span>}
        <span className="card-view-hint">View card</span>
      </button>
      <div className="card-info"><h3>{card.name}</h3><p>{card.setName} · {card.localId}</p><div className="card-meta"><span>{card.rarity || card.classification.replace(/_/g, " ")}</span><span>{card.language.toUpperCase()}</span></div></div>
      <div className="quantity-control"><span>Quantity</span><div><button onClick={() => onQuantity(Math.max(0, quantity - 1))} aria-label={`Remove one ${card.name}`}>−</button><b>{quantity}</b><button onClick={() => onQuantity(quantity + 1)} aria-label={`Add one ${card.name}`}>+</button></div></div>
    </article>
    {previewOpen && <CardPreviewModal card={card} onClose={() => setPreviewOpen(false)} />}
    </>
  );
}

function CardPreviewModal({ card, onClose }: { card: CardEntry; onClose: () => void }) {
  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [onClose]);
  return <div className="modal-backdrop" role="presentation" onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <section className="card-modal" role="dialog" aria-modal="true" aria-labelledby="card-modal-title">
      <button className="modal-close" type="button" onClick={onClose} aria-label="Close card details"><X size={19} /></button>
      <div className="card-modal-image">{card.image ? <img src={imageUrl(card.image)} alt={card.name} onError={(event) => { event.currentTarget.src = card.image; }} /> : <div className="card-no-image">Card image unavailable</div>}</div>
      <div className="card-modal-info"><p className="eyebrow">{card.setName} · {card.localId}</p><h2 id="card-modal-title">{card.name}</h2><dl><div><dt>Rarity</dt><dd>{card.rarity || "Not provided"}</dd></div><div><dt>Language</dt><dd>{card.language.toUpperCase()}</dd></div><div><dt>Category</dt><dd>{card.classification.replace(/_/g, " ")}</dd></div><div><dt>Artist</dt><dd>{card.artist || "Not provided"}</dd></div></dl><p>{card.pokemonInfo?.map((pokemon) => pokemon.name).join(", ") || "Pokémon link unavailable"}</p></div>
    </section>
  </div>;
}

function CollectionItemTile({ item, onQuantity }: { item: CollectionEntry; onQuantity: (quantity: number) => void }) {
  const [previewOpen, setPreviewOpen] = useState(false);
  const card = item.card;
  return <>
    <article className="collection-card">
      <button className="collection-card-image" type="button" onClick={() => setPreviewOpen(true)} aria-label={`View ${card.name} card details`}>
        {card.image ? <img loading="lazy" src={imageUrl(card.image)} alt={card.name} onError={(event) => { event.currentTarget.src = card.image; }} /> : <div className="card-no-image">Image unavailable</div>}
        <span className="owned-badge yes">OWNED · {item.quantity}</span>
      </button>
      <div className="collection-card-info"><p className="eyebrow">{card.setName} · {card.localId}</p><h3>{card.name}</h3><div className="card-meta"><span>{card.rarity || card.classification.replace(/_/g, " ")}</span><span>{item.language.toUpperCase()}</span></div><p className="collection-variant">{item.finish} · {item.condition}</p><div className="collection-quantity"><span>Quantity</span><div><button type="button" onClick={() => onQuantity(Math.max(0, item.quantity - 1))} aria-label={`Remove one ${card.name}`}>−</button><b>{item.quantity}</b><button type="button" onClick={() => onQuantity(item.quantity + 1)} disabled={item.quantity >= 9999} aria-label={`Add one ${card.name}`}>+</button></div></div></div>
    </article>
    {previewOpen && <CardPreviewModal card={card} onClose={() => setPreviewOpen(false)} />}
  </>;
}

function ViewToggle({ view, onChange }: { view: "grid" | "list"; onChange: (nextView: "grid" | "list") => void }) {
  return <div className="view-switch" aria-label="Choose a layout"><button type="button" className={view === "grid" ? "selected" : ""} onClick={() => onChange("grid")} aria-label="Grid view" aria-pressed={view === "grid"}><LayoutGrid size={17} /></button><button type="button" className={view === "list" ? "selected" : ""} onClick={() => onChange("list")} aria-label="List view" aria-pressed={view === "list"}><List size={17} /></button></div>;
}

function CollectionPage() {
  const { data, isLoading, error } = useApiQuery<CollectionEntry[]>("collection", "/collection");
  const { filters, update, saveError } = useCardListFilters("collection");
  const [view, setView] = useState<"grid" | "list">("grid");
  const queryClient = useQueryClient();
  const quantityUpdate = useMutation({
    mutationFn: ({ item, quantity }: { item: CollectionEntry; quantity: number }) => api(`/collection/${item.card._id}`, {
      method: "PUT",
      body: JSON.stringify({ quantity, language: item.language, finish: item.finish, condition: item.condition }),
    }),
    onSuccess: () => queryClient.invalidateQueries(),
  });
  const rows = (data ?? []).filter((item) => {
    const text = `${item.card?.name} ${item.card?.setName} ${item.card?.localId} ${item.pokemonInfo?.map((pokemon) => pokemon.name).join(" ")}`.toLocaleLowerCase();
    const pokemonMatches = item.pokemonInfo ?? [];
    return (!filters.search || text.includes(filters.search.toLocaleLowerCase()))
      && (!filters.pokemon || pokemonMatches.some((pokemon) => String(pokemon.nationalDex) === filters.pokemon))
      && (!filters.generation || pokemonMatches.some((pokemon) => pokemon.generation === Number(filters.generation)))
      && (!filters.type || pokemonMatches.some((pokemon) => pokemon.types.includes(filters.type)))
      && (!filters.set || item.card?.setName === filters.set)
      && (!filters.language || item.language === filters.language)
      && (!filters.category || item.card?.classification === filters.category);
  }).sort((left, right) => {
    if (filters.sort === "number") return left.card.localId.localeCompare(right.card.localId, undefined, { numeric: true });
    if (filters.sort === "set") return left.card.setName.localeCompare(right.card.setName);
    if (filters.sort === "pokemon-dex") return Math.min(...(left.pokemonInfo ?? []).map((pokemon) => pokemon.nationalDex), Infinity)
      - Math.min(...(right.pokemonInfo ?? []).map((pokemon) => pokemon.nationalDex), Infinity);
    if (filters.sort === "progress") return Math.max(...(right.pokemonInfo ?? []).map((pokemon) => pokemon.progress ?? 0), 0)
      - Math.max(...(left.pokemonInfo ?? []).map((pokemon) => pokemon.progress ?? 0), 0);
    if (filters.sort === "cards") return Math.max(...(right.pokemonInfo ?? []).map((pokemon) => pokemon.totalCards ?? 0), 0)
      - Math.max(...(left.pokemonInfo ?? []).map((pokemon) => pokemon.totalCards ?? 0), 0);
    return left.card.name.localeCompare(right.card.name);
  });
  return <section className="page page-enter">
    <div className="page-heading"><div><p className="eyebrow">YOUR OWNED CARDS</p><h1>My Collection</h1><p className="page-description">Every card and variant you have recorded.</p></div><div className="heading-actions"><span className="counter-badge">{rows.length} entries</span><ViewToggle view={view} onChange={setView} /></div></div>
    <CardListFilterPanel filters={filters} update={update} placeholder="Search card, set or Pokémon" />
    {saveError && <ErrorState message={`Could not save filter preferences: ${saveError.message}`} />}
    {quantityUpdate.error && <ErrorState message={quantityUpdate.error.message} />}
    {isLoading ? <Loading /> : error ? <ErrorState message={error.message} /> : rows.length === 0 ? <EmptyState title="Your collection is empty" text="Import your cards from Collectr or mark cards as owned from a Pokémon detail page." /> : view === "grid" ? <div className="collection-grid">{rows.map((item) => <CollectionItemTile key={item._id} item={item} onQuantity={(quantity) => quantityUpdate.mutate({ item, quantity })} />)}</div> : <div className="collection-table">
      <div className="table-head"><span>Card</span><span>Set</span><span>Variant</span><span>Condition</span><span>Qty</span></div>
      {rows.map((item) => <div className="table-row" key={item._id}><div className="table-card"><img src={imageUrl(item.card.image)} alt="" loading="lazy" /><div><b>{item.card.name}</b><small>{item.card.localId} · {item.card.rarity}</small></div></div><span>{item.card.setName}</span><span>{item.language.toUpperCase()} · {item.finish}</span><span>{item.condition}</span><div className="table-quantity"><button type="button" onClick={() => quantityUpdate.mutate({ item, quantity: Math.max(0, item.quantity - 1) })} aria-label={`Remove one ${item.card.name}`}>−</button><b>{item.quantity}</b><button type="button" disabled={item.quantity >= 9999} onClick={() => quantityUpdate.mutate({ item, quantity: item.quantity + 1 })} aria-label={`Add one ${item.card.name}`}>+</button></div></div>)}
    </div>}
  </section>;
}

function MissingPage() {
  const { data, isLoading, error } = useApiQuery<CardEntry[]>("missing-cards", "/cards/missing");
  const { filters, update: updateFilters, saveError } = useCardListFilters("missing");
  const [view, setView] = useState<"grid" | "list">("grid");
  const queryClient = useQueryClient();
  const collectionUpdate = useMutation({
    mutationFn: ({ cardId, quantity }: { cardId: string; quantity: number }) =>
      api(`/collection/${cardId}`, { method: "PUT", body: JSON.stringify({ quantity }) }),
    onSuccess: () => queryClient.invalidateQueries(),
  });
  const cards = (data ?? []).filter((card) => {
    const text = `${card.name} ${card.setName} ${card.localId} ${card.pokemonInfo?.map((pokemon) => pokemon.name).join(" ")}`.toLocaleLowerCase();
    const pokemonMatches = card.pokemonInfo ?? [];
    return (!filters.search || text.includes(filters.search.toLocaleLowerCase()))
      && (!filters.pokemon || pokemonMatches.some((pokemon) => String(pokemon.nationalDex) === filters.pokemon))
      && (!filters.generation || pokemonMatches.some((pokemon) => pokemon.generation === Number(filters.generation)))
      && (!filters.type || pokemonMatches.some((pokemon) => pokemon.types.includes(filters.type)))
      && (!filters.set || card.setName === filters.set)
      && (!filters.language || card.language === filters.language)
      && (!filters.category || card.classification === filters.category);
  }).sort((left, right) => {
    if (filters.sort === "number") return left.localId.localeCompare(right.localId, undefined, { numeric: true });
    if (filters.sort === "set") return left.setName.localeCompare(right.setName);
    if (filters.sort === "pokemon-dex") return Math.min(...(left.pokemonInfo ?? []).map((pokemon) => pokemon.nationalDex), Infinity)
      - Math.min(...(right.pokemonInfo ?? []).map((pokemon) => pokemon.nationalDex), Infinity);
    if (filters.sort === "progress") return Math.max(...(right.pokemonInfo ?? []).map((pokemon) => pokemon.progress ?? 0), 0)
      - Math.max(...(left.pokemonInfo ?? []).map((pokemon) => pokemon.progress ?? 0), 0);
    if (filters.sort === "cards") return Math.max(...(right.pokemonInfo ?? []).map((pokemon) => pokemon.totalCards ?? 0), 0)
      - Math.max(...(left.pokemonInfo ?? []).map((pokemon) => pokemon.totalCards ?? 0), 0);
    return left.name.localeCompare(right.name);
  });
  return <section className="page page-enter">
    <div className="page-heading"><div><p className="eyebrow">YOUR COLLECTOR CHECKLIST</p><h1>Missing Cards</h1><p className="page-description">Special Art cards in the database not yet recorded in your collection.</p></div><div className="heading-actions"><span className="counter-badge">{cards.length} to discover</span><ViewToggle view={view} onChange={setView} /></div></div>
    <CardListFilterPanel filters={filters} update={updateFilters} placeholder="Search card, set or Pokémon" />
    <div className="discover-banner"><Sparkles size={19} /><span><b>Cards to discover</b><small>Each card here is one step closer to completing your collection.</small></span></div>
    {saveError && <ErrorState message={`Could not save filter preferences: ${saveError.message}`} />}
    {isLoading ? <Loading /> : error ? <ErrorState message={error.message} /> : cards.length === 0 ? <EmptyState title="No missing cards found" text="Sync card data or add owned cards to see your checklist." /> : <div className={`card-grid${view === "list" ? " card-grid-list" : ""}`}>{cards.map((card) => <CardTile key={card._id} card={card} owned={false} quantity={0} list={view === "list"} onQuantity={(quantity) => { if (quantity > 0) collectionUpdate.mutate({ cardId: card._id, quantity }); }} />)}</div>}
    {collectionUpdate.error && <ErrorState message={collectionUpdate.error.message} />}
  </section>;
}

function CardListFilterPanel({
  filters,
  update,
  placeholder,
}: {
  filters: CardListFilters;
  update: (patch: Partial<CardListFilters>) => void;
  placeholder: string;
}) {
  const { data: options, error } = useApiQuery<CardFilterOptions>("card-filter-options", "/filters/options");
  return <div className="filter-panel collection-filters">
    <label className="filter-search"><Search size={15} /><input value={filters.search} onChange={(event) => update({ search: event.target.value })} placeholder={placeholder} /></label>
    <select value={filters.pokemon} onChange={(event) => update({ pokemon: event.target.value })} aria-label="Filter by Pokémon"><option value="">All Pokémon</option>{options?.pokemon.map((pokemon) => <option key={pokemon.nationalDex} value={pokemon.nationalDex}>{pokemon.name}</option>)}</select>
    <select value={filters.generation} onChange={(event) => update({ generation: event.target.value })} aria-label="Filter by generation"><option value="">All generations</option>{Array.from({ length: 9 }, (_, index) => <option key={index + 1} value={index + 1}>Generation {index + 1}</option>)}</select>
    <select value={filters.type} onChange={(event) => update({ type: event.target.value })} aria-label="Filter by Pokémon type"><option value="">All Pokémon types</option>{TYPES.map((type) => <option key={type} value={type}>{type}</option>)}</select>
    <select value={filters.set} onChange={(event) => update({ set: event.target.value })} aria-label="Filter by set"><option value="">All sets</option>{options?.sets.map((set) => <option key={set} value={set}>{set}</option>)}</select>
    <select value={filters.language} onChange={(event) => update({ language: event.target.value })} aria-label="Filter by language"><option value="">All languages</option>{options?.languages.filter((language) => (DISPLAY_CARD_LANGUAGES as readonly string[]).includes(language)).map((language) => <option key={language} value={language}>{language.toUpperCase()}</option>)}</select>
    <select value={filters.category} onChange={(event) => update({ category: event.target.value })} aria-label="Filter by special-art category"><option value="">All categories</option>{options?.categories.map((category) => <option key={category} value={category}>{category.replace(/_/g, " ")}</option>)}</select>
    <select value={filters.sort} onChange={(event) => update({ sort: event.target.value })} aria-label="Sort cards"><option value="name">Name</option><option value="number">Card number</option><option value="pokemon-dex">Pokédex number</option><option value="progress">Pokémon progress</option><option value="cards">Number of cards</option><option value="set">Set</option></select>
    {error && <span className="search-error">Filter options could not be loaded: {error.message}</span>}
  </div>;
}

function DashboardPage() {
  const { data, isLoading, error } = useApiQuery<DashboardStats>("stats", "/stats");
  if (isLoading) return <Loading />;
  if (error) return <ErrorState message={error.message} />;
  if (!data) return null;
  const metrics = [
    { label: "Pokémon collected", value: data.pokemonOwned, total: data.pokemonTotal, color: "blue" },
    { label: "Pokémon completed", value: data.pokemonCompleted, total: data.pokemonTotal, color: "green" },
    { label: "Unique cards owned", value: data.uniqueCardsOwned, total: data.specialCardsTotal, color: "purple" },
    { label: "Physical copies", value: data.physicalCopiesOwned, total: undefined, color: "orange" },
  ];
  const achievements = [
    { title: "First Catch", text: "Record your first unique card", unlocked: data.uniqueCardsOwned >= 1 },
    { title: "10 Pokémon Collected", text: "Own a card linked to 10 Pokémon", unlocked: data.pokemonOwned >= 10 },
    { title: "50 Pokémon Collected", text: "Grow your Pokédex to 50 owned Pokémon", unlocked: data.pokemonOwned >= 50 },
    { title: "First Complete Pokémon", text: "Complete one Pokémon’s card checklist", unlocked: data.pokemonCompleted >= 1 },
    { title: "Generation Master", text: "Complete every Pokémon in a generation", unlocked: data.breakdown.byGeneration.some((entry) => entry.total > 0 && entry.owned === entry.total) },
    { title: "Special Art Hunter", text: "Collect every classified Special Art card", unlocked: data.specialCardsTotal > 0 && data.uniqueCardsOwned >= data.specialCardsTotal },
  ];
  const level = Math.min(100, Math.floor(data.completionPercent / 10) + 1);
  return <section className="page page-enter dashboard-page"><div className="page-heading"><div><p className="eyebrow">YOUR TRAINER PROFILE</p><h1>Trainer Profile</h1><p className="page-description">A live look at your collection progress, built from your saved cards.</p></div></div><div className="trainer-overview">
    <div className="trainer-orb" style={{ "--completion": `${data.completionPercent}%` } as CSSProperties}><div><strong>{data.completionPercent}%</strong><span>complete</span></div></div>
    <div className="trainer-profile-copy"><span className="trainer-level"><Trophy size={15} /> COLLECTION LEVEL {level}</span><h2>Your collection is taking shape.</h2><p>Collection Level is a for-fun progress marker, not an official Pokémon rank.</p><div className="trainer-profile-metrics"><span><b>{data.pokemonOwned.toLocaleString()}</b> Pokémon owned</span><span><b>{data.uniqueCardsOwned.toLocaleString()}</b> unique Special Art cards</span><span><b>{data.pokemonCompleted.toLocaleString()}</b> completed Pokémon</span></div></div>
  </div><div className="dashboard">
    {metrics.map((metric) => <div className={`metric-card ${metric.color}`} key={metric.label}><span>{metric.label}</span><strong>{metric.value.toLocaleString()}</strong><small>{metric.total ? `of ${metric.total.toLocaleString()} total` : "across all variants"}</small></div>)}
    <div className="dashboard-progress"><div className="dash-progress-heading"><div><p className="eyebrow">OVERALL COLLECTION</p><h2>Special Art progress</h2></div><strong>{data.completionPercent}%</strong></div><div className="progress-track large"><span style={{ width: `${data.completionPercent}%` }} /></div><div className="dash-footer"><span>{data.uniqueCardsOwned} unique cards owned</span><span>{data.cardsMissing} cards still missing</span></div></div>
    <div className="dashboard-progress"><div className="dash-progress-heading"><div><p className="eyebrow">POKÉDEX PROGRESS</p><h2>Collection status</h2></div><BarChart3 size={22} /></div><div className="status-bars"><div><span>Owned</span><div className="progress-track"><span style={{ width: `${data.pokemonTotal ? (data.pokemonOwned / data.pokemonTotal) * 100 : 0}%` }} /></div><b>{data.pokemonOwned}</b></div><div><span>Missing</span><div className="progress-track"><span className="missing-fill" style={{ width: `${data.pokemonTotal ? (data.pokemonMissing / data.pokemonTotal) * 100 : 0}%` }} /></div><b>{data.pokemonMissing}</b></div><div><span>Completed</span><div className="progress-track"><span className="complete-fill" style={{ width: `${data.pokemonTotal ? (data.pokemonCompleted / data.pokemonTotal) * 100 : 0}%` }} /></div><b>{data.pokemonCompleted}</b></div></div></div>
    <BreakdownChart title="Generation" entries={data.breakdown.byGeneration.map((entry) => ({ ...entry, name: `Gen ${entry.name}` }))} />
    <BreakdownChart title="Pokémon Type" entries={data.breakdown.byType} />
    <BreakdownChart title="Special Art category" entries={data.breakdown.byClassification.map((entry) => ({ ...entry, name: entry.name.replace(/_/g, " ") }))} />
    <BreakdownChart title="Top Sets" entries={data.breakdown.bySet} />
    <section className="achievement-panel"><div className="section-title"><div><p className="eyebrow">MILESTONES</p><h2>Collection achievements</h2></div><span>Based on saved collection data</span></div><div className="achievement-grid">{achievements.map((achievement) => <article key={achievement.title} className={`achievement-card${achievement.unlocked ? " unlocked" : " locked"}`}><span className="achievement-icon">{achievement.unlocked ? <Trophy size={19} /> : <Database size={19} />}</span><div><b>{achievement.title}</b><p>{achievement.text}</p></div><span className="achievement-state">{achievement.unlocked ? "UNLOCKED" : "LOCKED"}</span></article>)}</div></section>
  </div></section>;
}

function BreakdownChart({ title, entries }: { title: string; entries: Array<{ name: string; total: number; owned: number }> }) {
  return <div className="dashboard-progress breakdown-chart">
    <div className="dash-progress-heading"><h2>{title}</h2><span>Owned / total</span></div>
    {entries.length === 0 ? <div className="inline-empty">No saved card data for this breakdown.</div> : <div className="breakdown-list">
      {entries.map((entry) => <div className="breakdown-row" key={entry.name}>
        <span title={entry.name}>{entry.name}</span>
        <div className="breakdown-track"><span style={{ width: `${entry.total ? (entry.owned / entry.total) * 100 : 0}%`, background: TYPE_COLORS[entry.name.toLowerCase()] ?? "linear-gradient(90deg, #e53935, #f59e0b)" }} /></div>
        <b>{entry.owned} / {entry.total}</b>
      </div>)}
    </div>}
  </div>;
}

function CollectrImportPage() {
  const [text, setText] = useState("");
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [selections, setSelections] = useState<Record<number, string>>({});
  const [ignoredRecords, setIgnoredRecords] = useState<Record<number, boolean>>({});
  const [message, setMessage] = useState("");
  const [previewTab, setPreviewTab] = useState<"matched" | "needs-review" | "unmatched">("matched");
  const [reasonFilter, setReasonFilter] = useState("");
  const [languageFilter, setLanguageFilter] = useState("");
  const [searchFilter, setSearchFilter] = useState("");
  const [historyId, setHistoryId] = useState("");
  const [viewingHistory, setViewingHistory] = useState(false);
  const queryClient = useQueryClient();
  const historyQuery = useApiQuery<ImportHistoryEntry[]>("collectr-history", "/collectr/history");
  const historyDetailQuery = useQuery({
    queryKey: ["collectr-history-detail", historyId],
    queryFn: () => api<ImportHistoryDetails>(`/collectr/history/${historyId}`),
    enabled: Boolean(historyId),
  });
  const previewMutation = useMutation({
    mutationFn: (sourceText: string) => api<ImportPreview>("/collectr/preview", { method: "POST", body: JSON.stringify({ text: sourceText }) }),
    onSuccess: (result) => {
      importMutation.reset();
      setPreview(result);
      setSelections(Object.fromEntries(result.records.flatMap((item) =>
        item.manualDecision?.cardId ? [[item.index, item.manualDecision.cardId]] : [],
      )));
      setIgnoredRecords({});
      setViewingHistory(false);
      setPreviewTab("matched");
      setMessage("");
      void queryClient.invalidateQueries({ queryKey: ["collectr-history"] });
    },
  });
  const importMutation = useMutation({
    mutationFn: () => api<{ importedItems: number }>(`/collectr/${preview?.importId}/commit`, {
      method: "POST",
      body: JSON.stringify({
        decisions: (preview?.records ?? []).map((item) => ({
          index: item.index,
          cardId: recordLanguageIsSupported(item.record) ? selections[item.index] || null : null,
        })),
      }),
    }),
    onSuccess: async (result) => {
      setMessage(`Saved ${result.importedItems} collection entries to MongoDB.`);
      await queryClient.invalidateQueries();
    },
  });
  const decisionMutation = useMutation({
    mutationFn: ({ index, cardId, ignored }: { index: number; cardId: string | null; ignored: boolean }) =>
      api<{ saved: boolean; recordIndex: number; record: ImportPreviewRecord }>(`/collectr/${preview?.importId}/records/${index}/decision`, {
        method: "PUT",
        body: JSON.stringify({ cardId, ignored }),
      }),
    onSuccess: (result) => {
      setPreview((current) => {
        if (!current) return current;
        const records = current.records.map((item) => item.index === result.recordIndex ? result.record : item);
        return {
          ...current,
          records,
          summary: {
            ...current.summary,
            matched: records.filter((item) => item.status === "matched").length,
            needsReview: records.filter((item) => item.status === "needs-review").length,
            unmatched: records.filter((item) => item.status === "unmatched").length,
          },
        };
      });
      void queryClient.invalidateQueries({ queryKey: ["collectr-history"] });
    },
  });
  const rollbackMutation = useMutation({
    mutationFn: (importId: string) => api(`/collectr/${importId}/rollback`, { method: "POST" }),
    onSuccess: async () => { await queryClient.invalidateQueries(); },
  });
  const busy = previewMutation.isPending || importMutation.isPending;
  const selectedCount = preview
    ? preview.records.filter((item) => recordLanguageIsSupported(item.record) && Boolean(selections[item.index])).length
    : 0;
  const needsReviewCount = preview
    ? preview.records.filter((item) => item.status === "needs-review").length
    : 0;
  const unmatchedCount = preview
    ? preview.records.filter((item) => item.status === "unmatched").length
    : 0;
  const matchedCount = preview?.records.filter((item) => item.status === "matched").length ?? 0;
  const filteredRecords = (preview?.records ?? []).filter((item) => {
    if (item.status !== previewTab) return false;
    if (reasonFilter && !item.reason?.includes(reasonFilter)) return false;
    if (languageFilter && item.record.language !== languageFilter) return false;
    const searchValue = `${item.record.cardName} ${item.record.setName} ${item.record.cardNumber}`.toLocaleLowerCase();
    return !searchFilter || searchValue.includes(searchFilter.toLocaleLowerCase());
  });
  const openHistoryPreview = () => {
    const history = historyDetailQuery.data;
    if (!history) return;
    const summary = {
      recordsDetected: history.records.length,
      matched: history.records.filter((item) => item.status === "matched").length,
      needsReview: history.records.filter((item) => item.status === "needs-review").length,
      unmatched: history.records.filter((item) => item.status === "unmatched").length,
      ignoredLines: history.parseSummary.ignoredLines,
      inputLines: history.parseSummary.inputLines,
    };
    setPreview({ importId: history._id, records: history.records, summary });
    setSelections(Object.fromEntries(history.records.flatMap((item) =>
      item.manualDecision?.cardId ? [[item.index, item.manualDecision.cardId]] : [],
    )));
    setIgnoredRecords(Object.fromEntries(history.records.flatMap((item) =>
      item.manualDecision?.ignored ? [[item.index, true]] : [],
    )));
    setViewingHistory(true);
    setPreviewTab("matched");
  };
  const rePreviewHistory = () => {
    const originalText = historyDetailQuery.data?.originalText;
    if (!originalText) return;
    setText(originalText);
    previewMutation.mutate(originalText);
  };
  return <section className="page page-enter import-page">
    <div className="page-heading"><div><p className="eyebrow">SAFE, REVIEWABLE IMPORT</p><h1>Import from Collectr</h1><p className="page-description">Paste copied collection text, review exact matches, then save them to MongoDB.</p></div></div>
    <ol className="import-stepper" aria-label="Import steps">
      <li className={preview ? "complete" : "active"}><span>{preview ? <Check size={15} /> : "01"}</span><div><b>Paste Portfolio</b><small>Bring in your copied list</small></div></li>
      <li className={preview ? "active" : ""}><span>{preview ? "02" : "02"}</span><div><b>Preview &amp; Match</b><small>Review each suggested card</small></div></li>
      <li className={importMutation.isSuccess ? "complete" : selectedCount ? "active" : ""}><span>{importMutation.isSuccess ? <Check size={15} /> : "03"}</span><div><b>Review &amp; Import</b><small>Confirm selected entries</small></div></li>
    </ol>
    <div className="import-layout">
      <div className="import-panel">
        <div className="panel-title"><span className="step-number">01</span><div><h2>Paste your collection</h2><p>No Collectr PRO export or private API is required.</p></div></div>
        <textarea value={text} onChange={(event) => setText(event.target.value)} placeholder={"Paste the copied Collectr entries here…\n\nPikachu ex\nPikachu ex\nSet name\nIllustration Rare\n•\n025/198\nNear Mint\n•\nHolofoil\nQty: 1"} />
        <div className="import-actions"><button className="secondary-button" onClick={() => { setText(""); setPreview(null); setMessage(""); importMutation.reset(); setViewingHistory(false); }} disabled={busy}><X size={15} /> Clear</button><button className="primary-button" onClick={() => { importMutation.reset(); previewMutation.mutate(text); }} disabled={busy || !text.trim()}>{previewMutation.isPending ? <LoaderCircle className="spin" size={16} /> : <Search size={16} />} Preview matches</button></div>
        {previewMutation.error && <ErrorState message={previewMutation.error.message} />}
      </div>
      <div className="import-guide"><div className="guide-icon"><ShieldAlert size={20} /></div><h3>Import safely</h3><p>Preview does not change your collection. Only records you confirm are saved. Unmatched lines remain visible and are never silently discarded.</p><div className="guide-step"><span>1</span>Paste copied text</div><div className="guide-step"><span>2</span>Review matches and language</div><div className="guide-step"><span>3</span>Confirm to save</div></div>
    </div>
    {message && <div className="notice success"><Check size={18} />{message}</div>}
    {preview && <div className="preview-section">
      <div className="preview-summary">
        <SummaryMetric label="Records detected" value={preview.summary.recordsDetected} />
        <SummaryMetric label="Matched" value={matchedCount} tone="green" />
        <SummaryMetric label="Needs review" value={needsReviewCount} tone="amber" />
        <SummaryMetric label="No match" value={unmatchedCount} tone="rose" />
        <SummaryMetric label="Lines/blocks filtered" value={preview.summary.ignoredLines} />
      </div>
      <div className="section-title"><div><p className="eyebrow">02 · REVIEW BEFORE SAVING</p><h2>{viewingHistory ? "Saved preview" : "Import preview"} <span>{preview.summary.inputLines} non-empty source lines/blocks</span></h2></div><button className="primary-button" onClick={() => { if (window.confirm(`Import ${selectedCount} explicitly selected records into your collection?`)) importMutation.mutate(); }} disabled={viewingHistory || busy || importMutation.isSuccess || selectedCount === 0}>{importMutation.isPending ? <LoaderCircle className="spin" size={16} /> : <Check size={16} />} {viewingHistory ? "History is read-only" : importMutation.isSuccess ? "Imported" : `Import ${selectedCount} selected`}</button></div>
      {viewingHistory && <div className="notice"><CircleHelp size={18} />Historical previews are read-only here. Re-preview the saved original text to create a separate review.</div>}
      {preview.records.length === 0 && <EmptyState title="No card records identified" text={`All ${preview.summary.ignoredLines} non-empty lines were filtered as page text. No collection changes were made.`} />}
      {importMutation.error && <ErrorState message={importMutation.error.message} />}
      {decisionMutation.error && <ErrorState message={decisionMutation.error.message} />}
      <div className="review-tabs">
        {([
          ["matched", `Matched (${matchedCount})`],
          ["needs-review", `Needs Review (${needsReviewCount})`],
          ["unmatched", `Unmatched (${unmatchedCount})`],
        ] as const).map(([status, label]) => <button key={status} className={previewTab === status ? "selected" : ""} onClick={() => setPreviewTab(status)}>{label}</button>)}
      </div>
      <div className="filter-panel review-filters">
        <label className="filter-search"><Search size={15} /><input value={searchFilter} onChange={(event) => setSearchFilter(event.target.value)} placeholder="Search name, set or number" /></label>
        <select value={languageFilter} onChange={(event) => setLanguageFilter(event.target.value)} aria-label="Filter by language">
          <option value="">All languages</option>
          {DISPLAY_CARD_LANGUAGES.filter((language) => preview.records.some((item) => item.record.language === language)).map((language) => <option key={language} value={language}>{language.toUpperCase()}</option>)}
        </select>
        <select value={reasonFilter} onChange={(event) => setReasonFilter(event.target.value)} aria-label="Filter by failure reason">
          <option value="">All reasons</option>
          {[...new Set(preview.records.filter((item) => item.status === previewTab).map((item) => item.reason).filter((value): value is string => Boolean(value)))].sort().map((reason) => <option key={reason} value={reason}>{reason}</option>)}
        </select>
      </div>
      <div className="preview-list">
        {filteredRecords.map((item) => <ImportPreviewRow
          key={item.index}
          item={item}
          selected={selections[item.index] ?? ""}
          readOnly={viewingHistory}
          onSelect={(value) => {
            setSelections((old) => ({ ...old, [item.index]: value }));
            setIgnoredRecords((old) => ({ ...old, [item.index]: false }));
            decisionMutation.mutate({ index: item.index, cardId: value || null, ignored: false });
          }}
          onIgnore={() => {
            const ignored = !ignoredRecords[item.index];
            setIgnoredRecords((old) => ({ ...old, [item.index]: ignored }));
            if (ignored) setSelections((old) => ({ ...old, [item.index]: "" }));
            decisionMutation.mutate({ index: item.index, cardId: null, ignored });
          }}
          ignored={ignoredRecords[item.index] ?? Boolean(item.manualDecision?.ignored)}
        />)}
        {filteredRecords.length === 0 && <EmptyState title="No records in this view" text="Try another status, language, failure reason, or search term." />}
      </div>
    </div>}
    <div className="settings-card import-history">
      <div className="settings-heading"><div><h2>Import History</h2><p>Saved previews and committed imports. Historical previews are never overwritten by a new Preview.</p></div></div>
      {historyQuery.isLoading ? <Loading /> : historyQuery.error ? <ErrorState message={historyQuery.error.message} /> : !historyQuery.data?.length ? <div className="inline-empty">No saved import history.</div> : <div className="history-list">
        {historyQuery.data.map((entry) => <div className="history-row" key={entry._id}>
          <div><b>{new Date(entry.createdAt).toLocaleString()}</b><small>{entry.summary.records} records · {entry.summary.matched} matched · {entry.summary.needsReview} review · {entry.summary.unmatched} unmatched</small></div>
          <span className={`history-status ${entry.status}`}>{entry.status}</span>
          <div className="import-actions">
            <button className="secondary-button" onClick={() => setHistoryId(entry._id)}>Open preview</button>
            {entry.status === "completed" && <button className="secondary-button" onClick={() => {
              if (window.confirm("Roll back this committed import? Existing collection quantities will be restored to their pre-import values.")) rollbackMutation.mutate(entry._id);
            }}>Rollback</button>}
          </div>
        </div>)}
      </div>}
      {historyDetailQuery.isLoading && <Loading />}
      {historyDetailQuery.error && <ErrorState message={historyDetailQuery.error.message} />}
      {historyDetailQuery.data && <div className="history-detail">
        <span>Selected import: {historyDetailQuery.data.status} · {historyDetailQuery.data.records.length} records</span>
        <div className="import-actions">
          <button className="secondary-button" onClick={openHistoryPreview}>Open saved Preview</button>
          <button className="primary-button" onClick={rePreviewHistory}>Re-preview saved original text</button>
        </div>
      </div>}
      {rollbackMutation.error && <ErrorState message={rollbackMutation.error.message} />}
    </div>
  </section>;
}

function SummaryMetric({ label, value, tone = "" }: { label: string; value: number; tone?: string }) {
  return <div className={`summary-metric ${tone}`}><b>{value.toLocaleString()}</b><span>{label}</span></div>;
}

const PIKACHU_BACKGROUND_ASSETS = [
  "/images/pikachu-background/pikachu-walk.webp",
  "/images/pikachu-background/pikachu-charge.webp",
  "/images/pikachu-background/pikachu-hop.webp",
  "/images/pikachu-background/pikachu-sleep.webp",
  "/images/pikachu-background/pikachu-swing.webp",
  "/images/pikachu-background/pikachu-attack.webp",
  "/images/pikachu-background/pikachu-idle.webp",
] as const;

const PIKACHU_BACKGROUND_SLOTS = [
  { side: "left", top: 12, width: 94 },
  { side: "right", top: 25, width: 82 },
  { side: "left", top: 39, width: 86 },
  { side: "right", top: 53, width: 100 },
  { side: "left", top: 67, width: 78 },
  { side: "right", top: 81, width: 90 },
  { side: "left", top: 95, width: 82 },
] as const;

function PikachuBackground() {
  const placements = useMemo(() => {
    const shuffled = [...PIKACHU_BACKGROUND_ASSETS];
    for (let index = shuffled.length - 1; index > 0; index -= 1) {
      const other = Math.floor(Math.random() * (index + 1));
      [shuffled[index], shuffled[other]] = [shuffled[other], shuffled[index]];
    }
    return PIKACHU_BACKGROUND_SLOTS.map((slot, index) => ({
      ...slot,
      image: shuffled[index],
      top: Math.max(0, Math.min(98, slot.top + Math.round(Math.random() * 4 - 2))),
      width: Math.round(slot.width * (0.88 + Math.random() * 0.24)),
      rotation: Math.round(Math.random() * 22 - 11),
      opacity: (12 + Math.random() * 6) / 100,
    }));
  }, []);

  return <div className="pikachu-background-layer" aria-hidden="true">
    {placements.map((placement, index) => <img
      key={placement.image}
      className="pikachu-background-figure"
      data-position={index}
      src={placement.image}
      alt=""
      draggable={false}
      loading="lazy"
      decoding="async"
      style={{
        [placement.side]: "0%",
        top: `${placement.top}%`,
        width: `${placement.width}px`,
        opacity: placement.opacity,
        transform: `rotate(${placement.rotation}deg)`,
      }}
    />)}
  </div>;
}

function CandidateArtwork({ image, name }: { image: string; name: string }) {
  const [failed, setFailed] = useState(false);
  const source = imageUrl(image);
  if (!source || failed) {
    return <div className="candidate-art missing-image" role="img" aria-label={`${name}: no TCGdex image available`}>
      <Layers3 size={20} />
      <small>No TCGdex image</small>
    </div>;
  }
  return <img className="candidate-art" src={source} alt={name} onError={() => setFailed(true)} />;
}

function ImportPreviewRow({ item, selected, ignored, readOnly, onSelect, onIgnore }: {
  item: ImportPreviewRecord;
  selected: string;
  ignored: boolean;
  readOnly: boolean;
  onSelect: (value: string) => void;
  onIgnore: () => void;
}) {
  const [manualOpen, setManualOpen] = useState(false);
  const [manualSearch, setManualSearch] = useState(item.record.cardName);
  const languageOptions = recordDisplayLanguages(item.record);
  const unsupportedLanguage = !recordLanguageIsSupported(item.record);
  const visibleSelection = unsupportedLanguage ? "" : selected;
  const languageQuery = languageOptions.join(",");
  const searchQuery = useQuery({
    queryKey: ["collectr-card-search", manualSearch, languageQuery],
    queryFn: () => api<CardEntry[]>(`/collectr/cards/search?q=${encodeURIComponent(manualSearch)}&language=${encodeURIComponent(languageQuery)}`),
    enabled: !unsupportedLanguage && manualOpen && manualSearch.trim().length >= 2,
  });
  const candidates = unsupportedLanguage ? [] : [...new Map(
    [...item.candidates, ...(searchQuery.data ?? [])].map((candidate) => [candidate._id, candidate]),
  ).values()];
  return <div className="preview-row">
    <div className={`match-indicator ${visibleSelection || item.status === "matched" ? "matched" : item.status === "unmatched" ? "unmatched" : "review"}`}>{visibleSelection || item.status === "matched" ? <Check size={15} /> : item.status === "unmatched" ? <X size={15} /> : <CircleHelp size={15} />}</div>
    <div className="preview-record">
      <b>{item.record.cardName || item.record.productName}</b>
      <span>{item.record.setName || "Set not detected"} · {item.record.cardNumber || "No card number"} · {languageOptions.map((language) => language.toUpperCase()).join(" / ")}{unsupportedLanguage ? " · UNSUPPORTED LANGUAGE" : ""}</span>
      <small>{item.record.rarity || "Rarity not supplied"} · {item.record.quantity} copies · {item.record.condition} · {item.record.finish}</small>
      <small className={item.status === "unmatched" ? "search-error" : "match-confidence"}>{item.match?.explanation ?? item.reason ?? "Needs Review — confirm incomplete or uncertain details"}{item.match?.confidenceScore ? ` · ${item.match.confidenceScore}% confidence` : ""}</small>
      {unsupportedLanguage && <small className="search-error">This printing language is not supported and cannot be imported.</small>}
      {ignored && <small className="search-error">Marked not relevant by manual review.</small>}
      {visibleSelection && (item.selectedCard ?? item.candidates.find((candidate) => candidate._id === visibleSelection)) && <div className="candidate-card selected-candidate">
        <CandidateArtwork
          image={(item.selectedCard ?? item.candidates.find((candidate) => candidate._id === selected))!.image}
          name={(item.selectedCard ?? item.candidates.find((candidate) => candidate._id === selected))!.name}
        />
        <span><b>{(item.selectedCard ?? item.candidates.find((candidate) => candidate._id === selected))!.name}</b>
          <small>{(item.selectedCard ?? item.candidates.find((candidate) => candidate._id === selected))!.setName} · {(item.selectedCard ?? item.candidates.find((candidate) => candidate._id === selected))!.localId}</small>
          <small>{(item.selectedCard ?? item.candidates.find((candidate) => candidate._id === selected))!.rarity || "Rarity unavailable"} · {(item.selectedCard ?? item.candidates.find((candidate) => candidate._id === selected))!.language.toUpperCase()}</small>
          {(item.selectedCard ?? item.candidates.find((candidate) => candidate._id === selected))!.suggestionReason && <small>{(item.selectedCard ?? item.candidates.find((candidate) => candidate._id === selected))!.suggestionReason} · {(item.selectedCard ?? item.candidates.find((candidate) => candidate._id === selected))!.confidenceScore}% confidence</small>}
        </span>
      </div>}
      <details className="original-record"><summary>Original copied text</summary><pre>{item.record.originalText}</pre></details>
    </div>
    <div className="preview-match">
      {!readOnly && <select value={visibleSelection} disabled={unsupportedLanguage} onChange={(event) => onSelect(event.target.value)} aria-label={`Match for ${item.record.cardName}`}>
        <option value="">Leave out of import</option>
        {candidates.map((candidate) => <option key={candidate._id} value={candidate._id} disabled={candidate.eligibleForImport === false}>{candidate.name} · {candidate.setName} · {candidate.localId} · {candidate.language.toUpperCase()}{candidate.eligibleForImport === false ? " · Not importable" : ""}</option>)}
      </select>}
      {item.match && !visibleSelection && !unsupportedLanguage && !readOnly && <button className="manual-match-toggle" onClick={() => onSelect(item.match!.cardId)}>Select detected match</button>}
      {!readOnly && <button className="manual-match-toggle" onClick={onIgnore}>{ignored ? "Restore record" : "Mark not relevant"}</button>}
      {!readOnly && <button className="manual-match-toggle" disabled={unsupportedLanguage} onClick={() => setManualOpen((open) => !open)}>{manualOpen ? "Close card search" : "Search cards manually"}</button>}
      {item.candidates.length > 0 && <div className="candidate-list">{item.candidates.map((candidate) => <button className="candidate-card" key={candidate._id} onClick={() => onSelect(candidate._id)} disabled={readOnly || candidate.eligibleForImport === false}><CandidateArtwork image={candidate.image} name={candidate.name} /><span><b>{candidate.name}</b><small>{candidate.setName} · {candidate.localId}</small><small>{candidate.rarity || "Rarity unavailable"} · {candidate.language.toUpperCase()}</small>{candidate.suggestionReason && <small>{candidate.suggestionReason} · {candidate.confidenceScore}% confidence</small>}{candidate.eligibleForImport === false && <small className="search-error">{candidate.ineligibleReason ?? "This card is not eligible for Pokémon import."}</small>}</span></button>)}</div>}
      {manualOpen && !readOnly && <div className="manual-search">
        <input value={manualSearch} onChange={(event) => setManualSearch(event.target.value)} placeholder="Search name, set or card number" aria-label="Search all cards for manual match" />
        {searchQuery.isFetching && <small>Searching saved cards…</small>}
        {searchQuery.error && <small className="search-error">{searchQuery.error.message}</small>}
        {!searchQuery.isFetching && searchQuery.data?.length === 0 && <small>No saved cards matched this search.</small>}
        {searchQuery.data?.length ? <div className="candidate-list">{searchQuery.data.map((candidate) => <button className="candidate-card" key={candidate._id} onClick={() => onSelect(candidate._id)} disabled={candidate.eligibleForImport === false}><CandidateArtwork image={candidate.image} name={candidate.name} /><span><b>{candidate.name}</b><small>{candidate.setName} · {candidate.localId}</small><small>{candidate.rarity || "Rarity unavailable"} · {candidate.language.toUpperCase()}</small>{candidate.suggestionReason && <small>{candidate.suggestionReason} · {candidate.confidenceScore}% confidence</small>}{candidate.eligibleForImport === false && <small className="search-error">{candidate.ineligibleReason ?? "This card is not eligible for Pokémon import."}</small>}</span></button>)}</div> : null}
      </div>}
      {selected && <small className="match-confidence">Manual selection saved for this preview; collection unchanged.</small>}
    </div>
  </div>;
}

function SettingsPage() {
  const queryClient = useQueryClient();
  const [coverageLanguage, setCoverageLanguage] = useState("en");
  const [coverageSearch, setCoverageSearch] = useState("");
  const [coverageStatus, setCoverageStatus] = useState("incomplete");
  const { data, isLoading, error } = useQuery({
    queryKey: ["settings", "/settings"],
    queryFn: () => api<SettingsData>("/settings"),
    refetchInterval: (query) => query.state.data?.sync.status === "running" ? 3000 : false,
  });
  const coverageQuery = useQuery({
    queryKey: ["settings-catalog-coverage"],
    queryFn: () => api<CatalogCoverageData>("/settings/catalog-coverage"),
  });
  useEffect(() => {
    if (data?.sync.status === "completed" || data?.sync.status === "failed") {
      void coverageQuery.refetch();
    }
  }, [data?.sync.status]);
  const syncMutation = useMutation({
    mutationFn: () => api("/sync", { method: "POST" }),
    onSuccess: async () => { await queryClient.invalidateQueries(); },
  });
  const tcgDexSyncMutation = useMutation({
    mutationFn: () => api("/sync/tcgdex", { method: "POST" }),
    onSuccess: async () => { await queryClient.invalidateQueries(); },
  });
  const localizedSyncMutation = useMutation({
    mutationFn: (language: string) => api(`/sync/tcgdex/${encodeURIComponent(language)}`, { method: "POST" }),
    onSuccess: async () => { await queryClient.invalidateQueries(); },
  });
  const setSyncMutation = useMutation({
    mutationFn: ({ language, setId }: { language: string; setId: string }) => api(`/sync/tcgdex/${encodeURIComponent(language)}/sets/${encodeURIComponent(setId)}`, { method: "POST" }),
    onSuccess: async () => { await queryClient.invalidateQueries(); },
  });
  if (isLoading) return <section className="page"><Loading /></section>;
  if (error) return <section className="page"><ErrorState message={error.message} /></section>;
  if (!data) return null;
  const syncing = data.sync.status === "running" || syncMutation.isPending || tcgDexSyncMutation.isPending || localizedSyncMutation.isPending;
  const progressPercent = (processed: number, total: number) => total ? Math.min(100, Math.round(processed / total * 100)) : 0;
  const sourceLabel = (status: string) => status === "completed" ? "Synced" : status === "running" ? "Syncing…" : status === "failed" ? "Failed" : "Not synchronized";
  const coverageLanguages = Object.keys(coverageQuery.data?.byLanguage ?? {}).filter((language) => (DISPLAY_CARD_LANGUAGES as readonly string[]).includes(language)).sort();
  const languageCoverage = coverageQuery.data?.byLanguage[coverageLanguage];
  const filteredCoverageSets = (languageCoverage?.sets ?? []).filter((set: CatalogCoverageSet) =>
    (coverageStatus !== "incomplete" || set.status !== "FULL")
    && (coverageStatus === "all" || coverageStatus === "incomplete" || set.status === coverageStatus)
    && `${set.name} ${set.setId}`.toLocaleLowerCase().includes(coverageSearch.trim().toLocaleLowerCase()),
  );
  return <section className="page page-enter settings-page">
    <div className="page-heading"><div><p className="eyebrow">DATA AND PREFERENCES</p><h1>Settings</h1><p className="page-description">Manage data sources and review uncertain card classifications.</p></div></div>
    <div className="settings-card"><div className="settings-heading"><div><h2>Data sources</h2><p>External source data is synchronized into your MongoDB database.</p></div><div className="import-actions"><button className="secondary-button" onClick={() => tcgDexSyncMutation.mutate()} disabled={syncing}><RefreshCw size={15} className={syncing ? "spin" : ""} /> Sync TCGdex</button><button className="primary-button" onClick={() => syncMutation.mutate()} disabled={syncing}><RefreshCw size={15} className={syncing ? "spin" : ""} /> {syncing ? "Syncing…" : "Sync all"}</button></div></div>
      {syncMutation.error && <ErrorState message={syncMutation.error.message} />}
      {tcgDexSyncMutation.error && <ErrorState message={tcgDexSyncMutation.error.message} />}
      {localizedSyncMutation.error && <ErrorState message={localizedSyncMutation.error.message} />}
      <div className="source-list">
        <div><span className={`source-indicator ${data.sources.pokeApi === "completed" ? "on" : ""}`} /><span><b>PokeAPI</b><small>{sourceLabel(data.sources.pokeApi)}</small></span><span className="source-url">pokeapi.co</span></div>
        <div><span className={`source-indicator ${data.sources.tcgDex === "completed" ? "on" : ""}`} /><span><b>TCGdex</b><small>{sourceLabel(data.sources.tcgDex)}</small></span><span className="source-url">api.tcgdex.net</span></div>
        <div><span className={`source-indicator ${data.database.status === "connected" ? "on" : ""}`} /><span><b>MongoDB</b><small>{data.database.status} · {data.database.databaseName ?? "database unavailable"}</small></span><span className="source-url">source of truth</span></div>
      </div>
      <div className="locale-sync-panel">
        <div><h3>Additional TCGdex languages</h3><p>Each language uses a separate printing identity and resumable set checkpoints.</p></div>
        <div className="import-actions">{DISPLAY_CARD_LANGUAGES.filter((language) => language !== "en").map((language) => <button key={language} className="secondary-button" onClick={() => localizedSyncMutation.mutate(language)} disabled={syncing}><RefreshCw size={14} className={data.sync.localeProgress?.[language]?.status === "running" ? "spin" : ""} /> Sync {language.toUpperCase()}</button>)}</div>
        <div className="locale-counts">{Object.keys(data.counts.byLanguage.cards).filter((language) => (DISPLAY_CARD_LANGUAGES as readonly string[]).includes(language)).sort().map((language) => <span key={language}>{language.toUpperCase()}: {data.counts.byLanguage.sets[language] ?? 0} sets · {data.counts.byLanguage.cards[language] ?? 0} cards</span>)}</div>
        {Object.entries(data.sync.localeProgress ?? {}).filter(([language, progress]) => (DISPLAY_CARD_LANGUAGES as readonly string[]).includes(language) && (progress.status === "running" || progress.status === "failed" || (progress.sourceWarnings?.length ?? 0) > 0)).map(([language, progress]) => {
          const warnings = progress.sourceWarnings ?? [];
          const duplicateSetIds = warnings.filter((warning) => warning.includes("multiple sets")).length;
          const incompleteSetDetails = warnings.filter((warning) => warning.includes("cardCount.total=")).length;
          return <div className="locale-progress" key={language}>
            <span>{language.toUpperCase()} · {sourceLabel(progress.status)} · {progress.setsProcessed}/{progress.setsTotal} sets · {progress.cardsProcessed}/{progress.cardsTotal} cards</span>
            {progress.error && <small className="search-error">{progress.error}</small>}
            {warnings.length > 0 && <details>
              <summary className="search-error">{warnings.length} source warnings · {duplicateSetIds} duplicate set IDs · {incompleteSetDetails} incomplete set card lists</summary>
              <div>{warnings.map((warning) => <small className="search-error" key={warning}>{warning}</small>)}</div>
            </details>}
          </div>;
        })}
      </div>
      <div className="source-list">
        <div><span><b>Pokémon</b><small>{data.counts.pokemon.toLocaleString()} saved</small></span><span className="source-url">{data.sync.pokemonProcessed}/{data.sync.pokemonTotal} this sync · {sourceLabel(data.sync.pokemonStatus)}</span></div>
        <div><span><b>Sets</b><small>{data.counts.sets.toLocaleString()} saved</small></span><span className="source-url">{data.sync.setsProcessed}/{data.sync.setsTotal} this sync</span></div>
        <div><span><b>Cards</b><small>{data.counts.cards.toLocaleString()} saved · {data.counts.specialArtCards.toLocaleString()} special-art classified</small></span><span className="source-url">{data.sync.cardsProcessed.toLocaleString()}/{data.sync.cardsTotal.toLocaleString()} this sync · {sourceLabel(data.sync.tcgDexStatus)}</span></div>
      </div>
      {data.sync.status === "running" && <div className="sync-summary">
        <span>Pokémon progress · {progressPercent(data.sync.pokemonProcessed, data.sync.pokemonTotal)}%</span>
        <div className="progress-track"><span style={{ width: `${progressPercent(data.sync.pokemonProcessed, data.sync.pokemonTotal)}%` }} /></div>
        <span>TCGdex sets · {progressPercent(data.sync.setsProcessed, data.sync.setsTotal)}%</span>
        <div className="progress-track"><span style={{ width: `${progressPercent(data.sync.setsProcessed, data.sync.setsTotal)}%` }} /></div>
        <span>TCGdex cards · {progressPercent(data.sync.cardsProcessed, data.sync.cardsTotal)}%</span>
        <div className="progress-track"><span style={{ width: `${progressPercent(data.sync.cardsProcessed, data.sync.cardsTotal)}%` }} /></div>
        {data.sync.currentSetName && <span>Current Set · {data.sync.currentSetName} ({data.sync.currentSetId}) · {data.sync.currentSetLanguage?.toUpperCase()}</span>}
      </div>}
      <div className="sync-summary"><span>Last successful sync</span><b>{data.lastSyncAt ? new Date(data.lastSyncAt).toLocaleString() : "Never"}</b><span>Overall status: {data.sync.status}</span></div>
      {data.sync.error && <ErrorState message={data.sync.error} />}
    </div>
    <div className="settings-card catalog-coverage">
      <div className="settings-heading"><div><h2>TCGdex catalog coverage</h2><p>Coverage compares locally saved cards with TCGdex set counts and, after a Set sync, its exact card ID list.</p></div></div>
      {coverageQuery.isLoading && <Loading />}
      {coverageQuery.error && <ErrorState message={coverageQuery.error.message} />}
      {coverageQuery.data && <>
        <div className="coverage-filters">
          <select value={coverageLanguage} onChange={(event) => setCoverageLanguage(event.target.value)} aria-label="Coverage language">
            {coverageLanguages.map((language) => <option key={language} value={language}>{language.toUpperCase()}</option>)}
          </select>
          <select value={coverageStatus} onChange={(event) => setCoverageStatus(event.target.value)} aria-label="Filter sets by coverage status">
            <option value="incomplete">Needs sync or missing data</option><option value="PARTIAL">Partial</option><option value="MISSING_DATA">Missing data</option><option value="all">All sets</option>
          </select>
          <label className="filter-search"><Search size={15} /><input value={coverageSearch} onChange={(event) => setCoverageSearch(event.target.value)} placeholder="Filter sets" /></label>
        </div>
        {languageCoverage && <>
          <div className="coverage-summary">
            <span><b>{languageCoverage.setCount}</b> sets</span><span><b>{languageCoverage.cardCount.toLocaleString()}</b> saved cards</span>
            <span><b>{languageCoverage.fullSets}</b> full by count</span><span><b>{languageCoverage.partialSets}</b> partial</span>
            <span><b>{languageCoverage.setsMissingData}</b> missing data</span><span><b>{languageCoverage.setsWithoutCards}</b> with no cards</span>
            <span><b>{languageCoverage.missingVsTotal.toLocaleString()}</b> below TCGdex total</span>
            <span><b>{languageCoverage.cardsWithoutImages.toLocaleString()}</b> without image</span><span><b>{languageCoverage.cardsWithoutRarity.toLocaleString()}</b> without rarity</span>
            <span><b>{languageCoverage.duplicateSourceIdGroups}</b> duplicate card IDs</span><span><b>{languageCoverage.duplicateLocalIdGroups}</b> duplicate localIds</span>
            <span>Last sync: <b>{languageCoverage.lastSyncAt ? new Date(languageCoverage.lastSyncAt).toLocaleString() : "not recorded"}</b></span>
          </div>
          <div className="coverage-set-list">
            {filteredCoverageSets.slice(0, 50).map((set: CatalogCoverageSet) => <div className="coverage-set-row" key={`${set.language}:${set.setId}`}>
              <div><b>{set.name}</b><small>{set.setId} · {set.language.toUpperCase()} · {set.localCardCount}/{set.total ?? "?"} cards · official {set.official ?? "?"}</small>
                <small className={set.status === "FULL" ? "match-confidence" : "search-error"}>{set.status.replace("_", " ")} · {set.sourceListVerified ? "source card list checked" : "count-based; source card IDs not rechecked"}{set.issue ? ` · ${set.issue}` : ""}</small>
                {(set.missingCardNumbers.length > 0 || set.numericLocalIdGaps.length > 0) && <small>Missing card numbers: {[...set.missingCardNumbers, ...set.numericLocalIdGaps].slice(0, 12).join(", ")}</small>}
              </div>
              <button className="secondary-button" onClick={() => setSyncMutation.mutate({ language: set.language, setId: set.setId })} disabled={syncing || setSyncMutation.isPending}>Re-sync Set</button>
            </div>)}
            {filteredCoverageSets.length === 0 && <div className="inline-empty"><Check size={16} /> No sets match this coverage filter.</div>}
            {filteredCoverageSets.length > 50 && <small className="source-url">Showing 50 of {filteredCoverageSets.length}; filter by name or ID to find another set.</small>}
          </div>
        </>}
      </>}
      {setSyncMutation.error && <ErrorState message={setSyncMutation.error.message} />}
    </div>
    <ClassificationReviewPanel />
  </section>;
}

const REVIEW_REASON_LABELS: Record<ClassificationReviewReason, string> = {
  rarity_missing: "Rarity missing",
  rarity_ambiguous: "Rarity ambiguous",
  alternate_art_possible: "Alternate Art possible",
  full_art_possible: "Full Art possible",
  special_promo_possible: "Special Promo possible",
  metadata_missing: "Metadata missing",
  image_missing: "Image missing",
  source_insufficient: "Source does not prove art category",
};

function ClassificationReviewPanel() {
  const [view, setView] = useState<"gallery" | "queue">("gallery");
  return <div className="smart-review-workspace">
    <div className="visual-review-tabs" role="tablist" aria-label="Special Art review mode">
      <button role="tab" aria-selected={view === "gallery"} className={view === "gallery" ? "active" : ""} onClick={() => setView("gallery")}>Visual Gallery</button>
      <button role="tab" aria-selected={view === "queue"} className={view === "queue" ? "active" : ""} onClick={() => setView("queue")}>Evidence Queue</button>
    </div>
    {view === "gallery" ? <VisualSpecialArtReview /> : <ClassificationReviewQueue />}
  </div>;
}

function ClassificationReviewQueue() {
  const queryClient = useQueryClient();
  const [filters, setFilters] = useState({
    language: "", setId: "", setLanguage: "", rarity: "", category: "", pokemon: "", reason: "", image: "", state: "active", search: "", sort: "evidence",
  });
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(24);
  const summaryQuery = useApiQuery<ClassificationReviewSummary>("classification-review-summary", "/classification/review/summary");
  const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize), sort: filters.sort, state: filters.state });
  for (const key of ["language", "setId", "setLanguage", "rarity", "category", "pokemon", "reason", "image", "search"] as const) {
    if (filters[key]) params.set(key, filters[key]);
  }
  const reviewQuery = useApiQuery<ClassificationReviewPage>("classification-review", `/classification/review?${params.toString()}`);
  const actionMutation = useMutation({
    mutationFn: ({ cardId, action, classification }: { cardId: string; action: ClassificationReviewAction["action"]; classification?: string }) => api(`/classification/review/${cardId}/action`, {
      method: "POST",
      body: JSON.stringify({ action, ...(classification ? { classification } : {}) }),
    }),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["classification-review"] }),
        queryClient.invalidateQueries({ queryKey: ["classification-review-summary"] }),
        queryClient.invalidateQueries({ queryKey: ["settings"] }),
      ]);
    },
  });
  const summary = summaryQuery.data;
  const result = reviewQuery.data;
  const updateFilter = (key: keyof typeof filters, value: string) => {
    setFilters((current) => ({ ...current, [key]: value }));
    setPage(1);
  };
  const changePageSize = (value: number) => { setPageSize(value); setPage(1); };

  return <div className="settings-card smart-review-panel">
    <div className="settings-heading"><div><h2>Smart Special Art review <span className="count-dot">{summary?.activeCount.toLocaleString() ?? "…"}</span></h2>
      <p>Source metadata helps organize the queue. Only an explicit review action changes a card classification.</p></div>
      <div className="review-summary-metrics">
        <span><b>{summary?.total.toLocaleString() ?? "—"}</b> in review</span>
        <span><b>{summary?.imageUrlCount.toLocaleString() ?? "—"}</b> with image URL</span>
        <span><b>{summary?.completeMetadataCount.toLocaleString() ?? "—"}</b> complete metadata</span>
        <span><b>{summary?.skippedCount.toLocaleString() ?? "—"}</b> skipped</span>
      </div>
    </div>
    {summaryQuery.error && <ErrorState message={summaryQuery.error.message} />}
    {summary && <div className="review-reason-counts">
      {summary.options.reasons.map((reason) => <span key={reason} title="Reason groups can overlap">
        {REVIEW_REASON_LABELS[reason]} <b>{summary.reasonGroupCounts[reason].toLocaleString()}</b>
      </span>)}
    </div>}
    <div className="review-filter-grid">
      <label><span>Search</span><input value={filters.search} onChange={(event) => updateFilter("search", event.target.value)} placeholder="Name, set, number, source ID" /></label>
      <label><span>Language</span><select value={filters.language} onChange={(event) => {
        const language = event.target.value;
        setFilters((current) => ({ ...current, language, ...(language && current.setLanguage !== language ? { setId: "", setLanguage: "" } : {}) }));
        setPage(1);
      }}><option value="">All languages</option>{summary?.options.languages.filter((item) => (DISPLAY_CARD_LANGUAGES as readonly string[]).includes(item.value)).map((item) => <option key={item.value} value={item.value}>{item.value.toUpperCase()} · {item.count}</option>)}</select></label>
      <label><span>Set</span><select value={filters.setId ? `${filters.setLanguage}::${filters.setId}` : ""} onChange={(event) => {
        const [setLanguage, ...setIdParts] = event.target.value.split("::");
        setFilters((current) => ({ ...current, setLanguage: setIdParts.length ? setLanguage : "", setId: setIdParts.join("::") }));
        setPage(1);
      }}><option value="">All sets</option>{summary?.options.sets.filter((item) => !filters.language || item.language === filters.language).map((item) => <option key={`${item.language}:${item.setId}`} value={`${item.language}::${item.setId}`}>{item.setName} · {item.language.toUpperCase()} · {item.count}</option>)}</select></label>
      <label><span>Rarity</span><select value={filters.rarity} onChange={(event) => updateFilter("rarity", event.target.value)}><option value="">All rarities</option>{summary?.options.rarities.map((item) => <option key={item.value} value={item.value}>{item.value} · {item.count}</option>)}</select></label>
      <label><span>Category</span><select value={filters.category} onChange={(event) => updateFilter("category", event.target.value)}><option value="">All categories</option>{summary?.options.categories.map((item) => <option key={item.value} value={item.value}>{item.value} · {item.count}</option>)}</select></label>
      <label><span>Pokémon</span><select value={filters.pokemon} onChange={(event) => updateFilter("pokemon", event.target.value)}><option value="">All Pokémon</option>{summary?.options.pokemon.map((item) => <option key={item.nationalDex} value={item.nationalDex}>#{item.nationalDex} {item.name}</option>)}</select></label>
      <label><span>Review reason</span><select value={filters.reason} onChange={(event) => updateFilter("reason", event.target.value)}><option value="">All reasons</option>{summary?.options.reasons.map((reason) => <option key={reason} value={reason}>{REVIEW_REASON_LABELS[reason]}</option>)}</select></label>
      <label><span>Image</span><select value={filters.image} onChange={(event) => updateFilter("image", event.target.value)}><option value="">Any image status</option><option value="yes">Image URL available</option><option value="no">Missing image URL</option></select></label>
      <label><span>Queue</span><select value={filters.state} onChange={(event) => updateFilter("state", event.target.value)}><option value="active">Active · {summary?.activeCount ?? "—"}</option><option value="skipped">Skipped · {summary?.skippedCount ?? "—"}</option><option value="all">All remaining</option></select></label>
      <label><span>Sort by</span><select value={filters.sort} onChange={(event) => updateFilter("sort", event.target.value)}><option value="evidence">Most source evidence first</option><option value="confidence">Classifier confidence first</option><option value="completeness">Metadata completeness first</option></select></label>
    </div>
    {reviewQuery.error && <ErrorState message={reviewQuery.error.message} />}
    {reviewQuery.isLoading ? <Loading /> : !result?.items.length ? <div className="inline-empty"><Check size={16} /> No cards match these review filters.</div> : <>
      <div className="review-page-heading"><span>Showing {((result.pagination.page - 1) * result.pagination.pageSize + 1).toLocaleString()}–{Math.min(result.pagination.page * result.pagination.pageSize, result.pagination.total).toLocaleString()} of {result.pagination.total.toLocaleString()}</span>
        <label>Cards per page <select value={pageSize} onChange={(event) => changePageSize(Number(event.target.value))}><option value={12}>12</option><option value={24}>24</option><option value={48}>48</option><option value={100}>100</option></select></label>
      </div>
      <div className="review-cards">{result.items.map((card) => <ClassificationReviewCardRow key={card._id} card={card} pending={actionMutation.isPending} onAction={(action, classification) => actionMutation.mutate({ cardId: card._id, action, classification })} />)}</div>
      {result.pagination.pageCount > 1 && <nav className="review-pagination" aria-label="Review pages">
        <button className="secondary-button" disabled={page <= 1} onClick={() => setPage((value) => Math.max(1, value - 1))}>Previous</button>
        <span>Page {result.pagination.page} of {result.pagination.pageCount}</span>
        <button className="secondary-button" disabled={page >= result.pagination.pageCount} onClick={() => setPage((value) => Math.min(result.pagination.pageCount, value + 1))}>Next</button>
      </nav>}
    </>}
    {actionMutation.error && <ErrorState message={actionMutation.error.message} />}
    <small className="review-safety-note">No bulk decisions are available. Every classification change is stored as a manual override with a source evidence snapshot.</small>
  </div>;
}

function ClassificationReviewCardRow({ card, pending, onAction }: {
  card: ClassificationReviewItem;
  pending: boolean;
  onAction: (action: ClassificationReviewAction["action"], classification?: string) => void;
}) {
  const [classification, setClassification] = useState("");
  const [imageFailed, setImageFailed] = useState(false);
  const image = imageUrl(card.image);
  const actionLabels: Record<ClassificationReviewAction["action"], string> = {
    CONFIRM_SPECIAL_ART: "Confirm Special Art",
    MARK_NOT_SPECIAL_ART: "Mark as Not Special Art",
    KEEP_NEEDS_REVIEW: "Keep in Needs Review",
    SKIP: "Skip",
  };
  return <article className="review-card">
    <div className="review-artwork">{image && !imageFailed ? <img src={image} alt={`${card.name} card artwork`} onError={() => setImageFailed(true)} /> : <div className="review-art-missing"><Layers3 size={28} /><span>TCGdex image unavailable</span></div>}</div>
    <div className="review-card-content">
      <div className="review-card-title"><div><p className="eyebrow">{card.language.toUpperCase()} · {card.cardType}</p><h3>{card.name}</h3><p>{card.setName} · #{card.localId}</p></div>
        <strong className="review-confidence">Classifier confidence<b>{card.classificationConfidence}%</b></strong>
      </div>
      <div className="review-card-facts">
        <span><b>Set ID</b>{card.setId}</span><span><b>Number</b>{card.localId}</span><span><b>Language</b>{card.language.toUpperCase()}</span>
        <span><b>Rarity</b>{card.rarity || "Missing"}</span><span><b>Category</b>{card.category || "Missing"}</span><span><b>Artist</b>{card.artist || "Not provided"}</span>
      </div>
      <p className="review-classifier-reason">Current system note: {card.classificationReason || "No classification reason recorded."}</p>
      <div className="review-reason-tags">{card.reasonGroups.map((reason) => <span key={reason}>{REVIEW_REASON_LABELS[reason]}</span>)}</div>
      <div className="review-evidence-heading"><b>Source evidence</b><span>{card.evidenceCount} fields · metadata {card.metadataCompleteness.score}% ({card.metadataCompleteness.present}/{card.metadataCompleteness.total})</span>
        {card.sourceUrl && <a href={card.sourceUrl} target="_blank" rel="noreferrer">Open Source</a>}
      </div>
      {card.metadataCompleteness.missingFields.length > 0 && <small className="review-missing-fields">Missing metadata: {card.metadataCompleteness.missingFields.join(", ")}</small>}
      <details className="review-evidence-details"><summary>View verified fields and source timestamps</summary>
        <div className="review-evidence-grid">{card.evidence.map((field) => <div key={field.field}><b>{field.field}</b><span>{typeof field.value === "string" ? field.value : JSON.stringify(field.value)}</span><small>{field.source} · {field.confidence} · checked {field.checkedAt ? new Date(field.checkedAt).toLocaleString() : "date unavailable"}{field.sourceUpdatedAt ? ` · source updated ${new Date(field.sourceUpdatedAt).toLocaleDateString()}` : ""}</small>{field.note && <small>{field.note}</small>}</div>)}</div>
      </details>
      {card.reviewHistory.length > 0 && <details className="review-history-details"><summary>Review history · {card.reviewHistory.length}</summary><div>{card.reviewHistory.map((entry, index) => <small key={`${entry.createdAt}:${index}`}>{new Date(entry.createdAt).toLocaleString()} · {actionLabels[entry.action]}{entry.classification ? ` · ${entry.classification}` : ""}{entry.note ? ` · ${entry.note}` : ""}</small>)}</div></details>}
      <div className="review-card-actions">
        <label><span>Classification for confirmation</span><select value={classification} onChange={(event) => setClassification(event.target.value)}><option value="">Choose a classification…</option>{REVIEW_CLASSIFICATIONS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
        <button className="primary-button" disabled={pending || !classification} onClick={() => onAction("CONFIRM_SPECIAL_ART", classification)}>Confirm Special Art</button>
        <button className="review-decline-button" disabled={pending} onClick={() => onAction("MARK_NOT_SPECIAL_ART")}>Mark as Not Special Art</button>
        <button className="secondary-button" disabled={pending} onClick={() => onAction("KEEP_NEEDS_REVIEW")}>Keep in Needs Review</button>
        <button className="secondary-button" disabled={pending} onClick={() => onAction("SKIP")}>Skip</button>
      </div>
    </div>
  </article>;
}
