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
});
