import { describe, it, expect } from 'vitest';
import { sanitize, SanitizationError, type PrivateReport } from './sanitize';

// A report whose public block is genuinely clean.
const clean: PrivateReport = {
  meta: { client: 'Acme Corp', urls: ['https://acme.example'], secrets: ['sk-live-123'] },
  findings: 'internal: regression on acme.example, traced with token sk-live-123',
  public: { title: 'Audit complete', summary: 'Improved LCP on a key template', tags: ['perf'] },
};

// A report that smuggles a registered secret (the client name) into a public field.
const leaky: PrivateReport = {
  meta: { client: 'Acme Corp', urls: ['https://acme.example'], secrets: ['sk-live-123'] },
  findings: 'internal detail',
  public: { title: 'Audit complete', summary: 'Improved LCP for Acme Corp', tags: ['perf'] },
};

describe('sanitize — allowlist', () => {
  it('emits only the allowlisted public fields, never meta', () => {
    const out = sanitize(clean);
    expect(out).toEqual({ title: 'Audit complete', summary: 'Improved LCP on a key template', tags: ['perf'] });
    const serialized = JSON.stringify(out);
    for (const secret of ['Acme Corp', 'acme.example', 'sk-live-123']) {
      expect(serialized).not.toContain(secret);
    }
  });
});

describe('sanitize — fail closed', () => {
  it('throws SanitizationError when a registered secret reaches the output', () => {
    expect(() => sanitize(leaky)).toThrow(SanitizationError);
  });

  // A secret containing a double-quote would be rewritten by JSON.stringify
  // (`"` -> `\"`), so scanning the serialized form alone would miss it. Scanning
  // the raw field value must still catch it.
  it('catches a secret containing a double-quote that JSON escaping would hide', () => {
    const report: PrivateReport = {
      meta: { secrets: ['pa"ss word'] },
      findings: 'internal detail',
      public: { title: 'Audit complete', summary: 'Leaked: pa"ss word', tags: ['perf'] },
    };
    expect(() => sanitize(report)).toThrow(SanitizationError);
  });

  // Likewise a secret containing a backslash (`\` -> `\\` under JSON.stringify).
  it('catches a secret containing a backslash that JSON escaping would hide', () => {
    const report: PrivateReport = {
      meta: { secrets: ['C:\\secret\\token'] },
      findings: 'internal detail',
      public: { title: 'Path is C:\\secret\\token', summary: 'ok', tags: ['perf'] },
    };
    expect(() => sanitize(report)).toThrow(SanitizationError);
  });

  // The secret can hide in any allowlisted string field, including a tag.
  it('catches a quote-bearing secret smuggled into a tag', () => {
    const report: PrivateReport = {
      meta: { secrets: ['x"y'] },
      findings: 'internal detail',
      public: { title: 'Audit complete', summary: 'ok', tags: ['perf', 'x"y'] },
    };
    expect(() => sanitize(report)).toThrow(SanitizationError);
  });
});
