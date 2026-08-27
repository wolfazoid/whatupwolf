// EDGAR "current events" Atom feed → FeedEvent[]. Hand-rolled parse on
// purpose: Cloudflare Workers have no DOMParser, and the getcurrent feed's
// shape is stable and flat. Tolerant by design — a malformed entry is
// dropped, never thrown on, so one bad entry can't blank the feed.

export interface FeedEvent {
  id: string;
  source: 'edgar';
  form: string;
  company: string;
  cik: string; // 10-digit zero-padded, '' when the entry title carries none
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
    const cik = /\((\d{10})\)/.exec(company)?.[1] ?? '';
    company = company.replace(/\s*\(\d{10}\)\s*(\([^)]*\))?\s*$/, '').trim();

    events.push({ id, source: 'edgar', form, company, cik, filedAt, url: decode(url) });
  }
  return events;
}

export const EDGAR_URL =
  'https://www.sec.gov/cgi-bin/browse-edgar?action=getcurrent&output=atom&count=100';

// Mandatory per EDGAR access policy: identify yourself with real contact
// info. Exceeding 10 req/sec or omitting this gets the IP banned outright.
export const EDGAR_USER_AGENT = 'whatupwolf.com wolf@wearefeasting.com';

export async function fetchEdgarEvents(fetchImpl: typeof fetch = fetch): Promise<FeedEvent[]> {
  const res = await fetchImpl(EDGAR_URL, {
    headers: { 'User-Agent': EDGAR_USER_AGENT },
    // Cloudflare-specific: cache the EDGAR subrequest at the edge for 60s so
    // visitor polls don't relay 1:1 to EDGAR (the Worker's own response is
    // never edge-cached; s-maxage on it only reaches browsers). Ignored by
    // non-Cloudflare runtimes and by injected test fetches.
    cf: { cacheTtl: 60, cacheEverything: true },
  } as RequestInit);
  if (!res.ok) throw new Error(`EDGAR responded ${res.status}`);
  return parseEdgarAtom(await res.text());
}
