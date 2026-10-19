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
