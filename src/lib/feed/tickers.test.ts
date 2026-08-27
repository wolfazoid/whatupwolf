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
