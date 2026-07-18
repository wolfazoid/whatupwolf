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

// Every request identifies itself. The probe is safe-by-construction if it is
// ever pointed at a permitted third-party site: an operator reading their access
// log can see exactly who we are and where to complain.
export const USER_AGENT = 'whatupwolf-site-health/1.0 (+https://whatupwolf.com)';
// The product token robots.txt groups are matched against (RFC 9309 §2.2.1).
export const UA_TOKEN = 'whatupwolf-site-health';

const REQUEST_TIMEOUT_MS = 10_000;
// Minimum gap between two requests. One request in flight at a time (the limiter
// serialises) plus a second of spacing keeps us far below anything that could
// look like load, at the cost of a few minutes on a weekly run.
const REQUEST_INTERVAL_MS = 1_000;
// Rule set meaning "we were told not to fetch anything here".
const DISALLOW_ALL = [{ allow: false, pattern: '/' }];
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

// Parses robots.txt into the rule list that applies to `uaToken`. Groups are
// keyed by their User-agent lines (consecutive ones share a group, per RFC 9309
// §2.2.1); a group matches when its name is a case-insensitive substring of our
// product token. A specific match wins outright — if any group names us, the
// wildcard group is ignored entirely rather than merged in.
export function parseRobots(text, uaToken = UA_TOKEN) {
  const groups = []; // [{ agents:Set, rules:[] }]
  let current = null;
  let collectingAgents = false;
  for (const rawLine of String(text).split(/\r?\n/)) {
    const line = rawLine.replace(/#.*$/, '').trim();
    if (!line) continue;
    const idx = line.indexOf(':');
    if (idx === -1) continue;
    const field = line.slice(0, idx).trim().toLowerCase();
    const value = line.slice(idx + 1).trim();
    if (field === 'user-agent') {
      if (!collectingAgents) {
        current = { agents: new Set(), rules: [] };
        groups.push(current);
        collectingAgents = true;
      }
      current.agents.add(value.toLowerCase());
      continue;
    }
    if (field !== 'allow' && field !== 'disallow') continue;
    collectingAgents = false;
    if (!current) continue; // a rule before any User-agent line belongs to nobody
    // An empty Disallow is the documented way to say "allow everything" — it is
    // an absence of a rule, not a rule matching the empty path.
    if (field === 'disallow' && value === '') continue;
    if (value === '') continue;
    current.rules.push({ allow: field === 'allow', pattern: value });
  }

  const token = String(uaToken).toLowerCase();
  const specific = groups.filter((g) => [...g.agents].some((a) => a !== '*' && a !== '' && token.includes(a)));
  const chosen = specific.length ? specific : groups.filter((g) => g.agents.has('*'));
  return chosen.flatMap((g) => g.rules);
}

// robots.txt patterns are literal prefixes with two wildcards: `*` (any run of
// characters) and a trailing `$` (end of path).
function ruleMatcher(pattern) {
  const anchored = pattern.endsWith('$');
  const body = anchored ? pattern.slice(0, -1) : pattern;
  const source = body.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*');
  return new RegExp(`^${source}${anchored ? '$' : ''}`);
}

// Longest matching pattern wins; Allow wins a tie, and an unmatched path is
// allowed (RFC 9309 §2.2.2). No rules at all therefore means "fetch freely".
export function isAllowed(rules, path) {
  let best = null;
  for (const rule of rules) {
    if (!ruleMatcher(rule.pattern).test(path)) continue;
    if (
      !best ||
      rule.pattern.length > best.pattern.length ||
      (rule.pattern.length === best.pattern.length && rule.allow)
    ) {
      best = rule;
    }
  }
  return best ? best.allow : true;
}

// Serialises requests and spaces them by at least `minIntervalMs`. Awaiting the
// returned gate before each fetch gives us both halves of politeness at once: a
// concurrency cap of one, and a floor on the request rate. `sleep`/`monotonic`
// are injected so tests can assert the spacing without waiting for it.
export function createRateLimiter({
  minIntervalMs = REQUEST_INTERVAL_MS,
  sleep = (ms) => new Promise((r) => setTimeout(r, ms)),
  monotonic = () => performance.now(),
} = {}) {
  let previous = null;
  let chain = Promise.resolve();
  return () => {
    chain = chain.then(async () => {
      if (previous !== null) {
        const wait = minIntervalMs - (monotonic() - previous);
        if (wait > 0) await sleep(wait);
      }
      previous = monotonic();
    });
    return chain;
  };
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
async function timedFetch(url, { fetchImpl, monotonic, gate, method = 'GET' }) {
  if (gate) await gate();
  const started = monotonic();
  try {
    const res = await fetchImpl(url, {
      method,
      redirect: 'follow',
      headers: { 'user-agent': USER_AGENT },
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
 *     pageWeight: {htmlBytes, assetCount}, robotsSkipped: [url] }
 *
 * Good-citizen defaults, on by default and not overridable per-call: every
 * request carries USER_AGENT, robots.txt is honoured per origin (a disallowed
 * route reports `{status: null, skipped: 'robots'}` and lands in robotsSkipped),
 * and a rate limiter serialises requests with a gap between them.
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
  sleep,
  minIntervalMs = REQUEST_INTERVAL_MS,
  userAgentToken = UA_TOKEN,
} = {}) {
  const base = new URL(target);
  const gate = createRateLimiter({ minIntervalMs, sleep, monotonic });

  // robots.txt, per origin, fetched once and remembered. External links get the
  // same treatment as the target — the crawl leaves an origin's own rules in
  // charge of whether we touch it at all.
  const robotsByOrigin = new Map();
  async function rulesFor(origin) {
    if (!robotsByOrigin.has(origin)) {
      const { res, status } = await timedFetch(`${origin}/robots.txt`, { fetchImpl, monotonic, gate });
      let rules = [];
      if (status >= 200 && status <= 299) {
        try {
          rules = parseRobots(await res.text(), userAgentToken);
        } catch {
          rules = []; // headers arrived, body didn't — no policy to honour
        }
      } else if (status >= 500) {
        // RFC 9309 §2.3.1.4: an unavailable robots.txt means stay out entirely.
        // A 4xx or an unreachable host means no policy was ever published, which
        // is the ordinary "crawl freely" case — including our own site being down.
        rules = DISALLOW_ALL;
      }
      robotsByOrigin.set(origin, rules);
    }
    return robotsByOrigin.get(origin);
  }
  async function allowedToFetch(url) {
    const u = new URL(url);
    return isAllowed(await rulesFor(u.origin), `${u.pathname}${u.search}`);
  }

  // Key routes, in KEY_ROUTES order — probed sequentially so one route's timing
  // isn't inflated by the others competing for the same connection.
  const routes = [];
  const robotsSkipped = [];
  let homepageHtml = '';
  let homepageHeaders = null;
  for (const path of KEY_ROUTES) {
    const url = new URL(path, base).toString();
    // A skipped route reports null rather than 0: "we didn't look" and "it was
    // unreachable" are different findings and must not be confused downstream.
    if (!(await allowedToFetch(url))) {
      routes.push({ path, status: null, ttfbMs: null, skipped: 'robots' });
      robotsSkipped.push(url);
      continue;
    }
    const { res, status, ttfbMs } = await timedFetch(url, { fetchImpl, monotonic, gate });
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
  const candidates = links.slice(0, maxLinks);
  const checked = [];
  const brokenLinks = [];
  for (const url of candidates) {
    if (!(await allowedToFetch(url))) {
      robotsSkipped.push(url);
      continue;
    }
    checked.push(url);
    let { status } = await timedFetch(url, { fetchImpl, monotonic, gate, method: 'HEAD' });
    if (status === 405 || status === 501 || status === 0) {
      ({ status } = await timedFetch(url, { fetchImpl, monotonic, gate, method: 'GET' }));
    }
    if (status < 200 || status > 299) brokenLinks.push({ url, status });
  }
  robotsSkipped.sort((a, b) => a.localeCompare(b));
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
    robotsSkipped,
  };
}
