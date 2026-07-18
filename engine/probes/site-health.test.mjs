import { describe, it, expect } from 'vitest';
import { EventEmitter } from 'node:events';
import { probe, extractLinks, countAssets, daysUntil, KEY_ROUTES } from './site-health.mjs';

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
    calls.push({ url, method: opts.method ?? 'GET' });
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

const HEALTHY_SITE = {
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

describe('probe', () => {
  const run = (overrides = {}) => probe('https://example.test', {
    fetchImpl: mockFetch(HEALTHY_SITE),
    tlsConnect: mockTls({ valid_to: 'Aug 15 12:00:00 2026 GMT' }),
    monotonic: fakeClock(),
    now: () => NOW,
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
        'http://example.test/': response(200, { body: '<html></html>' }),
        'http://example.test/lab': response(200),
        'http://example.test/work': response(200),
        'http://example.test/writing': response(200),
        'http://example.test/rss.xml': response(200),
      }),
      tlsConnect: () => { throw new Error('must not dial TLS for http'); },
      monotonic: fakeClock(),
      now: () => NOW,
    });
    expect(findings.ssl).toEqual({ daysToExpiry: null, validTo: null });
  });

  it('caps the crawl and reports the gap between links found and checked', async () => {
    const findings = await run({ maxLinks: 1 });
    expect(findings.linksFound).toBe(3);
    expect(findings.linksChecked).toBe(1);
    expect(findings.brokenLinks).toEqual([]); // only /lab, which is healthy, was checked
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
