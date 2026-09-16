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

// Matches both real index-page shapes: "Item 5.02: …" rows (a filing's own
// -index.htm) and "Current report, items 2.02 and 9.01" prose (EDGAR's
// company filing list pages).
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
