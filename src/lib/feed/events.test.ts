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
