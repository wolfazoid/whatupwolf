# Public Market Feed v1 — EDGAR-direct

**Date:** 2026-08-24
**Status:** Approved

## Goal

Ship the public read surface of the market feed: a `/feed` page and a
`/api/events` endpoint backed directly by EDGAR, with the public/private
source gate (`src/lib/feed/sources.ts`) real from day one. No database,
no Python ingest — those are later projects; the endpoint swaps its
backing when they land.

## Decisions made

- **V1 data source:** EDGAR-direct from the endpoint. No Postgres
  dependency (the Cloudflare host cannot reach the home box anyway).
- **Deploy shape:** one site. Add `@astrojs/cloudflare`; every existing
  page stays prerendered static, only `/api/events` renders on demand.
- **V1 sources:** EDGAR only fetches. The registry still defines
  exchange halts, federal releases, and Benzinga (private) as disabled
  entries so the licensing boundary and gate logic exist now.
- **Page scope:** plain chronological list. No filters, no scores —
  scoring stays in the Python pipeline per CLAUDE.md.
- **Caching:** edge cache headers (`s-maxage` + `stale-while-revalidate`),
  no Cache API code, no KV.

## Components

### 1. `src/lib/feed/sources.ts` — registry and gate (pure)

```ts
type SourceTier = 'public' | 'private';
interface SourceDef {
  id: string;        // 'edgar' | 'exchange-halts' | 'fed-releases' | 'benzinga'
  tier: SourceTier;
  label: string;
  enabled: boolean;  // v1: only edgar is true
}
function servableSources(publicFeedEnv: string | undefined): SourceDef[];
```

Gate semantics (fail closed, per CLAUDE.md): private-tier sources are
included **only** when the `PUBLIC_FEED` env var is exactly the string
`'false'` (the tailnet build). Missing, empty, malformed, `'true'`,
or any other value → public tier only. Disabled sources are never
returned regardless of tier.

### 2. `src/lib/feed/edgar.ts` — EDGAR client

- `parseEdgarAtom(xml: string): FeedEvent[]` — pure, hand-rolled parse
  of EDGAR's `getcurrent` Atom feed (Workers have no DOMParser).
  Tolerant: a malformed entry is skipped, never thrown on.
- `FeedEvent`: `{ id, source, form, company, filedAt, url }`.
  `id` is the accession-derived identity from the entry; `filedAt` is
  the entry's `updated` timestamp, ISO-8601.
- `fetchEdgarEvents(fetchImpl = fetch): Promise<FeedEvent[]>` — one GET:
  `https://www.sec.gov/cgi-bin/browse-edgar?action=getcurrent&output=atom&count=100`
  with header `User-Agent: whatupwolf.com wolf@wearefeasting.com`
  (mandatory per EDGAR policy). Throws on non-200.

### 3. `src/pages/api/events.ts` — endpoint

- `export const prerender = false`; GET only.
- Reads `PUBLIC_FEED` from the runtime env, resolves `servableSources`,
  fetches every servable source that has a fetcher (v1: edgar), merges
  newest-first.
- Success: `200 { events, asOf }` with
  `Cache-Control: public, max-age=15, s-maxage=60, stale-while-revalidate=300`.
  The edge absorbs visitor polls; EDGAR sees ≤ ~1 req/min per colo,
  far below the 10 req/sec ban threshold.
- Upstream failure: `502 { error }` with `Cache-Control: no-store` so
  failures are never cached; the edge's stale-while-revalidate covers
  readers meanwhile.
- No credentials in client code; the browser only ever talks to this
  endpoint.

### 4. `src/pages/feed.astro` — page

- Prerendered static shell on `Base` layout with `Nav`, like existing
  pages.
- Vanilla inline `<script>` (no island, no framework): fetch
  `/api/events` on load, poll every 60s, render rows into a list via
  string templating with HTML-escaped text.
- Row: filed time in America/Chicago, form-type badge, company name,
  link to the filing on sec.gov.
- Failed poll: keep the last good list, show "updated HH:MM — stale".

### 5. Deploy changes

- `package.json`: add `@astrojs/cloudflare`.
- `astro.config.mjs`: add the cloudflare adapter. Output stays default
  (static); only routes with `prerender = false` run in the Worker.
- `wrangler.jsonc`: add the `main` worker entry per the adapter's
  output convention; rewrite the header comment (its "block the SSR
  path" rationale no longer applies).

### 6. Guard carve-out

`src/lib/feed/sources*` joins `sanitize*` as a protected arm in
`.github/workflows/guard.yml`, placed before the `src/lib/*` allowlist
arm. The bash `case` glob `src/lib/*` matches subdirectories, so
without this the licensing boundary would sit in the machine's Tier B
self-merge zone. Cases added to both guard test suites
(`.github/workflows/guard.test.mjs`, `engine/guard-workflow.test.mjs`).

## Testing

- `src/lib/feed/sources.test.ts`: fail-closed matrix — missing, empty,
  `'true'`, `'false'`, garbage; disabled sources never returned.
- `src/lib/feed/edgar.test.ts`: fixture Atom document → parsed events;
  malformed entry skipped; fetch wrapper sets the User-Agent and throws
  on non-200 (injected fetch).
- Guard tests: `src/lib/feed/sources.ts` flagged protected; the rest of
  `src/lib/feed/*` stays in-zone.
- Whole suite, `astro check`, and `astro build` stay green.

## Sequencing

1. Commit the pending `src/lib/feed.ts` → `src/lib/rss-feed.ts` rename
   (frees the `feed` name this project occupies).
2. Build per this spec.
3. This PR touches `.github/**`, `astro.config.mjs`, `package.json`,
   and `wrangler.jsonc` — all protected paths, so it is a needs-human
   merge by design.

## Out of scope (later projects)

Python ingest pollers, `events` table and migration, halts and federal
release fetchers, Benzinga/tailnet private build, Telegram sender,
scoring on the feed surface.
