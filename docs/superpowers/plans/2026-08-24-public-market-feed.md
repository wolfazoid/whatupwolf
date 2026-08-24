# Public Market Feed v1 (EDGAR-direct) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship `/feed` and `/api/events` backed directly by SEC EDGAR, with the public/private source gate real from day one.

**Architecture:** Pure lib modules (`src/lib/feed/`) do the gating, EDGAR Atom parsing, and response composition; a thin `prerender = false` Astro endpoint wires them to the Cloudflare Worker runtime; a prerendered page polls it with a vanilla bundled script. Cloudflare's edge cache (via `Cache-Control` headers) absorbs visitor polls so EDGAR sees ≤ ~1 req/min per colo.

**Tech Stack:** Astro 5 + `@astrojs/cloudflare`, TypeScript strict, vitest, Tailwind v4 classes with the site's CSS variables.

**Spec:** `docs/superpowers/specs/2026-08-24-public-market-feed-design.md`

## Global Constraints

- Gate fails closed: private-tier sources served **only** when `PUBLIC_FEED` is exactly the string `'false'`; missing/empty/anything else → public tier only.
- EDGAR requests carry `User-Agent: whatupwolf.com wolf@wearefeasting.com` (mandatory; violations get the IP banned).
- Success cache header exactly: `public, max-age=15, s-maxage=60, stale-while-revalidate=300`. Error responses: `no-store`, never cached.
- No API keys or upstream calls in client code — the browser talks only to `/api/events`.
- Page script is vanilla (Astro-bundled, no island, no framework import); polling, not SSE.
- File naming: kebab-case in `src/lib/`, lowercase routes in `src/pages/`.
- Every commit message ends with `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`.
- After every task: `npm test` green before committing.

## Preflight (blocking)

PR #86 must be merged before this plan starts: `main`'s guard test suite is red without it, and Task 8 edits both guard test files (one of which #86 creates). Verify with `gh pr view 86 --json state --jq .state` → `MERGED`, then `git pull --ff-only`.

---

### Task 1: Branch and land the pending rename

The working tree already holds a staged rename (`src/lib/feed.ts` → `src/lib/rss-feed.ts`, `feed.test.ts` → `rss-feed.test.ts`) plus matching import/comment edits in `src/pages/rss.xml.ts`. It frees the `feed` name this project occupies.

**Files:**
- Modify: none (changes already in tree)

**Interfaces:**
- Produces: `src/lib/feed/` is a safe directory name; `../lib/rss-feed` is the RSS module path.

- [ ] **Step 1: Create the feature branch (carrying the pending changes)**

```bash
git checkout -b feat/public-market-feed
```

- [ ] **Step 2: Run the suite**

Run: `npm test`
Expected: all green (preflight guarantees the guard tests pass).

- [ ] **Step 3: Commit the rename**

```bash
git add src/lib/rss-feed.ts src/lib/rss-feed.test.ts src/pages/rss.xml.ts
git commit -m "refactor: rename src/lib/feed to rss-feed, freeing the feed namespace

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

Note: `CLAUDE.md` at the root is also untracked. Commit it separately here if Wolf hasn't already:

```bash
git add CLAUDE.md
git commit -m "docs: add market-feed CLAUDE.md

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 2: Source registry and fail-closed gate

**Files:**
- Create: `src/lib/feed/sources.ts`
- Test: `src/lib/feed/sources.test.ts`

**Interfaces:**
- Produces: `type SourceTier = 'public' | 'private'`; `interface SourceDef { id: 'edgar' | 'exchange-halts' | 'fed-releases' | 'benzinga'; tier: SourceTier; label: string; enabled: boolean }`; `const SOURCES: readonly SourceDef[]`; `function servableSources(publicFeedEnv: string | undefined, sources?: readonly SourceDef[]): SourceDef[]`.

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/feed/sources.test.ts
import { describe, expect, it } from 'vitest';
import { SOURCES, servableSources, type SourceDef } from './sources';

// Synthetic roster: one enabled per tier, one disabled per tier — so the
// matrix below distinguishes tier gating from enabled gating.
const roster: readonly SourceDef[] = [
  { id: 'edgar', tier: 'public', label: 'EDGAR', enabled: true },
  { id: 'fed-releases', tier: 'public', label: 'Fed releases', enabled: false },
  { id: 'benzinga', tier: 'private', label: 'Benzinga', enabled: true },
  { id: 'exchange-halts', tier: 'private', label: 'pretend-private', enabled: false },
];
const ids = (env: string | undefined) => servableSources(env, roster).map((s) => s.id);

describe('servableSources — fail closed', () => {
  it.each([undefined, '', 'true', 'TRUE', 'False', '0', '1', 'garbage'])(
    'env %j serves the public tier only',
    (env) => expect(ids(env as string | undefined)).toEqual(['edgar'])
  );

  it("exactly 'false' unlocks the private tier", () => {
    expect(ids('false')).toEqual(['edgar', 'benzinga']);
  });

  it('never returns a disabled source in either mode', () => {
    expect(ids(undefined)).not.toContain('fed-releases');
    expect(ids('false')).not.toContain('exchange-halts');
  });
});

describe('the real registry', () => {
  it('defines all four planned sources', () => {
    expect(SOURCES.map((s) => s.id).sort()).toEqual(
      ['benzinga', 'edgar', 'exchange-halts', 'fed-releases']
    );
  });

  it('v1 serves only edgar, in both builds', () => {
    expect(servableSources(undefined).map((s) => s.id)).toEqual(['edgar']);
    expect(servableSources('false').map((s) => s.id)).toEqual(['edgar']);
  });

  it('benzinga is private tier (licensed — personal consumption only)', () => {
    expect(SOURCES.find((s) => s.id === 'benzinga')?.tier).toBe('private');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/feed/sources.test.ts`
Expected: FAIL — cannot resolve `./sources`.

- [ ] **Step 3: Write the implementation**

```ts
// src/lib/feed/sources.ts
// Licensing boundary, not a UI preference — see CLAUDE.md "Hard constraints".
// This module decides which sources reach which deploy. It must fail closed:
// if PUBLIC_FEED is missing or malformed, serve LESS, never more.

export type SourceTier = 'public' | 'private';

export interface SourceDef {
  id: 'edgar' | 'exchange-halts' | 'fed-releases' | 'benzinga';
  tier: SourceTier;
  label: string;
  enabled: boolean;
}

export const SOURCES: readonly SourceDef[] = [
  { id: 'edgar', tier: 'public', label: 'SEC EDGAR filings', enabled: true },
  { id: 'exchange-halts', tier: 'public', label: 'Exchange trading halts', enabled: false },
  { id: 'fed-releases', tier: 'public', label: 'Federal economic releases', enabled: false },
  // Benzinga stream via Alpaca. Licensed for personal consumption only —
  // serving it to visitors is redistribution.
  { id: 'benzinga', tier: 'private', label: 'Benzinga via Alpaca', enabled: false },
];

/**
 * Private-tier sources are served only when PUBLIC_FEED is exactly the
 * string 'false' (the tailnet build sets it; the public deploy sets
 * nothing, and absence IS the public configuration).
 */
export function servableSources(
  publicFeedEnv: string | undefined,
  sources: readonly SourceDef[] = SOURCES
): SourceDef[] {
  const includePrivate = publicFeedEnv === 'false';
  return sources.filter((s) => s.enabled && (s.tier === 'public' || includePrivate));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/feed/sources.test.ts`
Expected: PASS (all cases).

- [ ] **Step 5: Full suite, then commit**

```bash
npm test
git add src/lib/feed/sources.ts src/lib/feed/sources.test.ts
git commit -m "feat: source registry with fail-closed public/private gate

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 3: EDGAR Atom parser

**Files:**
- Create: `src/lib/feed/edgar.ts`, `src/lib/feed/edgar.fixture.ts`
- Test: `src/lib/feed/edgar.test.ts`

**Interfaces:**
- Produces: `interface FeedEvent { id: string; source: 'edgar'; form: string; company: string; filedAt: string; url: string }`; `function parseEdgarAtom(xml: string): FeedEvent[]`; `const FIXTURE_ATOM: string` (in `edgar.fixture.ts` — its own module, NOT the test file, so Task 6's test can import it without re-registering these tests). (Task 4 adds `fetchEdgarEvents` to `edgar.ts`.)

- [ ] **Step 1: Write the fixture module and the failing test**

```ts
// src/lib/feed/edgar.fixture.ts
// Trimmed from a real browse-edgar?action=getcurrent&output=atom response.
// Third entry is deliberately malformed (no <updated>) and must be skipped.
export const FIXTURE_ATOM = `<?xml version="1.0" encoding="ISO-8859-1" ?>
<feed xmlns="http://www.w3.org/2005/Atom">
<title>Latest Filings - Sun, 24 Aug 2026 12:40:00 EDT</title>
<entry>
<title>8-K - ACME HOLDINGS &amp; CO (0000123456) (Filer)</title>
<link rel="alternate" type="text/html" href="https://www.sec.gov/Archives/edgar/data/123456/000012345626000042-index.htm"/>
<summary type="html">&lt;b&gt;Filed:&lt;/b&gt; 2026-08-24</summary>
<updated>2026-08-24T12:34:56-04:00</updated>
<category scheme="https://www.sec.gov/" label="form type" term="8-K"/>
<id>urn:tag:sec.gov,2008:accession-number=0000123456-26-000042</id>
</entry>
<entry>
<title>4 - Doe Jane (0000987654) (Reporting)</title>
<link rel="alternate" type="text/html" href="https://www.sec.gov/Archives/edgar/data/987654/000098765426000007-index.htm"/>
<summary type="html">&lt;b&gt;Filed:&lt;/b&gt; 2026-08-24</summary>
<updated>2026-08-24T12:30:00-04:00</updated>
<category scheme="https://www.sec.gov/" label="form type" term="4"/>
<id>urn:tag:sec.gov,2008:accession-number=0000987654-26-000007</id>
</entry>
<entry>
<title>10-Q - BROKEN ENTRY INC (0000111111) (Filer)</title>
<category scheme="https://www.sec.gov/" label="form type" term="10-Q"/>
<id>urn:tag:sec.gov,2008:accession-number=0000111111-26-000001</id>
</entry>
</feed>`;
```

```ts
// src/lib/feed/edgar.test.ts
import { describe, expect, it } from 'vitest';
import { parseEdgarAtom } from './edgar';
import { FIXTURE_ATOM } from './edgar.fixture';

describe('parseEdgarAtom', () => {
  const events = parseEdgarAtom(FIXTURE_ATOM);

  it('parses well-formed entries and skips malformed ones', () => {
    expect(events).toHaveLength(2);
  });

  it('extracts the fields, decoding entities and stripping title decoration', () => {
    expect(events[0]).toEqual({
      id: 'urn:tag:sec.gov,2008:accession-number=0000123456-26-000042',
      source: 'edgar',
      form: '8-K',
      company: 'ACME HOLDINGS & CO',
      filedAt: '2026-08-24T12:34:56-04:00',
      url: 'https://www.sec.gov/Archives/edgar/data/123456/000012345626000042-index.htm',
    });
  });

  it('handles the Form 4 reporting-person shape', () => {
    expect(events[1].form).toBe('4');
    expect(events[1].company).toBe('Doe Jane');
  });

  it('returns [] on garbage input rather than throwing', () => {
    expect(parseEdgarAtom('')).toEqual([]);
    expect(parseEdgarAtom('<html>not a feed</html>')).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/feed/edgar.test.ts`
Expected: FAIL — cannot resolve `./edgar`.

- [ ] **Step 3: Write the implementation**

```ts
// src/lib/feed/edgar.ts
// EDGAR "current events" Atom feed → FeedEvent[]. Hand-rolled parse on
// purpose: Cloudflare Workers have no DOMParser, and the getcurrent feed's
// shape is stable and flat. Tolerant by design — a malformed entry is
// dropped, never thrown on, so one bad entry can't blank the feed.

export interface FeedEvent {
  id: string;
  source: 'edgar';
  form: string;
  company: string;
  filedAt: string; // ISO-8601, straight from the entry's <updated>
  url: string;
}

const ENTITY: Record<string, string> = {
  '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'", '&apos;': "'",
};
const decode = (s: string): string =>
  s.replace(/&(?:amp|lt|gt|quot|#39|apos);/g, (m) => ENTITY[m]);

const pick = (block: string, re: RegExp): string | undefined => {
  const value = re.exec(block)?.[1]?.trim();
  return value || undefined;
};

export function parseEdgarAtom(xml: string): FeedEvent[] {
  const events: FeedEvent[] = [];
  for (const [, block] of xml.matchAll(/<entry>([\s\S]*?)<\/entry>/g)) {
    const form = pick(block, /<category[^>]*\bterm="([^"]*)"/);
    const title = pick(block, /<title>([\s\S]*?)<\/title>/);
    const filedAt = pick(block, /<updated>([^<]*)<\/updated>/);
    const url = pick(block, /<link[^>]*\bhref="([^"]*)"/);
    const id = pick(block, /<id>([^<]*)<\/id>/);
    if (!form || !title || !filedAt || !url || !id) continue;

    // Title shape: "8-K - ACME HOLDINGS & CO (0000123456) (Filer)".
    let company = decode(title);
    if (company.startsWith(`${form} - `)) company = company.slice(form.length + 3);
    company = company.replace(/\s*\(\d{10}\)\s*(\([^)]*\))?\s*$/, '').trim();

    events.push({ id, source: 'edgar', form, company, filedAt, url: decode(url) });
  }
  return events;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/feed/edgar.test.ts`
Expected: PASS.

- [ ] **Step 5: Full suite, then commit**

```bash
npm test
git add src/lib/feed/edgar.ts src/lib/feed/edgar.fixture.ts src/lib/feed/edgar.test.ts
git commit -m "feat: EDGAR getcurrent Atom parser

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 4: EDGAR fetch wrapper

**Files:**
- Modify: `src/lib/feed/edgar.ts` (append)
- Test: `src/lib/feed/edgar.test.ts` (append)

**Interfaces:**
- Consumes: `parseEdgarAtom` (Task 3, same file).
- Produces: `const EDGAR_URL: string`; `const EDGAR_USER_AGENT: string`; `async function fetchEdgarEvents(fetchImpl?: typeof fetch): Promise<FeedEvent[]>`.

- [ ] **Step 1: Append the failing tests**

```ts
// append to src/lib/feed/edgar.test.ts — add fetchEdgarEvents and
// EDGAR_USER_AGENT to the existing import from './edgar' (FIXTURE_ATOM
// is already imported from './edgar.fixture')
describe('fetchEdgarEvents', () => {
  it('hits getcurrent with the mandatory User-Agent and parses the body', async () => {
    let seenUrl = '';
    let seenUa = '';
    const fetchImpl = (async (url: string | URL | Request, init?: RequestInit) => {
      seenUrl = String(url);
      seenUa = (init?.headers as Record<string, string>)['User-Agent'];
      return new Response(FIXTURE_ATOM, { status: 200 });
    }) as typeof fetch;

    const events = await fetchEdgarEvents(fetchImpl);
    expect(seenUrl).toContain('action=getcurrent');
    expect(seenUrl).toContain('output=atom');
    expect(seenUa).toBe(EDGAR_USER_AGENT);
    expect(EDGAR_USER_AGENT).toContain('wolf@wearefeasting.com');
    expect(events).toHaveLength(2);
  });

  it('throws on a non-200 so callers can fail the response', async () => {
    const fetchImpl = (async () => new Response('slow down', { status: 429 })) as typeof fetch;
    await expect(fetchEdgarEvents(fetchImpl)).rejects.toThrow('429');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/feed/edgar.test.ts`
Expected: FAIL — `fetchEdgarEvents` not exported.

- [ ] **Step 3: Append the implementation**

```ts
// append to src/lib/feed/edgar.ts
export const EDGAR_URL =
  'https://www.sec.gov/cgi-bin/browse-edgar?action=getcurrent&output=atom&count=100';

// Mandatory per EDGAR access policy: identify yourself with real contact
// info. Exceeding 10 req/sec or omitting this gets the IP banned outright.
export const EDGAR_USER_AGENT = 'whatupwolf.com wolf@wearefeasting.com';

export async function fetchEdgarEvents(fetchImpl: typeof fetch = fetch): Promise<FeedEvent[]> {
  const res = await fetchImpl(EDGAR_URL, {
    headers: { 'User-Agent': EDGAR_USER_AGENT },
  });
  if (!res.ok) throw new Error(`EDGAR responded ${res.status}`);
  return parseEdgarAtom(await res.text());
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/feed/edgar.test.ts`
Expected: PASS.

- [ ] **Step 5: Full suite, then commit**

```bash
npm test
git add src/lib/feed/edgar.ts src/lib/feed/edgar.test.ts
git commit -m "feat: EDGAR fetch wrapper with mandatory User-Agent

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 5: Cloudflare adapter and deploy config

**Files:**
- Modify: `package.json` (via npm install), `astro.config.mjs`, `wrangler.jsonc`
- Create: `src/env.d.ts`

**Interfaces:**
- Produces: on-demand routes possible (`prerender = false`); `App.Locals` typed with `runtime.env.PUBLIC_FEED?: string` for Task 6.

- [ ] **Step 1: Install the adapter**

```bash
npm install @astrojs/cloudflare
```

- [ ] **Step 2: Wire it into astro.config.mjs**

Replace the config with:

```js
// @ts-check
import { defineConfig } from 'astro/config';
import tailwindcss from '@tailwindcss/vite';
import cloudflare from '@astrojs/cloudflare';

import react from '@astrojs/react';

// https://astro.build/config
export default defineConfig({
  site: 'https://whatupwolf.com',

  // Static-first: every page prerenders as before. Only routes that opt out
  // (prerender = false — currently just /api/events) run in the Worker.
  adapter: cloudflare(),

  vite: {
    // cast: @tailwindcss/vite ships Vite types that clash with Astro's bundled Vite
    // version. Cosmetic only — the build is unaffected.
    plugins: [/** @type {any} */ (tailwindcss())],
  },

  integrations: [react()],
});
```

- [ ] **Step 3: Rewrite wrangler.jsonc**

```jsonc
{
  // Deploy whatupwolf on Cloudflare Workers. The build is static-first with
  // the cloudflare adapter: every page prerenders into ./dist as before, and
  // on-demand routes (currently just /api/events) run in the worker the
  // adapter emits at dist/_worker.js. `wrangler deploy` uploads both.
  "$schema": "node_modules/wrangler/config-schema.json",
  "name": "whatupwolf",
  "compatibility_date": "2026-07-17",
  "compatibility_flags": ["nodejs_compat"],
  "main": "./dist/_worker.js/index.js",
  "assets": {
    "directory": "./dist",
    "binding": "ASSETS"
  }
}
```

- [ ] **Step 4: Create src/env.d.ts**

```ts
/// <reference types="astro/client" />

type CloudflareEnv = {
  // Set to the exact string 'false' ONLY on the private/tailnet build.
  // The public deploy sets nothing — absence is the public configuration.
  PUBLIC_FEED?: string;
};
type Runtime = import('@astrojs/cloudflare').Runtime<CloudflareEnv>;

declare namespace App {
  interface Locals extends Runtime {}
}
```

- [ ] **Step 5: Verify build, check, and suite**

Run: `npm run build && npm run check && npm test`
Expected: build completes with every existing page still prerendered, check 0 errors, tests green. If the adapter warns that no route is server-rendered yet, that's expected until Task 6.

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json astro.config.mjs wrangler.jsonc src/env.d.ts
git commit -m "feat: cloudflare adapter — static-first with on-demand API routes

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 6: Events response composer and /api/events endpoint

**Files:**
- Create: `src/lib/feed/events.ts`, `src/pages/api/events.ts`
- Test: `src/lib/feed/events.test.ts`

**Interfaces:**
- Consumes: `servableSources` (Task 2), `fetchEdgarEvents`, `FeedEvent` (Tasks 3–4), `App.Locals.runtime` (Task 5).
- Produces: `async function eventsResponse(publicFeedEnv: string | undefined, fetchImpl?: typeof fetch): Promise<Response>`; route `GET /api/events` → `{ events: FeedEvent[], asOf: string }`.

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/feed/events.test.ts
import { describe, expect, it } from 'vitest';
import { eventsResponse } from './events';
import { FIXTURE_ATOM } from './edgar.fixture';

const okFetch = (async () => new Response(FIXTURE_ATOM, { status: 200 })) as typeof fetch;
const failFetch = (async () => new Response('unavailable', { status: 503 })) as typeof fetch;

describe('eventsResponse', () => {
  it('returns newest-first events with the edge-cache header', async () => {
    const res = await eventsResponse(undefined, okFetch);
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toBe('application/json');
    expect(res.headers.get('Cache-Control')).toBe(
      'public, max-age=15, s-maxage=60, stale-while-revalidate=300'
    );
    const body = await res.json();
    expect(body.events.map((e: { form: string }) => e.form)).toEqual(['8-K', '4']);
    expect(new Date(body.asOf).getTime()).not.toBeNaN();
  });

  it('maps upstream failure to 502 and never caches it', async () => {
    const res = await eventsResponse(undefined, failFetch);
    expect(res.status).toBe(502);
    expect(res.headers.get('Cache-Control')).toBe('no-store');
    expect((await res.json()).error).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/feed/events.test.ts`
Expected: FAIL — cannot resolve `./events`.

- [ ] **Step 3: Write the composer**

```ts
// src/lib/feed/events.ts
import { servableSources } from './sources';
import { fetchEdgarEvents, type FeedEvent } from './edgar';

const JSON_HEADERS = { 'Content-Type': 'application/json' };

/**
 * The whole /api/events response, kept out of the Astro route so it can be
 * tested with an injected fetch. The Cache-Control on success is what keeps
 * EDGAR under its rate limit: Cloudflare's edge serves visitor polls for
 * 60s (and stale for 5 min while revalidating), so the origin fetch runs
 * at most about once a minute per colo.
 */
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
    const events = batches.flat().sort((a, b) => b.filedAt.localeCompare(a.filedAt));
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

- [ ] **Step 4: Write the endpoint**

```ts
// src/pages/api/events.ts
import type { APIRoute } from 'astro';
import { eventsResponse } from '../../lib/feed/events';

export const prerender = false;

export const GET: APIRoute = ({ locals }) =>
  eventsResponse(locals.runtime?.env.PUBLIC_FEED);
```

- [ ] **Step 5: Run tests, check, build**

Run: `npx vitest run src/lib/feed/events.test.ts && npm run check && npm run build`
Expected: tests PASS; check clean; build output now includes the worker bundle (`dist/_worker.js/`) with `/api/events` server-rendered.

- [ ] **Step 6: Validate the wrangler config against the real build output**

Run: `npx wrangler deploy --dry-run`
Expected: dry run succeeds, worker entry found at `dist/_worker.js/index.js`. If the adapter emitted a different entry path, fix `main` in wrangler.jsonc to match what's actually in `dist/` — do not guess.

- [ ] **Step 7: Full suite, then commit**

```bash
npm test
git add src/lib/feed/events.ts src/lib/feed/events.test.ts src/pages/api/events.ts
git commit -m "feat: /api/events — gated, edge-cached EDGAR feed endpoint

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 7: Render helpers and the /feed page

**Files:**
- Create: `src/lib/feed/render.ts`, `src/pages/feed.astro`
- Modify: `src/components/Nav.astro:2-11` (add one item)
- Test: `src/lib/feed/render.test.ts`

**Interfaces:**
- Consumes: `FeedEvent` (Task 3), route `/api/events` (Task 6).
- Produces: `escapeHtml(s: string): string`; `formatFiledAt(iso: string): string`; `formatClock(d: Date): string`; `renderEvents(events: FeedEvent[]): string`.

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/feed/render.test.ts
import { describe, expect, it } from 'vitest';
import { escapeHtml, formatFiledAt, renderEvents } from './render';
import type { FeedEvent } from './edgar';

const event = (over: Partial<FeedEvent> = {}): FeedEvent => ({
  id: 'urn:x',
  source: 'edgar',
  form: '8-K',
  company: 'ACME & CO',
  filedAt: '2026-08-24T12:34:56-04:00',
  url: 'https://www.sec.gov/Archives/x-index.htm',
  ...over,
});

describe('escapeHtml', () => {
  it('escapes every HTML-significant character', () => {
    expect(escapeHtml(`<img src=x onerror="alert('&')">`)).toBe(
      '&lt;img src=x onerror=&quot;alert(&#39;&amp;&#39;)&quot;&gt;'
    );
  });
});

describe('formatFiledAt', () => {
  it('renders in America/Chicago', () => {
    // 12:34:56-04:00 (EDT) is 11:34 in Chicago (CDT).
    expect(formatFiledAt('2026-08-24T12:34:56-04:00')).toContain('11:34');
  });
  it('passes unparseable input through instead of showing Invalid Date', () => {
    expect(formatFiledAt('not-a-date')).toBe('not-a-date');
  });
});

describe('renderEvents', () => {
  it('renders one row per event with form badge and filing link', () => {
    const html = renderEvents([event()]);
    expect(html).toContain('8-K');
    expect(html).toContain('ACME &amp; CO');
    expect(html).toContain('href="https://www.sec.gov/Archives/x-index.htm"');
  });
  it('escapes hostile field content', () => {
    const html = renderEvents([event({ company: '<script>alert(1)</script>' })]);
    expect(html).not.toContain('<script>alert(1)');
    expect(html).toContain('&lt;script&gt;');
  });
  it('renders an empty state, not an empty list', () => {
    expect(renderEvents([])).toContain('no filings');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/feed/render.test.ts`
Expected: FAIL — cannot resolve `./render`.

- [ ] **Step 3: Write the render helpers**

```ts
// src/lib/feed/render.ts
// Pure string rendering for the /feed page's vanilla client script. Kept
// here (not inline in feed.astro) so the escaping rule is unit-testable —
// everything interpolated into row HTML goes through escapeHtml.
import type { FeedEvent } from './edgar';

const CH: Record<string, string> = {
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
};
export const escapeHtml = (s: string): string => s.replace(/[&<>"']/g, (c) => CH[c]);

const FILED_FMT = new Intl.DateTimeFormat('en-US', {
  timeZone: 'America/Chicago',
  month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false,
});
export function formatFiledAt(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : FILED_FMT.format(d);
}

const CLOCK_FMT = new Intl.DateTimeFormat('en-US', {
  timeZone: 'America/Chicago', hour: '2-digit', minute: '2-digit', hour12: false,
});
export const formatClock = (d: Date): string => CLOCK_FMT.format(d);

export function renderEvents(events: FeedEvent[]): string {
  if (!events.length) return '<li class="py-2 chrome">no filings</li>';
  return events
    .map(
      (e) => `<li class="py-2 flex items-baseline gap-3">
  <span class="chrome shrink-0">${escapeHtml(formatFiledAt(e.filedAt))}</span>
  <span class="chrome shrink-0 rounded border border-[var(--color-line)] px-1">${escapeHtml(e.form)}</span>
  <a href="${escapeHtml(e.url)}" target="_blank" rel="noopener noreferrer"
     class="text-[var(--color-ink)] hover:text-[var(--color-accent)] transition-colors">${escapeHtml(e.company)}</a>
</li>`
    )
    .join('\n');
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/feed/render.test.ts`
Expected: PASS.

- [ ] **Step 5: Write the page**

```astro
---
// src/pages/feed.astro
import Base from '../layouts/Base.astro';
---
<Base title="Feed — whatupwolf" description="Live public market feed — SEC EDGAR filings.">
  <h1 class="text-2xl font-semibold tracking-tight">Feed</h1>
  <p class="mt-3 text-[var(--color-muted)] leading-relaxed">
    Latest SEC EDGAR filings, refreshed every minute. Public sources only.
  </p>
  <p id="feed-status" class="chrome mt-6" aria-live="polite">loading…</p>
  <ol id="feed-list" class="mt-2 divide-y divide-[var(--color-line)]"></ol>
</Base>

<script>
  // Vanilla fetch loop, no island — see CLAUDE.md. Astro bundles this
  // (which is how the render-helper imports work); it ships no framework.
  import { renderEvents, formatClock } from '../lib/feed/render';

  const list = document.getElementById('feed-list')!;
  const status = document.getElementById('feed-status')!;
  let lastGood: string | null = null;

  async function poll() {
    try {
      const res = await fetch('/api/events');
      if (!res.ok) throw new Error(String(res.status));
      const { events } = await res.json();
      list.innerHTML = renderEvents(events);
      lastGood = formatClock(new Date());
      status.textContent = `updated ${lastGood} (America/Chicago)`;
    } catch {
      // Keep the last good list on a failed poll; just mark it stale.
      status.textContent = lastGood
        ? `updated ${lastGood} — stale, retrying`
        : 'feed unavailable — retrying';
    }
  }

  poll();
  setInterval(poll, 60_000);
</script>
```

- [ ] **Step 6: Add the nav item**

In `src/components/Nav.astro`, insert into the `items` array after the Tools entry:

```js
  { href: '/feed', label: 'Feed' },
```

- [ ] **Step 7: Verify check and build**

Run: `npm run check && npm run build`
Expected: clean; `/feed` prerenders as a static page.

- [ ] **Step 8: See it running**

Run: `npm run dev` (background), then `curl -s http://localhost:4321/api/events | head -c 400` and open `http://localhost:4321/feed`.
Expected: JSON with real EDGAR events (this hits EDGAR once — fine); the page renders rows. Note: outside EDGAR business hours the feed may legitimately be sparse. Kill the dev server after.

- [ ] **Step 9: Full suite, then commit**

```bash
npm test
git add src/lib/feed/render.ts src/lib/feed/render.test.ts src/pages/feed.astro src/components/Nav.astro
git commit -m "feat: /feed page — polling list of EDGAR filings

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 8: Guard carve-out for the licensing boundary

The guard's `src/lib/*` allowlist arm is a bash `case` glob, which matches subdirectories — so without this, `src/lib/feed/sources.ts` would sit in the machine's Tier B self-merge zone.

**Files:**
- Modify: `.github/workflows/guard.yml` (the `Evaluate against allowlist` step's `case`, and the header comment)
- Test: `.github/workflows/guard.test.mjs`, `engine/guard-workflow.test.mjs` (both append)

**Interfaces:**
- Consumes: the existing `evaluate()` helpers in both test files.

- [ ] **Step 1: Append the failing tests**

In `.github/workflows/guard.test.mjs`, after the sanitizer describe block:

```js
// Same trap, second door. src/lib/feed/sources.ts is the licensing boundary:
// it decides whether licensed (private-tier) sources can be served to
// visitors. The src/lib/* arm globs into subdirectories, so without a
// carve-out a machine PR could widen the gate and self-merge on green CI.
describe('guard allowlist — the licensing boundary is carved out of src/lib/*', () => {
  it('flags src/lib/feed/sources.ts as needs-human', () => {
    const { allowed, log } = evaluate(['src/lib/feed/sources.ts']);
    expect(allowed).toBe(false);
    expect(log).toContain('protected (licensing boundary): src/lib/feed/sources.ts');
  });

  it('flags the gate test alongside the gate', () => {
    expect(evaluate(['src/lib/feed/sources.test.ts']).allowed).toBe(false);
  });

  it('keeps the rest of src/lib/feed/ in-zone', () => {
    expect(evaluate(['src/lib/feed/edgar.ts', 'src/lib/feed/render.ts']).allowed).toBe(true);
  });

  it('places the licensing arm before the src/lib/* allowlist arm', () => {
    const arm = RUN_BLOCK.indexOf('src/lib/feed/sources*)');
    const allowArm = RUN_BLOCK.indexOf('src/lib/*)');
    expect(arm).toBeGreaterThanOrEqual(0);
    expect(arm).toBeLessThan(allowArm);
  });
});
```

In `engine/guard-workflow.test.mjs`, inside the `allowlist evaluation` describe:

```js
  it('protects the licensing boundary carved out of src/lib/*', () => {
    expect(evaluate(['src/lib/feed/sources.ts'])).toBe('0');
    expect(evaluate(['src/lib/feed/edgar.ts'])).toBe('1');
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run .github/workflows/guard.test.mjs engine/guard-workflow.test.mjs`
Expected: the new cases FAIL (sources.ts currently evaluates as allowed); existing cases still pass.

- [ ] **Step 3: Add the arm to guard.yml**

In the `Evaluate against allowlist` step's `case`, insert between the sanitize arm and the allowlist arm:

```yaml
              src/lib/sanitize*) echo "protected (leak guard): $f"; allowed=0 ;;
              src/lib/feed/sources*) echo "protected (licensing boundary): $f"; allowed=0 ;;
              src/content/lab/*|engine/*|src/lib/*) ;;
```

And extend the header comment's carve-out paragraph (after the sanitize WHY paragraph):

```yaml
# src/lib/feed/sources* is carved out for the same reason: it is the
# licensing boundary deciding which market-data sources may be served to
# visitors (see CLAUDE.md). A machine PR must never be able to widen it
# and self-merge.
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run .github/workflows/guard.test.mjs engine/guard-workflow.test.mjs`
Expected: PASS, all cases in both files.

- [ ] **Step 5: Full suite, then commit**

```bash
npm test
git add .github/workflows/guard.yml .github/workflows/guard.test.mjs engine/guard-workflow.test.mjs
git commit -m "feat: carve the licensing boundary out of the guard's auto-merge zone

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 9: Final verification and PR

**Files:** none new.

- [ ] **Step 1: Full local verification**

Run: `npm test && npm run check && npm run build && npx wrangler deploy --dry-run`
Expected: everything green, dry-run deploy valid.

- [ ] **Step 2: Push and open the PR**

```bash
git push -u origin feat/public-market-feed
gh pr create --title "feat: public market feed v1 — EDGAR-direct /feed and /api/events" --body "$(cat <<'EOF'
Ships the public read surface of the market feed per
docs/superpowers/specs/2026-08-24-public-market-feed-design.md:

- `src/lib/feed/sources.ts` — source registry with the fail-closed
  public/private gate (the licensing boundary from CLAUDE.md)
- `src/lib/feed/edgar.ts` — EDGAR getcurrent Atom parser + fetch with
  the mandatory User-Agent
- `/api/events` — on-demand route, edge-cached (s-maxage=60 + SWR) so
  EDGAR sees ≤ ~1 req/min per colo
- `/feed` — prerendered page with a vanilla 60s polling script
- `@astrojs/cloudflare` adapter: all existing pages stay static; only
  the endpoint runs in the worker
- Guard: `src/lib/feed/sources*` carved out of the Tier B self-merge
  zone, tested in both guard suites

Touches protected paths (.github/**, astro.config.mjs, wrangler.jsonc,
package.json) — needs-human merge by design.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

- [ ] **Step 3: Confirm CI**

Run: `gh pr checks --watch`
Expected: CI green. The guard will label the PR needs-human (it touches `.github/**`) — that's correct behavior, Wolf merges manually.

**Post-merge, one manual step for Wolf:** confirm the Workers Builds pipeline (or `npx wrangler deploy`) picks up the new worker entry on the next deploy, and that `https://whatupwolf.com/api/events` returns JSON with `cf-cache-status` headers showing edge caching.
