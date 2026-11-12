# Pokémon Collection

A local Pokémon Special Art card collection tracker. The project uses React/Vite, an Express API, and MongoDB/Mongoose.

## Requirements

- Node.js 20+
- MongoDB (local or Atlas)
- `curl` for the network fallback used if Node's HTTP client cannot reach a source API

## Setup

1. Copy `.env.example` to `.env`. The local default is `MONGODB_URI=mongodb://127.0.0.1:27017/Pokedex`.
2. Ensure MongoDB is running and `Pokedex` is the database name. The server validates the target database and reports the connected name.
3. Install dependencies with `npm install`.
4. Start the client and API with `npm run dev`.
5. In Settings, run **Sync all** once. This loads National Pokédex Pokémon 1–1,025 from PokeAPI and English sets/cards from TCGdex. For other TCGdex languages, use the separate language buttons; these syncs do not re-fetch PokeAPI or overwrite another language. Interrupted language syncs resume from language-specific set checkpoints.

The client runs at `http://localhost:5173`; the API runs at `http://localhost:5000`.

The database is the source of truth. Mongoose stores application data in explicitly named collections in `Pokedex`: `pokemons`, `sets`, `cards`, `pokemoncards`, `collectionitems`, `importhistories`, `cardclassificationoverrides`, `usersettings`, and `syncstatuses`. Collections other than `pokemons` are created when first written; no existing data is dropped or replaced.

Sync requests are retried with exponential backoff and low concurrency. Pokémon are saved in batches; TCGdex cards are saved set-by-set with per-set resume checkpoints. Repeated syncs use source IDs and upserts to update records rather than duplicate them. The app does not ship with fabricated sample cards or Pokémon.

TCGdex supports locale identifiers including `ja`, `zh-cn`, `zh-tw`, `ko`, `fr`, `de`, `it`, `es`, `es-mx`, `pt`, `pt-br`, `pt-pt`, `id`, `th`, `nl`, `pl`, and `ru`. The API accepts `POST /api/sync/tcgdex/:language`; Settings offers the Japanese, Simplified Chinese, Traditional Chinese, and Korean sync buttons. Cards and sets use a unique `(language, sourceId)` identity, with source image URLs and original localized names retained. Cross-language set aliases are only considered when TCGdex provides the same exact set source ID.

Verified local counts on 2026-11-10: English 221 sets/23,912 cards; Japanese 202/13,156; Simplified Chinese 56/877; Traditional Chinese 98/7,436; Korean 95/239. These are records returned by TCGdex set-detail card lists, not estimates or fabricated totals. The source lists 204 Japanese, 57 Simplified Chinese, 98 Traditional Chinese, and 95 Korean sets, but has duplicate Japanese/Simplified Chinese IDs and many detail responses whose card lists are empty despite non-zero `cardCount.total`. Settings records these source warnings. Consequently, localized sync execution completed, but source coverage is incomplete; the app does not invent the missing cards. English set metadata also reports 24,140 cards in aggregate versus 23,912 detail-list records saved.

Collectr Preview uses card name, set name, card number, and rarity when supplied. Explicit language is never relaxed, missing language is not treated as English, and a unique verified match is displayed with its confidence/explanation. Multiple matches require a manual choice. Preview records and review decisions remain separate from the collection until the user explicitly confirms an import. Import History opens saved previews read-only, supports a separate re-preview from the stored original text, and requires confirmation before Rollback.

My Collection and Missing Cards expose filters for Pokémon, generation/type, set, language, category, and search, with filter options read from the full MongoDB catalog and filter settings saved in `usersettings`. Sorting includes name, card number, Pokédex number, Pokémon progress, card count, and set. The Dashboard breakdowns are computed from MongoDB card and Pokémon links.

The saved 744-record Collectr text was previewed again after localized sync. Results: 268 matched, 1 needs review, 475 unmatched, and 1 input line filtered. All 268 prior matches remained on the same card IDs and passed identity checks; Deerling 091/086 still maps to `sv10.5w-091`. No Collectr rows were committed. Unmatched records remain unresolved where source set names cannot be verified or TCGdex does not expose the corresponding records.

## Trainer Hub interface

The responsive React client uses a Pokémon Trainer Hub design across the Pokédex, Pokémon details, Dashboard, Collection, Missing Cards, Collectr Import, and Settings screens. It includes type-colored Pokémon cards and filters, live collection metrics, card previews, collection grid/list layouts, and compact mobile navigation. Dark mode is available in the top bar and saved in the local user preferences in MongoDB.
