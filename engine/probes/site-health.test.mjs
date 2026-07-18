import { describe, it, expect } from 'vitest';
import { EventEmitter } from 'node:events';
import {
  probe,
  extractLinks,
  countAssets,
  daysUntil,
  parseRobots,
  isAllowed,
  createRateLimiter,
  KEY_ROUTES,
  USER_AGENT,
} from './site-health.mjs';

const HOME_HTML = `<!doctype html>
<html>
  <head>
    <link rel="stylesheet" href="/style.css">
    <script src="/app.js"></script>
  </head>
  <body>
    <img src="/hero.png">
    <a href="/lab">Lab</a>
    <a href="/lab#recent">Lab again</a>
    <a href="/gone">Dead internal</a>
    <a href="https://example.com/offline">Dead external</a>
    <a href="#top">Fragment</a>
    <a href="mailto:wolf@wearefeasting.com">Mail</a>
  </body>
</html>`;

// A minimal stand-in for a fetch Response: only the bits the probe touches.
const response = (status, { body = '', headers = {} } = {}) => ({
  status,
  headers: { get: (name) => headers[name.toLowerCase()] ?? null },
  text: async () => body,
});

// Builds a fetch mock from a url→handler map and records every call, so a test
// can assert on the verbs used as well as the aggregation.
function mockFetch(routes) {
  const calls = [];
  const impl = async (url, opts = {}) => {
    calls.push({ url, method: opts.method ?? 'GET', headers: opts.headers });
    const handler = routes[url];
    if (!handler) throw new Error(`unexpected fetch: ${url}`);
    const out = typeof handler === 'function' ? handler(opts) : handler;
    if (out instanceof Error) throw out;
    return out;
  };
  impl.calls = calls;
  return impl;
}

// A fake tls.connect: fires the connect callback on the next tick and hands back
// the given certificate, mirroring the real socket's shape (getPeerCertificate,
// end, on('error'/'timeout')).
function mockTls(cert) {
  return (_opts, onConnect) => {
    const socket = new EventEmitter();
    socket.getPeerCertificate = () => cert;
    socket.end = () => {};
    socket.destroy = () => {};
    queueMicrotask(() => onConnect());
    return socket;
  };
}

function failingTls(message) {
  return () => {
    const socket = new EventEmitter();
    socket.end = () => {};
    socket.destroy = () => {};
    queueMicrotask(() => socket.emit('error', new Error(message)));
    return socket;
  };
}

const SECURE_HEADERS = {
  'content-security-policy': "default-src 'self'",
  'strict-transport-security': 'max-age=31536000',
  'x-content-type-options': 'nosniff',
};

// A clock that advances a fixed 12ms per reading, so TTFB values are exact and
// the test never depends on real wall-clock timing.
function fakeClock(stepMs = 12) {
  let t = 0;
  return () => (t += stepMs);
}

// A sleep that never waits but records what it was asked to wait for, so the
// rate limiter's spacing is assertable without the test taking seconds.
function fakeSleep() {
  const waits = [];
  const fn = async (ms) => { waits.push(ms); };
  fn.waits = waits;
  return fn;
}

// No robots.txt on either origin — the ordinary case, and the one whatupwolf.com
// itself is in. 404 means "no policy published", so everything stays crawlable.
const NO_ROBOTS = {
  'https://example.test/robots.txt': response(404),
  'https://example.com/robots.txt': response(404),
};

const HEALTHY_SITE = {
  ...NO_ROBOTS,
  'https://example.test/': response(200, { body: HOME_HTML, headers: SECURE_HEADERS }),
  'https://example.test/lab': response(200),
  'https://example.test/work': response(200),
  'https://example.test/writing': response(200),
  'https://example.test/rss.xml': response(200),
  'https://example.test/gone': response(404),
  'https://example.com/offline': response(503),
};

const NOW = Date.parse('2026-07-18T00:00:00Z');

describe('extractLinks', () => {
  it('resolves hrefs, strips fragments, and de-duplicates', () => {
    expect(extractLinks(HOME_HTML, 'https://example.test/')).toEqual([
      'https://example.test/lab',
      'https://example.test/gone',
      'https://example.com/offline',
    ]);
  });
  it('skips mailto/tel/javascript and bare fragments', () => {
    const html = '<a href="#x">a</a><a href="tel:123">b</a><a href="javascript:void(0)">c</a>';
    expect(extractLinks(html, 'https://example.test/')).toEqual([]);
  });
  it('handles single-quoted and unquoted hrefs', () => {
    const html = `<a href='/one'>1</a><a href=/two>2</a>`;
    expect(extractLinks(html, 'https://example.test/'))
      .toEqual(['https://example.test/one', 'https://example.test/two']);
  });
});

describe('countAssets', () => {
  it('counts scripts, links and images', () => {
    expect(countAssets(HOME_HTML)).toBe(3);
  });
  it('is zero for markup with no assets', () => {
    expect(countAssets('<p>hello</p>')).toBe(0);
  });
});

describe('daysUntil', () => {
  it('floors the whole days to expiry', () => {
    expect(daysUntil('Aug 15 12:00:00 2026 GMT', NOW)).toBe(28);
  });
  it('goes negative for an expired cert', () => {
    expect(daysUntil('Jul 01 12:00:00 2026 GMT', NOW)).toBe(-17);
  });
  it('returns null for an unparseable date', () => {
    expect(daysUntil('not a date', NOW)).toBeNull();
  });
});

describe('parseRobots', () => {
  it('returns the wildcard group when nothing names us', () => {
    expect(parseRobots('User-agent: *\nDisallow: /admin\nAllow: /admin/public')).toEqual([
      { allow: false, pattern: '/admin' },
      { allow: true, pattern: '/admin/public' },
    ]);
  });

  it('prefers a group naming our token and ignores the wildcard entirely', () => {
    const txt = [
      'User-agent: *',
      'Disallow: /',
      '',
      'User-agent: whatupwolf-site-health',
      'Disallow: /private',
    ].join('\n');
    expect(parseRobots(txt)).toEqual([{ allow: false, pattern: '/private' }]);
  });

  it('matches our token case-insensitively and as a substring', () => {
    expect(parseRobots('User-agent: WhatUpWolf-Site-Health\nDisallow: /x')).toEqual([
      { allow: false, pattern: '/x' },
    ]);
  });

  it('shares rules across consecutive user-agent lines', () => {
    const txt = 'User-agent: googlebot\nUser-agent: whatupwolf-site-health\nDisallow: /both';
    expect(parseRobots(txt)).toEqual([{ allow: false, pattern: '/both' }]);
  });

  it('ignores comments, blank lines and unknown fields', () => {
    const txt = '# hello\nUser-agent: *  # everyone\nCrawl-delay: 10\nDisallow: /a # why\n';
    expect(parseRobots(txt)).toEqual([{ allow: false, pattern: '/a' }]);
  });

  it('treats an empty Disallow as no rule at all', () => {
    expect(parseRobots('User-agent: *\nDisallow:')).toEqual([]);
  });

  it('returns no rules when a group names someone else', () => {
    expect(parseRobots('User-agent: googlebot\nDisallow: /')).toEqual([]);
  });
});

describe('isAllowed', () => {
  const rules = parseRobots('User-agent: *\nDisallow: /admin\nAllow: /admin/public\nDisallow: /*.pdf$');

  it('allows a path no rule matches', () => {
    expect(isAllowed(rules, '/lab')).toBe(true);
  });
  it('blocks a disallowed prefix', () => {
    expect(isAllowed(rules, '/admin/secret')).toBe(false);
  });
  it('lets the longer Allow win over a shorter Disallow', () => {
    expect(isAllowed(rules, '/admin/public/page')).toBe(true);
  });
  it('honours * and a terminating $', () => {
    expect(isAllowed(rules, '/docs/spec.pdf')).toBe(false);
    expect(isAllowed(rules, '/docs/spec.pdf.html')).toBe(true);
  });
  it('allows everything when there are no rules', () => {
    expect(isAllowed([], '/anything')).toBe(true);
  });
  it('lets Allow win a same-length tie', () => {
    expect(isAllowed([{ allow: false, pattern: '/x' }, { allow: true, pattern: '/x' }], '/x')).toBe(true);
  });
});

describe('createRateLimiter', () => {
  // A clock the fake sleep actually advances, so the limiter sees time pass.
  function controllableClock() {
    let t = 0;
    return { now: () => t, advance: (ms) => { t += ms; } };
  }

  it('does not delay the first request', async () => {
    const clock = controllableClock();
    const sleep = fakeSleep();
    const gate = createRateLimiter({ minIntervalMs: 1000, sleep, monotonic: clock.now });
    await gate();
    expect(sleep.waits).toEqual([]);
  });

  it('waits out the remainder of the interval between requests', async () => {
    const clock = controllableClock();
    const waits = [];
    const sleep = async (ms) => { waits.push(ms); clock.advance(ms); };
    const gate = createRateLimiter({ minIntervalMs: 1000, sleep, monotonic: clock.now });
    await gate();
    clock.advance(300); // the request itself took 300ms of the budget
    await gate();
    expect(waits).toEqual([700]);
  });

  it('does not wait when the previous request already took longer than the interval', async () => {
    const clock = controllableClock();
    const sleep = fakeSleep();
    const gate = createRateLimiter({ minIntervalMs: 1000, sleep, monotonic: clock.now });
    await gate();
    clock.advance(2500);
    await gate();
    expect(sleep.waits).toEqual([]);
  });

  it('serialises concurrent callers so only one request is ever in flight', async () => {
    const clock = controllableClock();
    const order = [];
    const sleep = async (ms) => { clock.advance(ms); };
    const gate = createRateLimiter({ minIntervalMs: 1000, sleep, monotonic: clock.now });
    const at = [];
    await Promise.all([1, 2, 3].map(async (n) => {
      await gate();
      order.push(n);
      at.push(clock.now());
    }));
    expect(order).toEqual([1, 2, 3]);
    // Each caller starts a full interval after the one before it.
    expect(at).toEqual([0, 1000, 2000]);
  });
});

describe('probe', () => {
  const run = (overrides = {}) => probe('https://example.test', {
    fetchImpl: mockFetch(HEALTHY_SITE),
    tlsConnect: mockTls({ valid_to: 'Aug 15 12:00:00 2026 GMT' }),
    monotonic: fakeClock(),
    now: () => NOW,
    sleep: fakeSleep(),
    ...overrides,
  });

  it('probes every key route in order with its status and TTFB', async () => {
    const findings = await run();
    expect(findings.routes.map((r) => r.path)).toEqual(KEY_ROUTES);
    expect(findings.routes.every((r) => r.status === 200)).toBe(true);
    // The 12ms-per-reading clock: each route costs exactly one step.
    expect(findings.routes.every((r) => r.ttfbMs === 12)).toBe(true);
  });

  it('reads SSL expiry from the peer certificate', async () => {
    const findings = await run();
    expect(findings.ssl).toEqual({ daysToExpiry: 28, validTo: 'Aug 15 12:00:00 2026 GMT' });
  });

  it('flags non-2xx homepage links, sorted, and leaves healthy ones out', async () => {
    const findings = await run();
    expect(findings.brokenLinks).toEqual([
      { url: 'https://example.com/offline', status: 503 },
      { url: 'https://example.test/gone', status: 404 },
    ]);
    expect(findings.linksFound).toBe(3);
    expect(findings.linksChecked).toBe(3);
  });

  it('reports security-header presence from the homepage response', async () => {
    const findings = await run();
    expect(findings.headers).toEqual({ csp: true, hsts: true, xcto: true });
  });

  it('reports missing security headers as false', async () => {
    const findings = await run({
      fetchImpl: mockFetch({
        ...HEALTHY_SITE,
        'https://example.test/': response(200, { body: HOME_HTML, headers: { 'x-content-type-options': 'nosniff' } }),
      }),
    });
    expect(findings.headers).toEqual({ csp: false, hsts: false, xcto: true });
  });

  it('measures homepage weight in bytes and asset count', async () => {
    const findings = await run();
    expect(findings.pageWeight).toEqual({
      htmlBytes: Buffer.byteLength(HOME_HTML, 'utf8'),
      assetCount: 3,
    });
  });

  it('checks links with HEAD and only falls back to GET when the verb is refused', async () => {
    const fetchImpl = mockFetch({
      ...HEALTHY_SITE,
      'https://example.test/lab': (opts) => (opts.method === 'HEAD' ? response(405) : response(200)),
    });
    const findings = await run({ fetchImpl });
    // The HEAD 405 is retried as GET and comes back healthy, so it isn't broken.
    expect(findings.brokenLinks.map((b) => b.url)).not.toContain('https://example.test/lab');
    const labCalls = fetchImpl.calls.filter((c) => c.url === 'https://example.test/lab');
    expect(labCalls.map((c) => c.method)).toEqual(['GET', 'HEAD', 'GET']); // key-route GET, then the crawl
  });

  it('records an unreachable route as status 0 instead of throwing', async () => {
    const findings = await run({
      fetchImpl: mockFetch({ ...HEALTHY_SITE, 'https://example.test/work': new Error('ECONNREFUSED') }),
    });
    expect(findings.routes.find((r) => r.path === '/work')).toMatchObject({ status: 0 });
    // The rest of the audit still completes.
    expect(findings.ssl.daysToExpiry).toBe(28);
  });

  it('records an unreachable link as broken with status 0', async () => {
    const findings = await run({
      fetchImpl: mockFetch({ ...HEALTHY_SITE, 'https://example.com/offline': new Error('ENOTFOUND') }),
    });
    expect(findings.brokenLinks).toContainEqual({ url: 'https://example.com/offline', status: 0 });
  });

  it('degrades to null SSL when the handshake fails', async () => {
    const findings = await run({ tlsConnect: failingTls('self-signed certificate') });
    expect(findings.ssl).toEqual({ daysToExpiry: null, validTo: null });
    expect(findings.routes).toHaveLength(KEY_ROUTES.length);
  });

  it('skips the SSL check for a plain-http target', async () => {
    const findings = await probe('http://example.test', {
      fetchImpl: mockFetch({
        'http://example.test/robots.txt': response(404),
        'http://example.test/': response(200, { body: '<html></html>' }),
        'http://example.test/lab': response(200),
        'http://example.test/work': response(200),
        'http://example.test/writing': response(200),
        'http://example.test/rss.xml': response(200),
      }),
      tlsConnect: () => { throw new Error('must not dial TLS for http'); },
      monotonic: fakeClock(),
      now: () => NOW,
      sleep: fakeSleep(),
    });
    expect(findings.ssl).toEqual({ daysToExpiry: null, validTo: null });
  });

  it('caps the crawl and reports the gap between links found and checked', async () => {
    const findings = await run({ maxLinks: 1 });
    expect(findings.linksFound).toBe(3);
    expect(findings.linksChecked).toBe(1);
    expect(findings.brokenLinks).toEqual([]); // only /lab, which is healthy, was checked
  });

  it('sends the identifying User-Agent on every request, robots.txt included', async () => {
    const fetchImpl = mockFetch(HEALTHY_SITE);
    await run({ fetchImpl });
    expect(fetchImpl.calls.length).toBeGreaterThan(0);
    expect(fetchImpl.calls.every((c) => c.headers?.['user-agent'] === USER_AGENT)).toBe(true);
    expect(USER_AGENT).toMatch(/^whatupwolf-site-health\/[\d.]+ \(\+https:\/\/whatupwolf\.com\)$/);
    expect(fetchImpl.calls.map((c) => c.url)).toContain('https://example.test/robots.txt');
  });

  it('rate-limits: it gates every request through the limiter', async () => {
    const sleep = fakeSleep();
    const fetchImpl = mockFetch(HEALTHY_SITE);
    await run({ fetchImpl, sleep, minIntervalMs: 1000 });
    // The 12ms-per-reading clock never satisfies a 1s interval, so every request
    // after the first waits — proof the gate is on the request path, not beside it.
    expect(sleep.waits).toHaveLength(fetchImpl.calls.length - 1);
    expect(sleep.waits.every((ms) => ms > 0 && ms <= 1000)).toBe(true);
  });

  it('skips a robots-Disallowed key route instead of fetching it', async () => {
    const fetchImpl = mockFetch({
      ...HEALTHY_SITE,
      'https://example.test/robots.txt': response(200, {
        body: 'User-agent: *\nDisallow: /work\n',
      }),
    });
    const findings = await run({ fetchImpl });
    expect(findings.routes.find((r) => r.path === '/work'))
      .toEqual({ path: '/work', status: null, ttfbMs: null, skipped: 'robots' });
    expect(findings.robotsSkipped).toContain('https://example.test/work');
    expect(fetchImpl.calls.map((c) => c.url)).not.toContain('https://example.test/work');
    // The rest of the audit is unaffected.
    expect(findings.routes.filter((r) => r.status === 200)).toHaveLength(KEY_ROUTES.length - 1);
  });

  it('honours a group that names our user agent specifically', async () => {
    const fetchImpl = mockFetch({
      ...HEALTHY_SITE,
      'https://example.test/robots.txt': response(200, {
        body: 'User-agent: *\nDisallow:\n\nUser-agent: whatupwolf-site-health\nDisallow: /lab\n',
      }),
    });
    const findings = await run({ fetchImpl });
    expect(findings.robotsSkipped).toContain('https://example.test/lab');
    expect(fetchImpl.calls.map((c) => c.url)).not.toContain('https://example.test/lab');
  });

  it('applies each origin its own robots.txt when crawling links', async () => {
    const fetchImpl = mockFetch({
      ...HEALTHY_SITE,
      'https://example.com/robots.txt': response(200, { body: 'User-agent: *\nDisallow: /offline\n' }),
    });
    const findings = await run({ fetchImpl });
    // The external link is off-limits, so it is neither checked nor reported broken.
    expect(fetchImpl.calls.map((c) => c.url)).not.toContain('https://example.com/offline');
    expect(findings.brokenLinks).toEqual([{ url: 'https://example.test/gone', status: 404 }]);
    expect(findings.robotsSkipped).toEqual(['https://example.com/offline']);
    expect(findings.linksFound).toBe(3);
    expect(findings.linksChecked).toBe(2);
  });

  it('fetches robots.txt once per origin, not once per request', async () => {
    const fetchImpl = mockFetch(HEALTHY_SITE);
    await run({ fetchImpl });
    const robotsCalls = fetchImpl.calls.filter((c) => c.url.endsWith('/robots.txt'));
    expect(robotsCalls.map((c) => c.url).sort())
      .toEqual(['https://example.com/robots.txt', 'https://example.test/robots.txt']);
  });

  it('stays out entirely when robots.txt is 5xx, and crawls freely when it is 404', async () => {
    const blocked = await run({
      fetchImpl: mockFetch({ ...HEALTHY_SITE, 'https://example.test/robots.txt': response(503) }),
    });
    expect(blocked.routes.every((r) => r.skipped === 'robots')).toBe(true);
    expect(blocked.linksChecked).toBe(0);

    // 404 is the whatupwolf.com case: no policy published, everything crawlable.
    const open = await run();
    expect(open.routes.every((r) => r.status === 200)).toBe(true);
    expect(open.robotsSkipped).toEqual([]);
  });

  it('treats an unreachable robots.txt as no policy rather than a wall', async () => {
    const findings = await run({
      fetchImpl: mockFetch({ ...HEALTHY_SITE, 'https://example.test/robots.txt': new Error('ECONNREFUSED') }),
    });
    expect(findings.routes.every((r) => r.status === 200)).toBe(true);
  });

  it('still returns findings when the homepage itself is down', async () => {
    const findings = await run({
      fetchImpl: mockFetch({ ...HEALTHY_SITE, 'https://example.test/': new Error('ECONNREFUSED') }),
    });
    expect(findings.routes[0]).toMatchObject({ path: '/', status: 0 });
    expect(findings.headers).toEqual({ csp: false, hsts: false, xcto: false });
    expect(findings.pageWeight).toEqual({ htmlBytes: 0, assetCount: 0 });
    expect(findings.brokenLinks).toEqual([]);
  });
});
