# Feed v2 — Signal Density (allowlist, tickers, 8-K items)

**Date:** 2026-08-26
**Status:** Approved
**Builds on:** 2026-08-24-public-market-feed-design.md (v1, merged as #99)

## Goal

Turn `/feed` from a raw EDGAR firehose into a material-events feed:
serve only high-signal form types, show tickers instead of bare company
names, and badge 8-Ks with their item codes. Community sanity check
(2026-08-26, Reddit/fintwit/practitioner tooling survey) confirmed the
shape: item classification is table-stakes for filing monitors,
chronological badged lists are the standard presentation, and dropping
unparsed Form 4s is the practitioner-endorsed choice.

## Decisions made

- **Form allowlist (server-side):** `8-K`, `8-K/A`, `SC 13D`,
  `SC 13D/A`, `S-3`, `S-3/A`, `424B5`, `NT 10-K`, `NT 10-Q`, `25`,
  `25-NSE`. 424B5 added on research: an S-3 is dilution *capacity*; the
  424B5 pricing takedown is the trigger short-sellers actually monitor.
  424B2/424B3 stay excluded (structured-note/resale flood). **Form 4 is
  deliberately absent** until v3 direction parsing — raw Form 4 streams
  mix 10b5-1 sells and option exercises with real buys and are treated
  as misleading by every practitioner source.
- **Item codes via per-filing fetch, capped:** up to the 15 newest 8-Ks
  per poll, concurrency 3, from each filing's own `-index.htm` (already
  in the event URL — a documented Archives surface). No full-text-search
  API dependency.
- **Ticker join via `company_tickers.json`:** SEC's documented mapping
  file, cached hard (edge 24h + in-isolate memo).
- **Chronological presentation, no scoring:** ranking/scoring stays in
  the Python pipeline per CLAUDE.md; the page gets badges, not scores.

## Components

### 1. `src/lib/feed/forms.ts` — editorial signal config (pure, new)

Deliberately separate from `sources.ts`: the allowlist is signal
curation, not the licensing boundary, so it lives in the guard's normal
auto-merge zone.

```ts
const FORM_ALLOWLIST: readonly string[];       // exact list above
function isAllowlisted(form: string): boolean; // exact match after trim
interface ItemDef { code: string; label: string; hot: boolean }
const ITEM_DEFS: readonly ItemDef[];
function classifyItem(code: string): ItemDef | undefined;
```

Hot items: `4.02` non-reliance/restatement, `1.03` bankruptcy,
`5.02` executive change, `1.01` material agreement, `1.02` agreement
terminated, `2.01` acquisition/disposition closed. Routine: `2.02`
earnings (EDGAR is never first — goes out with the wire), `7.01` Reg FD,
`8.01` other events, `9.01` exhibits, plus any unrecognized code.

**Documented limitation:** item 8.01 is the catch-all where material
news gets buried precisely because it looks routine; code-level
classification cannot catch that. Text-level analysis is a future
enrichment, not v2.

### 2. CIK extraction — extend `parseEdgarAtom`

`FeedEvent` gains `cik: string` — the 10-digit CIK captured from the
entry title's parenthetical (e.g. `(0000123456)`) before the existing
company-name stripping discards it. If no CIK parenthetical is present
the entry keeps `cik: ''` and is otherwise unaffected. Fixture and
tests updated to assert the captured CIKs.

### 3. `src/lib/feed/tickers.ts` — CIK→ticker map (new)

```ts
const TICKER_URL = 'https://www.sec.gov/files/company_tickers.json';
async function fetchTickerMap(fetchImpl?: typeof fetch): Promise<Map<string, string>>;
```

- One GET with the mandatory `User-Agent` (same constant as edgar.ts)
  and `cf: { cacheTtl: 86400, cacheEverything: true }` — one EDGAR hit
  per colo per day for a ~1MB file.
- Response shape: `{ "0": { cik_str: 320193, ticker: "AAPL", title: … }, … }`.
  Keys of the returned Map are 10-digit zero-padded CIK strings to match
  `FeedEvent.cik`.
- Module-level memo `{ map, fetchedAt }` with a 1-hour in-isolate TTL so
  the 1MB parse doesn't run on every poll.
- **Any failure returns an empty Map** (and clears nothing): the feed
  degrades to company names, never errors.

### 4. `src/lib/feed/items.ts` — 8-K item enrichment (new)

```ts
const ITEM_FETCH_CAP = 15;      // newest 8-Ks enriched per poll
const ITEM_CONCURRENCY = 3;     // parallel index-page fetches
function parseItemCodes(html: string): string[];   // pure
async function enrichWithItems(events: FeedEvent[], fetchImpl?: typeof fetch): Promise<Map<string, string[]>>;
// returned Map is keyed by event.id; events not selected for enrichment are absent
```

- `parseItemCodes`: regex `Item\s+(\d+\.\d{2})` over the index-page
  HTML, deduplicated, document order preserved.
- `enrichWithItems`: takes the already-filtered, already-sorted events;
  selects the first `ITEM_FETCH_CAP` whose form starts with `8-K`;
  fetches each `event.url` (the `-index.htm` page) with the mandatory
  User-Agent and `cf: { cacheTtl: 86400, cacheEverything: true }`
  (accession URLs are immutable); concurrency limited to
  `ITEM_CONCURRENCY` via a simple worker-pool loop (no dependency).
- Rate math: worst-case cold poll = 15 fetches at concurrency 3, well
  under EDGAR's 10 req/s; after warmup only new filings miss the cache.
  Worst-case subrequests per endpoint hit: 1 getcurrent + 15 index
  pages + 1 ticker map = 17, under the Workers 50-subrequest cap.
- **Per-filing failure → that filing gets `[]`** (no badge); the
  response never fails because enrichment failed.

### 5. Composer — `events.ts` pipeline and API shape

Pipeline: fetch getcurrent → parse → **allowlist filter**
(`isAllowlisted`) → sort newest-first → **ticker join**
(`ticker: string \| null` from the map; null when absent — 13D filers,
funds, and missing CIKs stay null) → **item enrichment**
(`items: string[]`, always `[]` for non-8-Ks) → respond.

Ticker map and item enrichment run concurrently after the filter.
Response shape is additive: each event gains `ticker` and `items`;
`{ events, asOf }` envelope and both Cache-Control headers are
byte-identical to v1. A getcurrent failure is still the only 502 path.

### 6. Page — `render.ts` + `feed.astro`

Row: time · form badge · item-code badges (hot codes styled with
`--color-accent`, routine muted) · ticker in the mono font (omitted when
null) · company name → filing link. Every new field goes through
`escapeHtml`. `ItemDef.label` renders as the badge's `title` attribute
(hover tooltip). Page intro copy becomes: "Material filings only —
8-Ks with item codes, activist stakes, shelf registrations and priced
offerings, late filings, delistings." Poll cadence and stale handling
unchanged.

## Testing

- `forms.test.ts`: allowlist membership (including 424B5 in, 424B2 and
  4 out), hot/routine classification, unknown-code fallback.
- `edgar.test.ts` (+fixture): CIK captured for both fixture entries;
  entry without a CIK parenthetical yields `cik: ''` without breaking
  company parsing.
- `tickers.test.ts`: parse of the real JSON shape (small inline
  fixture), zero-padding of keys, memo hit (second call, no second
  fetch), failure → empty Map.
- `items.test.ts`: `parseItemCodes` against a real index-page HTML
  snippet (multi-item 8-K), dedup, no-match → `[]`; `enrichWithItems`
  cap (16 8-Ks in → 15 fetches), concurrency bound (peak in-flight ≤ 3,
  observable via the injected fetch), per-filing failure isolation.
- `events.test.ts`: filter drops non-allowlisted forms from the
  fixture, ticker join and items land on the response, headers
  byte-identical, 502 path unchanged.
- `render.test.ts`: hot vs routine badge classes, ticker row, hostile
  item/ticker content escaped.
- Full suite, `astro check`, `npm run build`, `wrangler deploy
  --dry-run` stay green.

## Out of scope (validated as later work by the research pass)

- Form 4 cluster-buy signals (v3: per-filing XML, transaction code P,
  role and 10b5-1 filtering — needs the events DB).
- 13G→13D conversion detection (needs filing history — events DB).
- Form 144 discretionary-sale flagging (needs 10b5-1 discrimination).
- 8.01 text-level materiality analysis.
- Market-cap context and any scoring on the page (Python pipeline).
- After-hours/Friday timing signals (session-timing scoring, Python).

## Amendment (2026-08-27, live verification)

Live `getcurrent` Atom feed emits the category term as `SCHEDULE 13D` /
`SCHEDULE 13D/A`, not `SC 13D` / `SC 13D/A` as originally assumed. Both
spellings are now allowlisted in `FORM_ALLOWLIST`; the SC-prefixed forms
are kept as defensive aliases since EDGAR uses that label on other
surfaces (e.g. `type=` filtering elsewhere).
