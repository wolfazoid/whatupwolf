# Feed v2 Signal Density Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn `/feed` from a raw EDGAR firehose into a material-events feed: server-side form allowlist, CIK→ticker join, and 8-K item-code badges.

**Architecture:** Three new pure-ish lib modules (`forms.ts` editorial config, `tickers.ts` cached CIK→ticker map, `items.ts` capped per-filing item enrichment) compose into the existing `eventsResponse` pipeline; the parser gains CIK capture; the render layer gains ticker and item badges. API shape is strictly additive; cache headers are untouched.

**Tech Stack:** Astro 5 + `@astrojs/cloudflare` (pinned 12.6.13 — do not touch), TypeScript strict, vitest.

**Spec:** `docs/superpowers/specs/2026-08-26-feed-v2-signal-density-design.md`

## Global Constraints

- Every EDGAR fetch carries `User-Agent: whatupwolf.com wolf@wearefeasting.com` (import `EDGAR_USER_AGENT` from `./edgar` — never redeclare it).
- Cloudflare cache hints: getcurrent stays `cacheTtl: 60`; ticker map and filing index pages use `cf: { cacheTtl: 86400, cacheEverything: true }` (immutable/daily surfaces).
- Enrichment fails open: ticker-map failure → empty Map; per-filing item failure → `[]` for that filing. The ONLY 502 path remains a getcurrent failure.
- Response envelope `{ events, asOf }` and both Cache-Control strings stay byte-identical to v1: success `public, max-age=15, s-maxage=60, stale-while-revalidate=300`, error `no-store`.
- `FORM_ALLOWLIST` exactly: `8-K`, `8-K/A`, `SC 13D`, `SC 13D/A`, `S-3`, `S-3/A`, `424B5`, `NT 10-K`, `NT 10-Q`, `25`, `25-NSE`. Form 4 and 424B2/424B3 are deliberately excluded.
- Item enrichment: cap 15 newest 8-Ks per poll, concurrency 3.
- Everything interpolated into row HTML goes through `escapeHtml`.
- Commit messages end with `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`.
- TDD per task; `npm test` fully green before every commit.

---

### Task 1: Branch

**Files:** none changed.

- [ ] **Step 1: Create the feature branch from up-to-date main**

```bash
git checkout main && git pull --ff-only && git checkout -b feat/feed-v2-signal-density
```

(The v2 spec commit on local main rides along.) Run `npm test` — expect all green (392 tests as of v1) before starting.

---

### Task 2: Form allowlist and item classification — `forms.ts`

**Files:**
- Create: `src/lib/feed/forms.ts`
- Test: `src/lib/feed/forms.test.ts`

**Interfaces:**
- Produces: `const FORM_ALLOWLIST: readonly string[]`; `function isAllowlisted(form: string): boolean`; `interface ItemDef { code: string; label: string; hot: boolean }`; `const ITEM_DEFS: readonly ItemDef[]`; `function classifyItem(code: string): ItemDef | undefined`.

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/feed/forms.test.ts
import { describe, expect, it } from 'vitest';
import { FORM_ALLOWLIST, isAllowlisted, classifyItem, ITEM_DEFS } from './forms';

describe('isAllowlisted', () => {
  it.each(['8-K', '8-K/A', 'SC 13D', 'SC 13D/A', 'S-3', 'S-3/A', '424B5', 'NT 10-K', 'NT 10-Q', '25', '25-NSE'])(
    'allows %s',
    (form) => expect(isAllowlisted(form)).toBe(true)
  );

  it.each(['4', '4/A', '424B2', '424B3', '10-Q', '10-K', 'SC 13G', '13F-HR', 'S-1', ''])(
    'rejects %s',
    (form) => expect(isAllowlisted(form)).toBe(false)
  );

  it('tolerates surrounding whitespace but not partial matches', () => {
    expect(isAllowlisted(' 8-K ')).toBe(true);
    expect(isAllowlisted('8-K12B')).toBe(false);
  });

  it('exports the exact allowlist for the composer and docs', () => {
    expect(FORM_ALLOWLIST).toHaveLength(11);
  });
});

describe('classifyItem', () => {
  it.each(['4.02', '1.03', '5.02', '1.01', '1.02', '2.01'])('marks %s hot', (code) => {
    expect(classifyItem(code)).toMatchObject({ code, hot: true });
  });

  it.each(['2.02', '7.01', '8.01', '9.01'])('marks %s routine', (code) => {
    expect(classifyItem(code)).toMatchObject({ code, hot: false });
  });

  it('returns undefined for unknown codes (renderer falls back to a plain badge)', () => {
    expect(classifyItem('3.01')).toBeUndefined();
  });

  it('gives every item a human label for tooltips', () => {
    for (const def of ITEM_DEFS) expect(def.label.length).toBeGreaterThan(5);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/feed/forms.test.ts`
Expected: FAIL — cannot resolve `./forms`.

- [ ] **Step 3: Write the implementation**

```ts
// src/lib/feed/forms.ts
// Editorial signal config: which forms are material enough to serve, and
// which 8-K items are hot. Deliberately separate from sources.ts — that
// file is the LICENSING boundary (guard-protected); this one is signal
// curation and lives in the normal auto-merge zone.
//
// Form 4 is deliberately absent until direction parsing exists (v3):
// raw Form 4 streams mix 10b5-1 sells and option exercises with real
// buys. 424B5 (priced takedown) is in; 424B2/424B3 (structured-note and
// resale flood) are out — an S-3 is dilution capacity, the 424B5 is the
// trigger.

export const FORM_ALLOWLIST: readonly string[] = [
  '8-K', '8-K/A',
  'SC 13D', 'SC 13D/A',
  'S-3', 'S-3/A', '424B5',
  'NT 10-K', 'NT 10-Q',
  '25', '25-NSE',
];

export function isAllowlisted(form: string): boolean {
  return FORM_ALLOWLIST.includes(form.trim());
}

export interface ItemDef {
  code: string;
  label: string;
  hot: boolean;
}

// Known limitation (documented in the spec): 8.01 is the catch-all where
// material news gets buried precisely because it looks routine. Code-level
// classification cannot catch that; text analysis is a later enrichment.
export const ITEM_DEFS: readonly ItemDef[] = [
  { code: '4.02', label: 'Non-reliance on prior financials (restatement)', hot: true },
  { code: '1.03', label: 'Bankruptcy or receivership', hot: true },
  { code: '5.02', label: 'Executive or director departure/appointment', hot: true },
  { code: '1.01', label: 'Material agreement entered', hot: true },
  { code: '1.02', label: 'Material agreement terminated', hot: true },
  { code: '2.01', label: 'Acquisition or disposition completed', hot: true },
  { code: '2.02', label: 'Earnings release', hot: false },
  { code: '7.01', label: 'Reg FD disclosure', hot: false },
  { code: '8.01', label: 'Other events', hot: false },
  { code: '9.01', label: 'Financial statements and exhibits', hot: false },
];

export function classifyItem(code: string): ItemDef | undefined {
  return ITEM_DEFS.find((d) => d.code === code);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/feed/forms.test.ts`
Expected: PASS.

- [ ] **Step 5: Full suite, commit**

```bash
npm test
git add src/lib/feed/forms.ts src/lib/feed/forms.test.ts
git commit -m "feat: form allowlist and 8-K item classification

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 3: CIK capture in the parser

**Files:**
- Modify: `src/lib/feed/edgar.ts` (interface + parse loop), `src/lib/feed/edgar.test.ts`, `src/lib/feed/render.test.ts` (event factory gains the new required field)

**Interfaces:**
- Produces: `FeedEvent` gains required `cik: string` (10-digit zero-padded, `''` when the title has no CIK parenthetical). Field order: after `company`.

- [ ] **Step 1: Extend the parser tests (failing first)**

In `src/lib/feed/edgar.test.ts`, the first deep-equal test currently expects an object without `cik`. Update it and add a no-CIK case:

```ts
  it('extracts the fields, decoding entities and stripping title decoration', () => {
    expect(events[0]).toEqual({
      id: 'urn:tag:sec.gov,2008:accession-number=0000123456-26-000042',
      source: 'edgar',
      form: '8-K',
      company: 'ACME HOLDINGS & CO',
      cik: '0000123456',
      filedAt: '2026-08-24T12:34:56-04:00',
      url: 'https://www.sec.gov/Archives/edgar/data/123456/000012345626000042-index.htm',
    });
  });

  it('captures the reporting-person CIK on Form 4 entries', () => {
    expect(events[1].cik).toBe('0000987654');
  });

  it('yields an empty cik when the title has no CIK parenthetical', () => {
    const atom = `<feed><entry>
<title>8-K - NO CIK CORP</title>
<link rel="alternate" type="text/html" href="https://www.sec.gov/x-index.htm"/>
<updated>2026-08-26T10:00:00-04:00</updated>
<category scheme="https://www.sec.gov/" label="form type" term="8-K"/>
<id>urn:tag:sec.gov,2008:accession-number=0000000000-26-000001</id>
</entry></feed>`;
    const [event] = parseEdgarAtom(atom);
    expect(event.cik).toBe('');
    expect(event.company).toBe('NO CIK CORP');
  });
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/lib/feed/edgar.test.ts`
Expected: FAIL — deep-equal mismatch (no `cik` key) and missing property.

- [ ] **Step 3: Implement**

In `src/lib/feed/edgar.ts`, add to the interface (after `company`):

```ts
  cik: string; // 10-digit zero-padded, '' when the entry title carries none
```

In the parse loop, replace the company-derivation block:

```ts
    // Title shape: "8-K - ACME HOLDINGS & CO (0000123456) (Filer)".
    let company = decode(title);
    if (company.startsWith(`${form} - `)) company = company.slice(form.length + 3);
    const cik = /\((\d{10})\)/.exec(company)?.[1] ?? '';
    company = company.replace(/\s*\(\d{10}\)\s*(\([^)]*\))?\s*$/, '').trim();

    events.push({ id, source: 'edgar', form, company, cik, filedAt, url: decode(url) });
```

In `src/lib/feed/render.test.ts`, the `event()` factory builds a `FeedEvent` literal — add `cik: '0000000000',` to it (any position) so it still typechecks.

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run src/lib/feed/edgar.test.ts src/lib/feed/render.test.ts`
Expected: PASS.

- [ ] **Step 5: Full suite, commit**

```bash
npm test
git add src/lib/feed/edgar.ts src/lib/feed/edgar.test.ts src/lib/feed/render.test.ts
git commit -m "feat: capture filer CIK in the EDGAR parser

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 4: CIK→ticker map — `tickers.ts`

**Files:**
- Create: `src/lib/feed/tickers.ts`
- Test: `src/lib/feed/tickers.test.ts`

**Interfaces:**
- Consumes: `EDGAR_USER_AGENT` from `./edgar`.
- Produces: `const TICKER_URL: string`; `async function fetchTickerMap(fetchImpl?: typeof fetch): Promise<Map<string, string>>` (keys are 10-digit zero-padded CIK strings); `function _clearTickerMemo(): void` (test hook).

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/feed/tickers.test.ts
import { beforeEach, describe, expect, it } from 'vitest';
import { fetchTickerMap, TICKER_URL, _clearTickerMemo } from './tickers';
import { EDGAR_USER_AGENT } from './edgar';

// Real company_tickers.json shape: object keyed by arbitrary indices.
const FIXTURE = JSON.stringify({
  '0': { cik_str: 320193, ticker: 'AAPL', title: 'Apple Inc.' },
  '1': { cik_str: 1318605, ticker: 'TSLA', title: 'Tesla, Inc.' },
});

const countingFetch = () => {
  let calls = 0;
  const impl = (async (url: string | URL | Request, init?: RequestInit) => {
    calls += 1;
    impl.lastUrl = String(url);
    impl.lastInit = init;
    return new Response(FIXTURE, { status: 200 });
  }) as typeof fetch & { lastUrl?: string; lastInit?: RequestInit; readonly calls?: number };
  Object.defineProperty(impl, 'calls', { get: () => calls });
  return impl;
};

beforeEach(() => _clearTickerMemo());

describe('fetchTickerMap', () => {
  it('maps zero-padded CIK strings to tickers, with UA and daily cache hint', async () => {
    const impl = countingFetch();
    const map = await fetchTickerMap(impl);
    expect(map.get('0000320193')).toBe('AAPL');
    expect(map.get('0001318605')).toBe('TSLA');
    expect(impl.lastUrl).toBe(TICKER_URL);
    expect((impl.lastInit?.headers as Record<string, string>)['User-Agent']).toBe(EDGAR_USER_AGENT);
    expect((impl.lastInit as { cf?: unknown }).cf).toEqual({ cacheTtl: 86400, cacheEverything: true });
  });

  it('memoizes: a second call within the TTL does not refetch', async () => {
    const impl = countingFetch();
    await fetchTickerMap(impl);
    await fetchTickerMap(impl);
    expect(impl.calls).toBe(1);
  });

  it('fails open to an empty map, and does not memoize the failure', async () => {
    const bad = (async () => new Response('nope', { status: 503 })) as typeof fetch;
    expect((await fetchTickerMap(bad)).size).toBe(0);
    const good = countingFetch();
    expect((await fetchTickerMap(good)).size).toBe(2); // retried, not stuck empty
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/lib/feed/tickers.test.ts`
Expected: FAIL — cannot resolve `./tickers`.

- [ ] **Step 3: Implement**

```ts
// src/lib/feed/tickers.ts
// CIK→ticker join table from SEC's documented mapping file (~1MB).
// Two cache layers: cf.cacheTtl=86400 keeps it to one EDGAR hit per colo
// per day, and an in-isolate memo avoids re-parsing 1MB on every poll.
// Fails open: any error returns an empty Map (feed shows company names).
import { EDGAR_USER_AGENT } from './edgar';

export const TICKER_URL = 'https://www.sec.gov/files/company_tickers.json';
const MEMO_TTL_MS = 60 * 60 * 1000;

let memo: { map: Map<string, string>; fetchedAt: number } | null = null;

/** Test hook — resets the in-isolate memo. */
export function _clearTickerMemo(): void {
  memo = null;
}

export async function fetchTickerMap(fetchImpl: typeof fetch = fetch): Promise<Map<string, string>> {
  if (memo && Date.now() - memo.fetchedAt < MEMO_TTL_MS) return memo.map;
  try {
    const res = await fetchImpl(TICKER_URL, {
      headers: { 'User-Agent': EDGAR_USER_AGENT },
      cf: { cacheTtl: 86400, cacheEverything: true },
    } as RequestInit);
    if (!res.ok) throw new Error(`tickers responded ${res.status}`);
    const raw = (await res.json()) as Record<string, { cik_str: number; ticker: string }>;
    const map = new Map<string, string>();
    for (const entry of Object.values(raw)) {
      map.set(String(entry.cik_str).padStart(10, '0'), entry.ticker);
    }
    memo = { map, fetchedAt: Date.now() };
    return map;
  } catch {
    return new Map(); // failure is not memoized — the next poll retries
  }
}
```

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run src/lib/feed/tickers.test.ts`
Expected: PASS.

- [ ] **Step 5: Full suite, commit**

```bash
npm test
git add src/lib/feed/tickers.ts src/lib/feed/tickers.test.ts
git commit -m "feat: cached CIK-to-ticker map from company_tickers.json

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 5: 8-K item enrichment — `items.ts`

**Files:**
- Create: `src/lib/feed/items.ts`, `src/lib/feed/items.fixture.ts`
- Test: `src/lib/feed/items.test.ts`

**Interfaces:**
- Consumes: `EDGAR_USER_AGENT`, `FeedEvent` from `./edgar`.
- Produces: `const ITEM_FETCH_CAP = 15`; `const ITEM_CONCURRENCY = 3`; `function parseItemCodes(html: string): string[]`; `async function enrichWithItems(events: FeedEvent[], fetchImpl?: typeof fetch): Promise<Map<string, string[]>>` — Map keyed by `event.id`; events not selected are absent.

- [ ] **Step 1: Ground the fixture in reality**

Fetch ONE real 8-K index page to confirm the item markup (this is a development-time check, a single polite request):

```bash
curl -s -A "whatupwolf.com wolf@wearefeasting.com" \
  "https://www.sec.gov/cgi-bin/browse-edgar?action=getcurrent&type=8-K&output=atom&count=1" \
  | grep -o 'href="[^"]*index.htm"' | head -1
# then curl that URL with the same -A flag and inspect how items appear
```

Expected shapes (both must be handled): `Item 5.02: Departure of Directors…` (per-item lines) and/or `Current report, items 2.02 and 9.01` (comma/and list after a single "items"). Build `src/lib/feed/items.fixture.ts` from what you actually see — a trimmed `export const FIXTURE_INDEX_HTML: string` snippet containing at least two item codes in the real markup, plus keep the codes `5.02` and `9.01` in it so the tests below hold. If the real markup differs meaningfully from both expected shapes, STOP and report NEEDS_CONTEXT with what you found.

- [ ] **Step 2: Write the failing test**

```ts
// src/lib/feed/items.test.ts
import { describe, expect, it } from 'vitest';
import { parseItemCodes, enrichWithItems, ITEM_FETCH_CAP, ITEM_CONCURRENCY } from './items';
import { FIXTURE_INDEX_HTML } from './items.fixture';
import type { FeedEvent } from './edgar';

const event = (n: number, form = '8-K'): FeedEvent => ({
  id: `urn:acc-${n}`,
  source: 'edgar',
  form,
  company: `CO ${n}`,
  cik: '0000000001',
  filedAt: `2026-08-26T10:${String(n).padStart(2, '0')}:00-04:00`,
  url: `https://www.sec.gov/Archives/edgar/data/1/acc-${n}-index.htm`,
});

describe('parseItemCodes', () => {
  it('extracts codes from a real index page snippet, deduplicated, in order', () => {
    const codes = parseItemCodes(FIXTURE_INDEX_HTML);
    expect(codes).toContain('5.02');
    expect(codes).toContain('9.01');
    expect(new Set(codes).size).toBe(codes.length);
  });

  it('handles the "items 2.02 and 9.01" prose shape', () => {
    expect(parseItemCodes('Form 8-K - Current report, items 2.02 and 9.01')).toEqual(['2.02', '9.01']);
  });

  it('returns [] when nothing matches', () => {
    expect(parseItemCodes('<html>no items here</html>')).toEqual([]);
    expect(parseItemCodes('')).toEqual([]);
  });
});

describe('enrichWithItems', () => {
  const htmlFetch = (async () => new Response(FIXTURE_INDEX_HTML, { status: 200 })) as typeof fetch;

  it('enriches only 8-K forms, keyed by event id', async () => {
    const events = [event(1), event(2, 'SC 13D'), event(3, '8-K/A')];
    const map = await enrichWithItems(events, htmlFetch);
    expect(map.has('urn:acc-1')).toBe(true);
    expect(map.has('urn:acc-3')).toBe(true); // 8-K/A counts
    expect(map.has('urn:acc-2')).toBe(false);
    expect(map.get('urn:acc-1')).toContain('5.02');
  });

  it(`caps at ${ITEM_FETCH_CAP} fetches and never exceeds concurrency ${ITEM_CONCURRENCY}`, async () => {
    let inFlight = 0;
    let peak = 0;
    let total = 0;
    const gauge = (async () => {
      inFlight += 1;
      total += 1;
      peak = Math.max(peak, inFlight);
      await new Promise((r) => setTimeout(r, 5));
      inFlight -= 1;
      return new Response(FIXTURE_INDEX_HTML, { status: 200 });
    }) as typeof fetch;
    const events = Array.from({ length: ITEM_FETCH_CAP + 5 }, (_, i) => event(i));
    const map = await enrichWithItems(events, gauge);
    expect(total).toBe(ITEM_FETCH_CAP);
    expect(map.size).toBe(ITEM_FETCH_CAP);
    expect(peak).toBeLessThanOrEqual(ITEM_CONCURRENCY);
  });

  it('isolates per-filing failures to an empty item list', async () => {
    let n = 0;
    const flaky = (async () => {
      n += 1;
      if (n === 1) throw new Error('boom');
      if (n === 2) return new Response('gone', { status: 404 });
      return new Response(FIXTURE_INDEX_HTML, { status: 200 });
    }) as typeof fetch;
    const map = await enrichWithItems([event(1), event(2), event(3)], flaky);
    expect(map.get('urn:acc-1')).toEqual([]);
    expect(map.get('urn:acc-2')).toEqual([]);
    expect(map.get('urn:acc-3')).toContain('5.02');
  });
});
```

Note the failure-isolation test assumes sequential-ish dispatch order for the first three fetches; with concurrency 3 and three targets each worker takes exactly one — order is deterministic because workers pull `targets[next++]` synchronously before awaiting.

- [ ] **Step 3: Run to verify failure**

Run: `npx vitest run src/lib/feed/items.test.ts`
Expected: FAIL — cannot resolve `./items`.

- [ ] **Step 4: Implement**

```ts
// src/lib/feed/items.ts
// 8-K item-code enrichment. Each 8-K's own -index.htm (the URL already in
// the event) names its items; we fetch a bounded batch per poll. Accession
// URLs are immutable, so cf.cacheTtl=86400 means only genuinely new
// filings miss the cache after warmup. Bounds: 15 filings/poll at
// concurrency 3 keeps a cold poll far under EDGAR's 10 req/s, and
// 1 + 15 + 1 total subrequests under the Workers 50-subrequest cap.
// Fails open per filing: a fetch/parse failure yields [] for that filing.
import { EDGAR_USER_AGENT, type FeedEvent } from './edgar';

export const ITEM_FETCH_CAP = 15;
export const ITEM_CONCURRENCY = 3;

// Matches both real index-page shapes: "Item 5.02: …" rows and
// "Current report, items 2.02 and 9.01" prose.
export function parseItemCodes(html: string): string[] {
  const codes: string[] = [];
  for (const [, span] of html.matchAll(/items?[\s:]*((?:\d+\.\d{2}(?:\s*(?:,|and)\s*)?)+)/gi)) {
    for (const [code] of span.matchAll(/\d+\.\d{2}/g)) {
      if (!codes.includes(code)) codes.push(code);
    }
  }
  return codes;
}

export async function enrichWithItems(
  events: FeedEvent[],
  fetchImpl: typeof fetch = fetch
): Promise<Map<string, string[]>> {
  const targets = events.filter((e) => e.form.startsWith('8-K')).slice(0, ITEM_FETCH_CAP);
  const result = new Map<string, string[]>();
  let next = 0;

  async function worker(): Promise<void> {
    while (next < targets.length) {
      const target = targets[next++];
      try {
        const res = await fetchImpl(target.url, {
          headers: { 'User-Agent': EDGAR_USER_AGENT },
          cf: { cacheTtl: 86400, cacheEverything: true },
        } as RequestInit);
        result.set(target.id, res.ok ? parseItemCodes(await res.text()) : []);
      } catch {
        result.set(target.id, []);
      }
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(ITEM_CONCURRENCY, targets.length) }, () => worker())
  );
  return result;
}
```

- [ ] **Step 5: Run to verify pass**

Run: `npx vitest run src/lib/feed/items.test.ts`
Expected: PASS (including the concurrency gauge).

- [ ] **Step 6: Full suite, commit**

```bash
npm test
git add src/lib/feed/items.ts src/lib/feed/items.fixture.ts src/lib/feed/items.test.ts
git commit -m "feat: capped 8-K item-code enrichment from filing index pages

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 6: Composer pipeline — filter, join, enrich

**Files:**
- Modify: `src/lib/feed/events.ts`
- Rewrite: `src/lib/feed/events.test.ts` (full replacement below — the v1 tests assert unfiltered forms and will rightly break)

**Interfaces:**
- Consumes: `isAllowlisted` (Task 2), `cik` on `FeedEvent` (Task 3), `fetchTickerMap`/`_clearTickerMemo` (Task 4), `enrichWithItems` (Task 5).
- Produces: `interface FeedEventOut extends FeedEvent { ticker: string | null; items: string[] }`; response events are `FeedEventOut[]`. Task 7's renderer imports `FeedEventOut` from `./events`.

- [ ] **Step 1: Replace the test file (failing first)**

Replace `src/lib/feed/events.test.ts` entirely with:

```ts
import { beforeEach, describe, expect, it } from 'vitest';
import { eventsResponse } from './events';
import { FIXTURE_ATOM } from './edgar.fixture';
import { FIXTURE_INDEX_HTML } from './items.fixture';
import { TICKER_URL, _clearTickerMemo } from './tickers';

const TICKER_JSON = JSON.stringify({
  '0': { cik_str: 123456, ticker: 'ACME', title: 'Acme Holdings & Co' },
});

// Route the composer's three upstream shapes: getcurrent Atom, the ticker
// map, and per-filing index pages. Factories return fresh Responses.
const routedFetch = (overrides: Partial<Record<'atom' | 'tickers' | 'index', () => Response>> = {}) =>
  (async (url: string | URL | Request) => {
    const u = String(url);
    if (u.includes('action=getcurrent')) return (overrides.atom ?? (() => new Response(FIXTURE_ATOM, { status: 200 })))();
    if (u === TICKER_URL) return (overrides.tickers ?? (() => new Response(TICKER_JSON, { status: 200 })))();
    return (overrides.index ?? (() => new Response(FIXTURE_INDEX_HTML, { status: 200 })))();
  }) as typeof fetch;

// Two allowlisted forms deliberately in oldest-first document order, so a
// missing/reversed sort fails the test (FIXTURE_ATOM is already sorted).
const OUT_OF_ORDER_ATOM = `<?xml version="1.0" encoding="ISO-8859-1" ?>
<feed xmlns="http://www.w3.org/2005/Atom">
<entry>
<title>SC 13D - OLDER FIRST INC (0000111111) (Filer)</title>
<link rel="alternate" type="text/html" href="https://www.sec.gov/Archives/edgar/data/111111/a-index.htm"/>
<updated>2026-08-24T10:00:00-04:00</updated>
<category scheme="https://www.sec.gov/" label="form type" term="SC 13D"/>
<id>urn:tag:sec.gov,2008:accession-number=0000111111-26-000001</id>
</entry>
<entry>
<title>8-K - NEWER SECOND CORP (0000222222) (Filer)</title>
<link rel="alternate" type="text/html" href="https://www.sec.gov/Archives/edgar/data/222222/b-index.htm"/>
<updated>2026-08-24T14:00:00-04:00</updated>
<category scheme="https://www.sec.gov/" label="form type" term="8-K"/>
<id>urn:tag:sec.gov,2008:accession-number=0000222222-26-000002</id>
</entry>
</feed>`;

beforeEach(() => _clearTickerMemo());

describe('eventsResponse', () => {
  it('filters to the allowlist: the fixture Form 4 is dropped, the 8-K survives', async () => {
    const res = await eventsResponse(undefined, routedFetch());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.events.map((e: { form: string }) => e.form)).toEqual(['8-K']);
  });

  it('keeps the v1 headers byte-identical', async () => {
    const res = await eventsResponse(undefined, routedFetch());
    expect(res.headers.get('Content-Type')).toBe('application/json');
    expect(res.headers.get('Cache-Control')).toBe(
      'public, max-age=15, s-maxage=60, stale-while-revalidate=300'
    );
    expect(new Date((await res.json()).asOf).getTime()).not.toBeNaN();
  });

  it('joins tickers by CIK and leaves unmatched CIKs null', async () => {
    const res = await eventsResponse(undefined, routedFetch({ atom: () => new Response(OUT_OF_ORDER_ATOM, { status: 200 }) }));
    const body = await res.json();
    // TICKER_JSON only maps CIK 123456; neither out-of-order filer matches.
    expect(body.events.map((e: { ticker: string | null }) => e.ticker)).toEqual([null, null]);

    const res2 = await eventsResponse(undefined, routedFetch());
    const acme = (await res2.json()).events[0];
    expect(acme.ticker).toBe('ACME');
  });

  it('attaches item codes to 8-Ks and [] to everything else', async () => {
    const res = await eventsResponse(undefined, routedFetch({ atom: () => new Response(OUT_OF_ORDER_ATOM, { status: 200 }) }));
    const body = await res.json();
    const byForm = Object.fromEntries(body.events.map((e: { form: string; items: string[] }) => [e.form, e.items]));
    expect(byForm['8-K']).toContain('5.02');
    expect(byForm['SC 13D']).toEqual([]);
  });

  it('sorts newest-first after filtering', async () => {
    const res = await eventsResponse(undefined, routedFetch({ atom: () => new Response(OUT_OF_ORDER_ATOM, { status: 200 }) }));
    const body = await res.json();
    expect(body.events.map((e: { company: string }) => e.company)).toEqual([
      'NEWER SECOND CORP',
      'OLDER FIRST INC',
    ]);
  });

  it('fails open when enrichment upstreams fail: 200 with nulls and empty items', async () => {
    const res = await eventsResponse(undefined, routedFetch({
      tickers: () => new Response('down', { status: 503 }),
      index: () => new Response('down', { status: 503 }),
    }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.events[0].ticker).toBeNull();
    expect(body.events[0].items).toEqual([]);
  });

  it('maps a getcurrent failure to 502 no-store — the only error path', async () => {
    const res = await eventsResponse(undefined, routedFetch({ atom: () => new Response('unavailable', { status: 503 }) }));
    expect(res.status).toBe(502);
    expect(res.headers.get('Cache-Control')).toBe('no-store');
    expect((await res.json()).error).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/lib/feed/events.test.ts`
Expected: FAIL — composer doesn't filter/join/enrich yet (Form 4 present, no `ticker`/`items` fields).

- [ ] **Step 3: Implement the pipeline**

Replace the body of `src/lib/feed/events.ts` with (keep the existing header-comment style; the rate-limit comment about `cf.cacheTtl` living in `fetchEdgarEvents` remains true and stays):

```ts
import { servableSources } from './sources';
import { fetchEdgarEvents, type FeedEvent } from './edgar';
import { isAllowlisted } from './forms';
import { fetchTickerMap } from './tickers';
import { enrichWithItems } from './items';

export interface FeedEventOut extends FeedEvent {
  ticker: string | null;
  items: string[];
}

const JSON_HEADERS = { 'Content-Type': 'application/json' };

export async function eventsResponse(
  publicFeedEnv: string | undefined,
  fetchImpl: typeof fetch = fetch
): Promise<Response> {
  try {
    const batches = await Promise.all(
      servableSources(publicFeedEnv).map((s) =>
        s.id === 'edgar' ? fetchEdgarEvents(fetchImpl) : Promise.resolve<FeedEvent[]>([])
      )
    );
    const filtered = batches
      .flat()
      .filter((e) => isAllowlisted(e.form))
      .sort((a, b) => b.filedAt.localeCompare(a.filedAt));

    // Enrichment fails open (empty map / []) — only getcurrent can 502.
    const [tickers, items] = await Promise.all([
      fetchTickerMap(fetchImpl),
      enrichWithItems(filtered, fetchImpl),
    ]);
    const events: FeedEventOut[] = filtered.map((e) => ({
      ...e,
      ticker: tickers.get(e.cik) ?? null,
      items: items.get(e.id) ?? [],
    }));

    return new Response(JSON.stringify({ events, asOf: new Date().toISOString() }), {
      status: 200,
      headers: {
        ...JSON_HEADERS,
        'Cache-Control': 'public, max-age=15, s-maxage=60, stale-while-revalidate=300',
      },
    });
  } catch {
    return new Response(JSON.stringify({ error: 'upstream source unavailable' }), {
      status: 502,
      headers: { ...JSON_HEADERS, 'Cache-Control': 'no-store' },
    });
  }
}
```

Preserve any existing explanatory comments that are still accurate (the cache-header comment block from the v1 fix wave). The route file `src/pages/api/events.ts` needs no changes.

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run src/lib/feed/events.test.ts`
Expected: PASS (all 7).

- [ ] **Step 5: Full suite, commit**

```bash
npm test
git add src/lib/feed/events.ts src/lib/feed/events.test.ts
git commit -m "feat: composer filters to allowlist, joins tickers, enriches 8-K items

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 7: Render badges and page copy

**Files:**
- Modify: `src/lib/feed/render.ts`, `src/lib/feed/render.test.ts`, `src/pages/feed.astro` (intro copy only)

**Interfaces:**
- Consumes: `FeedEventOut` from `./events` (Task 6), `classifyItem` from `./forms` (Task 2).
- Produces: `renderEvents(events: FeedEventOut[]): string` — signature widens; the page script passes the API's events through unchanged.

- [ ] **Step 1: Extend the render tests (failing first)**

In `src/lib/feed/render.test.ts`: change the factory to build `FeedEventOut` (import the type from `./events`), adding `ticker: null as string | null` and `items: [] as string[]` defaults alongside the existing fields, and add:

```ts
describe('renderEvents — v2 badges', () => {
  it('renders hot item codes with the accent class and routine ones muted', () => {
    const html = renderEvents([event({ items: ['5.02', '9.01'] })]);
    expect(html).toContain('>5.02</span>');
    expect(html).toContain('>9.01</span>');
    expect(html).toContain('text-[var(--color-accent)]');           // hot 5.02
    expect(html.indexOf('5.02')).toBeLessThan(html.indexOf('9.01')); // order preserved
  });

  it('labels known items via a title tooltip and falls back for unknown codes', () => {
    const html = renderEvents([event({ items: ['4.02', '3.01'] })]);
    expect(html).toContain('title="Non-reliance on prior financials (restatement)"');
    expect(html).toContain('title="Item 3.01"');
  });

  it('renders the ticker in mono when present and omits it when null', () => {
    expect(renderEvents([event({ ticker: 'ACME' })])).toContain('ACME');
    expect(renderEvents([event({ ticker: null })])).not.toContain('font-[var(--font-mono)]');
  });

  it('escapes hostile ticker and item content', () => {
    const html = renderEvents([event({ ticker: '<b>X</b>', items: ['"><script>1</script>'] })]);
    expect(html).not.toContain('<script>');
    expect(html).not.toContain('"><');
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/lib/feed/render.test.ts`
Expected: FAIL — type error / missing badge markup.

- [ ] **Step 3: Implement**

In `src/lib/feed/render.ts`: change the import and signature, add the badge helper, and extend the row template.

```ts
import type { FeedEventOut } from './events';
import { classifyItem } from './forms';
```

```ts
function itemBadges(items: string[]): string {
  return items
    .map((code) => {
      const def = classifyItem(code);
      const cls = def?.hot
        ? 'text-[var(--color-accent)] border-[var(--color-accent)]'
        : 'text-[var(--color-muted)] border-[var(--color-line)]';
      return `<span class="chrome shrink-0 rounded border px-1 ${cls}" title="${escapeHtml(def?.label ?? `Item ${code}`)}">${escapeHtml(code)}</span>`;
    })
    .join('\n  ');
}

export function renderEvents(events: FeedEventOut[]): string {
  if (!events.length) return '<li class="py-2 chrome">no filings</li>';
  return events
    .map(
      (e) => `<li class="py-2 flex flex-wrap items-baseline gap-x-3 gap-y-1">
  <span class="chrome shrink-0">${escapeHtml(formatFiledAt(e.filedAt))}</span>
  <span class="chrome shrink-0 rounded border border-[var(--color-line)] px-1">${escapeHtml(e.form)}</span>
  ${itemBadges(e.items)}${e.ticker ? `
  <span class="shrink-0 font-[var(--font-mono)] text-[var(--color-accent)]">${escapeHtml(e.ticker)}</span>` : ''}
  <a href="${escapeHtml(e.url)}" target="_blank" rel="noopener noreferrer"
     class="text-[var(--color-ink)] hover:text-[var(--color-accent)] transition-colors">${escapeHtml(e.company)}</a>
</li>`
    )
    .join('\n');
}
```

(`escapeHtml`, `formatFiledAt`, `formatClock` are unchanged.) In `src/pages/feed.astro`, update only the intro paragraph text to:

```
Material filings only — 8-Ks with item codes, activist stakes, shelf
registrations and priced offerings, late filings, delistings. Refreshed
every minute.
```

The page `<script>` needs no changes (it passes the API's events straight to `renderEvents`).

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run src/lib/feed/render.test.ts`
Expected: PASS.

- [ ] **Step 5: Full gate, commit**

```bash
npm test && npm run check && npm run build
git add src/lib/feed/render.ts src/lib/feed/render.test.ts src/pages/feed.astro
git commit -m "feat: item-code and ticker badges on the feed page

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 8: Live verification, final gate, and PR

**Files:** none new.

- [ ] **Step 1: Live check against real EDGAR (market day)**

Run `npm run dev` in the background, then:

```bash
curl -s http://localhost:4321/api/events | head -c 1500
```

Expected: JSON where every event's `form` is on the allowlist, 8-Ks carry `items` arrays, and company filers carry `ticker` values (13D filers and trusts may be null — correct). This makes ~17 real EDGAR requests once — fine. Load `http://localhost:4321/feed` and confirm badges render. Kill the dev server. Record a sample event in the report.

- [ ] **Step 2: Full gate**

Run: `npm test && npm run check && npm run build && npx wrangler deploy --dry-run`
Expected: all green.

- [ ] **Step 3: Push and open the PR**

```bash
git push -u origin feat/feed-v2-signal-density
gh pr create --title "feat: feed v2 — signal density (allowlist, tickers, 8-K items)" --body "$(cat <<'EOF'
Implements docs/superpowers/specs/2026-08-26-feed-v2-signal-density-design.md:

- Server-side form allowlist (8-K, SC 13D, S-3/424B5, NT 10-K/Q, 25) —
  Form 4 deliberately deferred to v3 direction parsing
- CIK capture in the parser + ticker join from company_tickers.json
  (edge-cached daily, in-isolate memo, fails open)
- 8-K item-code enrichment from filing index pages (cap 15/poll,
  concurrency 3, immutable-cached, fails open per filing)
- Hot/routine item badges and ticker column on /feed
- API shape additive; cache headers and 502 semantics unchanged

Design was sanity-checked against practitioner community consensus
(2026-08-26 research pass) — allowlist, item tiers, and the Form 4
deferral all match how filing monitors are actually used.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

- [ ] **Step 4: Confirm CI**

Run: `gh pr checks --watch`
Expected: green. All changed files are in `src/` + docs, so the guard may auto-label this one allowlisted (feed/sources.ts untouched); Wolf merges per tier policy either way.
