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
