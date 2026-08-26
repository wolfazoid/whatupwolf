import { describe, expect, it } from 'vitest';
import { eventsResponse } from './events';
import { FIXTURE_ATOM } from './edgar.fixture';

const okFetch = (async () => new Response(FIXTURE_ATOM, { status: 200 })) as typeof fetch;
const failFetch = (async () => new Response('unavailable', { status: 503 })) as typeof fetch;

// Entries deliberately in oldest-first *document* order — the opposite of
// FIXTURE_ATOM, which already happens to be newest-first and so can't catch
// a missing/reversed sort on its own. This proves eventsResponse sorts by
// filedAt rather than merely preserving upstream order.
const OUT_OF_ORDER_ATOM = `<?xml version="1.0" encoding="ISO-8859-1" ?>
<feed xmlns="http://www.w3.org/2005/Atom">
<entry>
<title>10-Q - OLDER FIRST INC (0000111111) (Filer)</title>
<link rel="alternate" type="text/html" href="https://www.sec.gov/Archives/edgar/data/111111/index.htm"/>
<updated>2026-08-24T10:00:00-04:00</updated>
<category scheme="https://www.sec.gov/" label="form type" term="10-Q"/>
<id>urn:tag:sec.gov,2008:accession-number=0000111111-26-000001</id>
</entry>
<entry>
<title>8-K - NEWER SECOND CORP (0000222222) (Filer)</title>
<link rel="alternate" type="text/html" href="https://www.sec.gov/Archives/edgar/data/222222/index.htm"/>
<updated>2026-08-24T14:00:00-04:00</updated>
<category scheme="https://www.sec.gov/" label="form type" term="8-K"/>
<id>urn:tag:sec.gov,2008:accession-number=0000222222-26-000002</id>
</entry>
</feed>`;
const outOfOrderFetch = (async () =>
  new Response(OUT_OF_ORDER_ATOM, { status: 200 })) as typeof fetch;

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

  it('sorts events newest-first even when the source returns them oldest-first', async () => {
    const res = await eventsResponse(undefined, outOfOrderFetch);
    const body = await res.json();
    expect(body.events.map((e: { company: string }) => e.company)).toEqual([
      'NEWER SECOND CORP',
      'OLDER FIRST INC',
    ]);
  });

  it('maps upstream failure to 502 and never caches it', async () => {
    const res = await eventsResponse(undefined, failFetch);
    expect(res.status).toBe(502);
    expect(res.headers.get('Cache-Control')).toBe('no-store');
    expect((await res.json()).error).toBeTruthy();
  });
});
