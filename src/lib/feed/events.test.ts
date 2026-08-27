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
