// Deterministic health probe for a single site. Collects hard facts only —
// statuses, timings, byte counts, cert dates — and never interprets them; the
// judgment ("TTFB up 40% w/w") is the report writer's job, downstream.
//
// Everything it touches is injectable (fetch, tls.connect, the clocks) so the
// aggregation is unit-testable without a network — see site-health.test.mjs.
import tls from 'node:tls';

// The routes we consider load-bearing. Probed in this order, always.
export const KEY_ROUTES = ['/', '/lab', '/work', '/writing', '/rss.xml'];

// The three headers §2 of the spec asks about, mapped to the Findings keys.
const HEADER_KEYS = {
  csp: 'content-security-policy',
  hsts: 'strict-transport-security',
  xcto: 'x-content-type-options',
};

const REQUEST_TIMEOUT_MS = 10_000;
// A crawl cap so one link-heavy page can't turn a weekly audit into an hour of
// requests. Anything past the cap is dropped from the check, not silently
// reported as healthy — `linksChecked` vs `linksFound` shows the operator the gap.
const MAX_LINKS = 100;

// Pulls <a href> targets out of raw HTML and resolves them against the page URL.
// Deliberately a regex and not a parser: the engine runs with no dependencies,
// and we only need hrefs, not a DOM. Fragments, mailto:/tel:/javascript: and
// duplicates are dropped; the hash is stripped so /lab and /lab#top are one link.
export function extractLinks(html, baseUrl) {
  const out = [];
  const seen = new Set();
  const re = /<a\b[^>]*?\bhref\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+))/gi;
  for (const m of String(html).matchAll(re)) {
    const raw = (m[1] ?? m[2] ?? m[3] ?? '').trim();
    if (!raw || raw.startsWith('#')) continue;
    if (/^(mailto|tel|javascript|data):/i.test(raw)) continue;
    let url;
    try {
      url = new URL(raw, baseUrl);
    } catch {
      continue; // unparseable href — not a broken link, just not a link
    }
    if (url.protocol !== 'http:' && url.protocol !== 'https:') continue;
    url.hash = '';
    const href = url.toString();
    if (seen.has(href)) continue;
    seen.add(href);
    out.push(href);
  }
  return out;
}

// Counts referenced assets on the page: scripts, stylesheets/other <link>s, and
// images. A count, not a byte total — measuring asset weight means fetching them
// all, which is out of scope for a lightweight weekly probe (spec §2).
export function countAssets(html) {
  const re = /<(?:script|img)\b[^>]*?\bsrc\s*=\s*(?:"[^"]*"|'[^']*'|[^\s"'>]+)|<link\b[^>]*?\bhref\s*=\s*(?:"[^"]*"|'[^']*'|[^\s"'>]+)/gi;
  return [...String(html).matchAll(re)].length;
}

// Whole days between now and a cert's `valid_to` ("Aug 15 12:00:00 2026 GMT").
// Floored, so "0" means it expires sometime today and negatives mean expired.
export function daysUntil(validTo, nowMs) {
  const expiry = Date.parse(validTo);
  if (Number.isNaN(expiry)) return null;
  return Math.floor((expiry - nowMs) / 86_400_000);
}

// Reads the peer certificate by opening a TLS connection and closing it as soon
// as the handshake completes — no HTTP request is sent. `connect` is injected so
// tests can hand back a fake socket instead of dialing out.
function readCertificate(hostname, port, connect) {
  return new Promise((resolve, reject) => {
    let settled = false;
    const done = (fn, arg) => {
      if (settled) return;
      settled = true;
      fn(arg);
    };
    const socket = connect({ host: hostname, port, servername: hostname, timeout: REQUEST_TIMEOUT_MS }, () => {
      const cert = socket.getPeerCertificate();
      socket.end();
      done(resolve, cert);
    });
    socket.on('error', (err) => done(reject, err));
    socket.on('timeout', () => {
      socket.destroy();
      done(reject, new Error(`TLS handshake to ${hostname}:${port} timed out`));
    });
  });
}

// One request, timed. TTFB is the time until the response headers land — Node's
// fetch resolves exactly then, before the body streams — so awaiting it is the
// measurement. Network failures are data, not exceptions: they come back as
// status 0 so a dead route shows up in the Findings instead of aborting the run.
async function timedFetch(url, { fetchImpl, monotonic, method = 'GET' }) {
  const started = monotonic();
  try {
    const res = await fetchImpl(url, {
      method,
      redirect: 'follow',
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    return { res, status: res.status, ttfbMs: Math.round(monotonic() - started) };
  } catch {
    return { res: null, status: 0, ttfbMs: Math.round(monotonic() - started) };
  }
}

/**
 * Audit `target` and return Findings:
 *   { routes: [{path, status, ttfbMs}], ssl: {daysToExpiry, validTo},
 *     brokenLinks: [{url, status}], headers: {csp, hsts, xcto},
 *     pageWeight: {htmlBytes, assetCount} }
 *
 * Never throws on a site problem — an unreachable route, a failed handshake and a
 * dead link are all findings. It only throws if `target` isn't a usable URL.
 */
export async function probe(target, {
  fetchImpl = fetch,
  tlsConnect = tls.connect,
  monotonic = () => performance.now(),
  now = () => Date.now(),
  maxLinks = MAX_LINKS,
} = {}) {
  const base = new URL(target);

  // Key routes, in KEY_ROUTES order — probed sequentially so one route's timing
  // isn't inflated by the others competing for the same connection.
  const routes = [];
  let homepageHtml = '';
  let homepageHeaders = null;
  for (const path of KEY_ROUTES) {
    const url = new URL(path, base).toString();
    const { res, status, ttfbMs } = await timedFetch(url, { fetchImpl, monotonic });
    routes.push({ path, status, ttfbMs });
    if (path === '/' && res) {
      homepageHeaders = res.headers;
      try {
        homepageHtml = await res.text();
      } catch {
        homepageHtml = ''; // headers arrived but the body didn't — timing still counts
      }
    }
  }

  const headers = {};
  for (const [key, name] of Object.entries(HEADER_KEYS)) {
    headers[key] = homepageHeaders ? homepageHeaders.get(name) != null : false;
  }

  const pageWeight = {
    htmlBytes: Buffer.byteLength(homepageHtml, 'utf8'),
    assetCount: countAssets(homepageHtml),
  };

  // Broken-link crawl: homepage links only (spec §10 settled it at depth 1).
  // HEAD first — it's cheap — and retry with GET when a server refuses the verb
  // rather than reporting a perfectly good page as broken.
  const links = extractLinks(homepageHtml, base.toString());
  const checked = links.slice(0, maxLinks);
  const brokenLinks = [];
  for (const url of checked) {
    let { status } = await timedFetch(url, { fetchImpl, monotonic, method: 'HEAD' });
    if (status === 405 || status === 501 || status === 0) {
      ({ status } = await timedFetch(url, { fetchImpl, monotonic, method: 'GET' }));
    }
    if (status < 200 || status > 299) brokenLinks.push({ url, status });
  }
  brokenLinks.sort((a, b) => a.url.localeCompare(b.url));

  // SSL only means something over https; plain http reports nulls rather than
  // pretending a cert it never saw is fine.
  let ssl = { daysToExpiry: null, validTo: null };
  if (base.protocol === 'https:') {
    try {
      const port = base.port ? Number(base.port) : 443;
      const cert = await readCertificate(base.hostname, port, tlsConnect);
      const validTo = cert?.valid_to ?? null;
      ssl = { daysToExpiry: validTo ? daysUntil(validTo, now()) : null, validTo };
    } catch {
      ssl = { daysToExpiry: null, validTo: null };
    }
  }

  return {
    routes,
    ssl,
    brokenLinks,
    headers,
    pageWeight,
    linksFound: links.length,
    linksChecked: checked.length,
  };
}
