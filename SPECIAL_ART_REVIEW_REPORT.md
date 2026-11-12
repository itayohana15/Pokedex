# Smart Special Art Review — audit report

**Run:** 2026-11-11 12:09:30 UTC  
**Database:** `Pokedex`  
**Mode:** read-only analysis of every card currently in `NEEDS_REVIEW`

## Data safety snapshot

| Measure | Before/after audit |
|---|---:|
| Cards in database | 45,620 |
| Cards analyzed in `NEEDS_REVIEW` | 12,373 |
| PokemonCard relations | 36,722 |
| CollectionItems | 1 |
| CardClassificationOverride records | 0 |
| CardReviewAction records | 0 |

No card classification, CollectionItem, or Pokémon relation was changed by the audit. The 12,373 cards remain in `NEEDS_REVIEW`. The source report used saved TCGdex records; it did not refresh every card over the network.

## Review reasons

Primary reasons partition the queue. Additional flags overlap and must not be added to the primary counts.

| Primary reason | Cards |
|---|---:|
| Rarity missing, `None`, or `Unknown` | 6,010 |
| Rarity ambiguous | 5,022 |
| Promo candidate | 1,341 |
| Explicit Alternate Art source label | 0 |
| Explicit Full Art source label | 0 |
| **Total** | **12,373** |

Overlapping flags:

| Flag | Cards | Interpretation |
|---|---:|---|
| Metadata missing | 6,010 | Same records as missing/unknown rarity in this dataset |
| Image URL missing | 5,941 | URL check only; URLs present were not all fetched to verify they load |
| Source insufficient to establish art classification | 12,373 | TCGdex identity and rarity fields do not establish Special Art eligibility |
| Promo candidate | 1,341 | Promo rarity/variant is a review cue, not proof of Special Art |

The primary groups sum to 12,373. `source_insufficient` is a cross-cutting warning. Generic rarities such as Ultra Rare and Secret Rare remain ambiguous; they do not imply Full Art or Alternate Art.

## Evidence coverage

- **Image URL present:** 6,432; missing: 5,941.
- **Complete metadata:** 6,363 have all eight fields: card name, Set ID, Set name, local ID, language, category, rarity, and source ID. Another 6,010 lack at least one required field, principally rarity.
- **Languages:** en 5,670; ja 3,254; zh-cn 202; zh-tw 3,194; ko 53.
- **Category:** all 12,373 are Pokémon according to stored source category.
- **Sets:** 322 distinct Set/language groups.
- **Stored classifier confidence:** average 10/100. This is the existing conservative classifier score, not confidence that a card is Special Art.

The reason calculation prefers source fields when a normalized field is absent. A valid stored image URL is not confirmation that the CDN image loads. Review evidence marks each field `direct-source-field`; this describes the field's origin, not art-classification confidence.

## Sources checked

- **TCGdex** is the direct source saved for these card identities. Card records expose identity and metadata including name, Set, local ID, category, rarity, image, artist, variants, and Pokédex IDs. The Review UI links to the language-scoped card record, shows its source ID, and includes saved sync/source-update timestamps. See [TCGdex Card reference](https://tcgdex.dev/reference/card).
- **Official Pokémon TCG database** can support a person checking card details and artwork. No verified crosswalk from its results to each TCGdex source ID was established, so it is not fed into automated decisions. See [Pokémon's database guide](https://support.pokemon.com/hc/en-us/articles/360001025274-How-do-I-use-the-Trading-Card-Game-database).
- **Pokémon TCG API** documentation labels the API deprecated; it was not integrated as decision evidence. See [API card search documentation](https://docs.pokemontcg.io/api-reference/cards/search-cards/).

No source found in this audit provides a reliable automated Alternate Art / Full Art classification for these 12,373 records. Manual artwork review remains necessary.

## Review system delivered

- Settings now has a server-paginated review queue (page sizes up to 100), filtered by language, Set and Set language, rarity, category, Pokémon, review reason, image presence, queue state, and text search.
- Sorting options put the highest source evidence count, classifier confidence, or metadata completeness first.
- Each card shows a large TCGdex image when available, exact printing identity, review reasons, current classifier confidence, metadata completeness, source fields/timestamps, and review history.
- Explicit actions: Confirm Special Art (requires selected classification and Pokémon category evidence), Mark as Not Special Art, Keep in Needs Review, and Skip. Skip is persisted and can be shown again. There is no bulk action.
- Classification changes store `CardClassificationOverride` and an evidence snapshot in `CardReviewAction`. Keep and Skip only log the action and leave the card in `NEEDS_REVIEW`. TCGdex sync checks manual overrides before automatic classification.

## Backup and verification

- Backup archive created before adding the review action model/index: `/tmp/pokedex-before-smart-special-review-2026-11-11.archive.gz`.
- `mongorestore --archive=... --gzip --dryRun`: passed before changes were applied.
- `npm test`: 100 tests passed across 7 files.
- `npm run build`: server and client passed.
- `npm audit --audit-level=high`: 0 vulnerabilities.
- `npm run audit:classification-review`: read-only; analyzed 12,373 cards and reported 0 review actions and 0 classification overrides.

The review system is ready for human use, but the catalog is not complete: **12,373 cards still require identity/artwork review, and 5,941 have no image URL.**

## Promo Special Art dry run — 2026-11-11 12:59 UTC

**Scope:** read-only review of all 1,341 cards returned by the saved `special_promo_possible` queue. No card classification or override was written. No CollectionItem or PokemonCard relation was changed.

### Dry-run decision counts

| Outcome | Cards | Basis |
|---|---:|---|
| Verified Pokémon Promo Special Art | 0 | No card-level source label or verified crosswalk confirms Special Art for a TCGdex source ID. |
| Verified ordinary Pokémon Promo, safe to reject | 0 | TCGdex's Promo rarity and an ordinary-looking art thumbnail do not establish that the printing is not an alternate/special release. |
| Remains `NEEDS_REVIEW` | **1,341** | More reliable printing-level art evidence is required before either decision. |

These are dry-run buckets, not database actions. The existing 1,341 cards remain in `NEEDS_REVIEW`; no `CardClassificationOverride` was created or changed.

### Candidate and evidence coverage

All 1,341 records have a TCGdex source ID and URL, card name, Set ID/name, local ID, language, Pokémon category/card type, and `rarity=Promo`. There are no Trainer or Energy cards in this candidate group. The 847 valid TCGdex image URLs were fetched successfully and their artwork was visually reviewed. The other 494 records have no image URL and remain unresolved.

| Language | Candidates |
|---|---:|
| English (`en`) | 1,081 |
| Japanese (`ja`) | 213 |
| Traditional Chinese (`zh-tw`) | 47 |
| **Total** | **1,341** |

| Language | Set ID | Set name | Candidates |
|---|---|---|---:|
| en | `xyp` | XY Black Star Promos | 194 |
| en | `svp` | SVP Black Star Promos | 216 |
| en | `swshp` | SWSH Black Star Promos | 293 |
| en | `smp` | SM Black Star Promos | 244 |
| en | `hgssp` | HGSS Black Star Promos | 24 |
| en | `mep` | MEP Black Star Promos | 109 |
| en | `miscp` | Miscellaneous Promos | 1 |
| ja | `SV-P` | スカーレット&バイオレット プロモカード | 143 |
| ja | `M-P` | メガ プロモカード | 70 |
| zh-tw | `SV-P` | 特典卡 朱&紫 | 47 |

TCGdex verified identity fields and supplied the real images for records with URLs, but it did not return an Alternate Art, Illustration, Full Art, or Special Art Promo label for this group. No other source was matched to all 1,341 printings by exact identity. The official Pokémon TCG database may help with a person's visual check, but no source-ID crosswalk was established for these candidates. See the [TCGdex Card reference](https://tcgdex.dev/reference/card) and [official Pokémon database guide](https://support.pokemon.com/hc/en-us/articles/360001025274-How-do-I-use-the-Trading-Card-Game-database).

Some of the available artwork appears visually distinctive, but the card image alone does not reliably separate special/alternate promos from regular Promo printings at this scale. A Promo rarity, V/ex label, set membership, or image presence is not sufficient evidence for an automatic decision. The full candidate manifest, fetched images, and contact sheets were generated under `/tmp/promo-dryrun-candidates.json` and `/tmp/promo-art-review/`; these temporary review artifacts are not application data.

### Language display restriction

The application/API display allowlist is now `en`, `ja`, `zh-cn`, and `zh-tw`. Queries and settings/coverage/review summaries filter to these languages. Collectr marks other languages unsupported, returns no manual candidates, and rejects manual selection/commit. MongoDB cards, sets, relations, and CollectionItems in unsupported languages are preserved; no sync was run.

Saved filter preferences that reference a hidden language are returned to the UI with that language cleared, while the stored `UserSettings` document remains unchanged. New preference updates only persist an allowed language or an empty value.

## Verification for this update

- `npm run build`: passed after the language-filter implementation.
- `npm test`: **101 tests passed across 7 files**, including API language filtering, unsupported Collectr rejection, and preservation of hidden-language database records.
- Integration coverage also verifies that a CollectionItem with a language different from its linked Card does not appear in Collection or count as an owned printing; both records remain unchanged.
- Integration coverage verifies hidden-language saved preferences are sanitized in the API response without altering their stored MongoDB values.
- `npm run build`: server TypeScript and client production build passed.
- `npm audit --audit-level=high`: **0 vulnerabilities**.
- Live read-only smoke: `/api/health` connected to `Pokedex`; `/api/settings` exposed 45,381 Cards and 577 Sets for allowed languages; Review summary exposed 12,320 records and only approved-language options; catalog coverage contained only `en`, `ja`, `zh-cn`, `zh-tw`. No write request was made.

## Visual Promo Review rollout — 2026-11-12

### Live read-only status

`GET /api/classification/review/visual/summary` was called against the existing `Pokedex` database. It returned 1,341 Pokémon Promo candidates, 847 TCGdex image URLs, 494 missing TCGdex image URLs, 0 reviewed, 0 Confirmed, 0 Rejected and 1,341 Undecided. Language counts are en 1,081, ja 213 and zh-tw 47. The API's supported-language options contain no ko. No POST/action was sent to the production database; no Card image, classification, override, CollectionItem, or PokemonCard relation was written by this work.

### Alternative image source matches

The source search was limited to exact identity matches using TCGdex source ID plus card name, language, set ID and local ID; artist was additionally checked when available. This is a source-discovery pass, not evidence that any card is Special Art. Four exact image references were found among the 494 missing-image records:

| Candidate | Identity checked | Source/type | Confidence and notes |
|---|---|---|---|
| `SV-P-200` — Nのゾロア | Japanese; Scarlet & Violet Promo; 200/SV-P; illustrator Jiro Sasumo | [Pokémon Japan official card detail](https://www.pokemon-card.com/card-search/details.php/card/47165); [official image](https://www.pokemon-card.com/assets/images/card_images/large/SV-P/047165_P_NNOZOROA.jpg) | 100; official detail exposes the same name, number and illustrator. |
| `mep-003` — Alakazam | English; MEP Black Star Promos; 003 | [TCG Promos card page](https://tcgpromos.com/cards/pokemon-mep-003); [owner-provided image](https://tcgpromos.com/media/20261016-gen34/alakazam-mep-003-owner.webp) | 95; source labels its image owner-provided and identifies English/MEP 003. Community source, not an official Pokémon source. |
| `mep-009` — Alakazam - Holo | English; MEP Black Star Promos; 009 | [TCG Promos card page](https://tcgpromos.com/cards/pokemon-mep-009); [owner-provided image](https://tcgpromos.com/media/20261016-gen34/alakazam-mep-009-holo-owner.webp) | 95; page identifies English MEP 009 and provides an owner-provided image. The web image crawler returned a cache miss for the direct image URL during this check; the source page remains available and the UI shows a load-failure placeholder if the image cannot be fetched. |
| `mep-094` — Alolan Exeggutor | English; MEP Black Star Promos; 094 | [TCG Promos card page](https://tcgpromos.com/cards/pokemon-mep-094); [owner-provided image](https://tcgpromos.com/media/20261016-gen34/mep-094-owner.webp) | 95; source labels the image as provided by TCGPromos and identifies English/MEP 094. Community source, not an official Pokémon source. |

The image candidates store source page, direct image URL, source ID, check date (`2026-11-12`), confidence, matched identity fields and attribution. The gallery labels official versus community and lets the user open the source page. It does not download the files or write the external URL into `Card.image`. The PTCG Image Atlas helped locate possible source sites, but the Atlas describes its source checks as AI research notes that are not hand-verified; it was used as a lead list, not as proof of a card match ([Atlas](https://nstrelow.github.io/ptcg-image-atlas/), [source data](https://github.com/nstrelow/ptcg-image-atlas/blob/main/data.json)). Three linked community pages state that they are independent and not affiliated with Pokémon; no license is claimed for their scans. The sources can supply printing artwork, but they do not classify those four cards as Special Art.

The remaining 490 candidates had no exact alternate source linked in this limited pass. This does not establish that no image exists elsewhere. Japanese and Traditional Chinese official card search pages, TCGPromos and the Atlas source list are available from each card detail view for manual checking. No Simplified Chinese candidates are in this 494-record subset.

### Delivered interface and safeguards

- Settings now defaults to a `Visual Gallery` tab and preserves the prior evidence queue under its own tab. Gallery pagination is server-side (up to 100, default 36); card images use lazy loading. Small/Medium/Large, Zoom, previous/next, two-card comparison, review-this-Set sequence, the four allowed language filters, Set, Pokémon, rarity, image status, review status, decision and sort controls are available.
- Each card shows name, language, Set, number, rarity and status. Missing-image cards get a clear placeholder and exact card/source lookup links. When a verified external image exists, it is shown with its true source label and attribution.
- A/D/S, arrow and Z shortcuts are implemented. Confirm requires the user to pick an existing artwork category; no action is preselected. Each decision is an explicit request and append-only `CardReviewAction` stores actor/source, timestamp, note and evidence. Confirm/Reject/Keep update `CardClassificationOverride`; Keep records `NEEDS_REVIEW`, so a later sync respects that explicit undecided choice. Reopening a decision appends a new action and retains the prior history. There is no bulk decision action.
- Gallery summary/query/action validation is scoped to Pokémon Promo cards and `en`, `ja`, `zh-cn`, `zh-tw`. Non-Pokémon Promo records, unsupported languages and unverified image candidate IDs are rejected. Card source image fields are not updated.
- A MongoDB archive was made before extending the override enum and verified with `mongorestore --archive=... --gzip --dryRun`: `/tmp/pokedex-before-visual-special-review-2026-11-12.archive.gz`. No destructive migration was run.

### Verification

- `npm test`: **106 tests passed across 8 files**, including API pagination/filtering/language scope, explicit confirm/reject/keep, correction history, override values, missing-image candidates, exact/multiple image source matching, keyboard mapping and unchanged CollectionItem/PokemonCard records in the disposable integration database.
- `npm run build`: passed for server TypeScript and client production bundle.
- `npm audit --audit-level=high`: **0 vulnerabilities**.
- Live read-only API summary returned the 1,341/847/494 counts above; the local Vite Settings route returned HTTP 200. An interactive rendered browser check could not be completed: the installed Chrome/Snap runtime failed on missing `GLIBCXX_3.4.29` (and the headless retry exited abnormally). Do not treat a manual browser/console check as completed.

All 1,341 Promo cards remain unreviewed in the live database. The catalog is not complete, and no Special Art decision was made automatically.
