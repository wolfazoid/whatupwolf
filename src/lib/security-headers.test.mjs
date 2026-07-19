import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// public/_headers is copied verbatim into dist/ by Astro and served by Cloudflare
// Workers static assets. Nothing else in the build validates it, so these tests are
// the only thing standing between a typo here and a live site with no hardening.
const HEADERS_FILE = fileURLToPath(new URL('../../public/_headers', import.meta.url));

/**
 * Parse the Cloudflare `_headers` format into `{ rule: { headerName: value } }`.
 * Rules start at column 0; the headers they own are indented beneath them.
 * `#` comments and blank lines are ignored.
 *
 * @param {string} source
 * @returns {Record<string, Record<string, string>>}
 */
function parseHeadersFile(source) {
  /** @type {Record<string, Record<string, string>>} */
  const rules = {};
  let current = null;

  for (const raw of source.split('\n')) {
    const line = raw.trimEnd();
    if (line.trim() === '' || line.trim().startsWith('#')) continue;

    if (!/^\s/.test(line)) {
      current = line.trim();
      rules[current] ??= {};
      continue;
    }

    const separator = line.indexOf(':');
    expect(separator, `header line without a colon: ${line}`).toBeGreaterThan(0);
    expect(current, `header line before any rule: ${line}`).not.toBeNull();
    rules[current][line.slice(0, separator).trim().toLowerCase()] = line.slice(separator + 1).trim();
  }

  return rules;
}

const rules = parseHeadersFile(readFileSync(HEADERS_FILE, 'utf8'));

describe('public/_headers — coverage', () => {
  it('applies a rule to every route', () => {
    expect(Object.keys(rules)).toContain('/*');
  });
});

describe('public/_headers — hardening headers on /*', () => {
  const headers = rules['/*'] ?? {};

  it('sends HSTS for at least 180 days, including subdomains', () => {
    const hsts = headers['strict-transport-security'];
    expect(hsts).toBeDefined();

    const maxAge = /max-age\s*=\s*(\d+)/.exec(hsts);
    expect(maxAge, `no max-age in: ${hsts}`).not.toBeNull();
    expect(Number(maxAge[1])).toBeGreaterThanOrEqual(15552000);
    expect(hsts.toLowerCase()).toContain('includesubdomains');
  });

  it('disables MIME sniffing', () => {
    expect(headers['x-content-type-options']).toBe('nosniff');
  });

  it('refuses cross-origin framing', () => {
    expect(headers['x-frame-options']?.toUpperCase()).toBe('SAMEORIGIN');
  });

  it('trims the referrer on cross-origin navigations', () => {
    expect(headers['referrer-policy']).toBe('strict-origin-when-cross-origin');
  });
});

describe('public/_headers — content security policy', () => {
  const headers = rules['/*'] ?? {};
  const enforced = headers['content-security-policy'];
  const reportOnly = headers['content-security-policy-report-only'];
  const policy = enforced ?? reportOnly;

  it('ships a CSP in one mode or the other', () => {
    expect(policy).toBeDefined();
  });

  it('locks the default source down to self', () => {
    expect(policy).toMatch(/default-src\s+'self'/);
  });

  it('blocks plugin content and off-origin base/form targets', () => {
    expect(policy).toMatch(/object-src\s+'none'/);
    expect(policy).toMatch(/base-uri\s+'self'/);
    expect(policy).toMatch(/form-action\s+'self'/);
  });

  // The live hazard: Astro emits unhashed inline scripts for island hydration on every
  // page. Enforcing a CSP that forbids them takes the site's interactivity down, and no
  // CI step would notice. If someone promotes the policy out of Report-Only, it has to
  // carry a way for those inline scripts to run.
  it('permits Astro inline hydration scripts whenever the CSP is enforced', () => {
    if (!enforced) return;

    const scriptSrc = /script-src\s+([^;]+)/.exec(enforced)?.[1] ?? '';
    expect(
      /'unsafe-inline'|'nonce-|'sha(256|384|512)-/.test(scriptSrc),
      `enforced script-src would block Astro's inline hydration scripts: ${scriptSrc}`,
    ).toBe(true);
  });
});
