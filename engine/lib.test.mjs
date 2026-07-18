import { describe, it, expect } from 'vitest';
import { parseBacklog, pickNextItem, markItemDone } from './lib.mjs';
import { slugify, renderLabEntry, parseCycleReport, parsePrivateReport, resolveStatus, draftForType } from './lib.mjs';
import { parseActiveGhAccount, shortTitle, publicEntryFromReport } from './lib.mjs';
import { parseRemoteBranches, uniqueBranchName } from './lib.mjs';
import { sanitize, SanitizationError } from '../src/lib/sanitize';

describe('shortTitle', () => {
  it('takes the lead clause before a colon separator', () => {
    expect(shortTitle('Fix currentGhUser() in run-cycle for gh 2.45: do not use --active'))
      .toBe('Fix currentGhUser() in run-cycle for gh 2.45');
  });
  it('takes the lead clause before a spaced em-dash', () => {
    expect(shortTitle('Build the sanitization filter — implement src/lib/sanitize.ts'))
      .toBe('Build the sanitization filter');
  });
  it('caps length with an ellipsis', () => {
    const out = shortTitle('a'.repeat(100));
    expect(out.length).toBeLessThanOrEqual(72);
    expect(out.endsWith('…')).toBe(true);
  });
  it('leaves an already-short title unchanged', () => {
    expect(shortTitle('Quote unsafe tags in renderLabEntry')).toBe('Quote unsafe tags in renderLabEntry');
  });
});

const SAMPLE = `# Engine Backlog

- [ ] Build the sanitization filter
- [ ] Build the experiment-runner framework
- [x] Bootstrap the loop
`;

describe('parseBacklog', () => {
  it('parses checkbox items with their done state', () => {
    const items = parseBacklog(SAMPLE);
    expect(items).toHaveLength(3);
    expect(items[0]).toMatchObject({ title: 'Build the sanitization filter', done: false });
    expect(items[2]).toMatchObject({ title: 'Bootstrap the loop', done: true });
  });
  it('ignores non-item lines', () => {
    expect(parseBacklog('# Heading\n\nsome prose')).toEqual([]);
  });
});

describe('pickNextItem', () => {
  it('returns the first unchecked item', () => {
    expect(pickNextItem(parseBacklog(SAMPLE)).title).toBe('Build the sanitization filter');
  });
  it('returns null when everything is done', () => {
    expect(pickNextItem(parseBacklog('- [x] done'))).toBeNull();
  });
});

describe('markItemDone', () => {
  it('flips the matching unchecked item to checked', () => {
    const out = markItemDone(SAMPLE, 'Build the sanitization filter');
    expect(out).toContain('- [x] Build the sanitization filter');
    // leaves the other unchecked item alone
    expect(out).toContain('- [ ] Build the experiment-runner framework');
  });
});

describe('slugify', () => {
  it('lowercases and hyphenates', () => {
    expect(slugify('Build the sanitization filter')).toBe('build-the-sanitization-filter');
  });
  it('trims stray hyphens and caps length', () => {
    expect(slugify('  Hello, World!  ')).toBe('hello-world');
    expect(slugify('x'.repeat(80)).length).toBeLessThanOrEqual(60);
  });
});

describe('renderLabEntry', () => {
  const entry = renderLabEntry({
    title: 'Build the sanitization filter',
    date: new Date('2026-07-18T14:30:00Z'),
    status: 'done',
    tags: ['engine', 'sanitizer'],
    summary: 'The machine built the sanitizer.',
    body: 'Implemented allowlist + fail-closed scan.\n',
  });
  it('emits valid frontmatter with the existing schema fields', () => {
    expect(entry).toContain('type: experiment');
    expect(entry).toContain('date: 2026-07-18T14:30');
    expect(entry).toContain('status: done');
    expect(entry).toContain('tags: [engine, sanitizer]');
    expect(entry).toContain('live: true');
    expect(entry).toContain('draft: false');
    expect(entry).toContain('title: "Build the sanitization filter"');
  });
  it('stamps draft:true when the entry is gated for review', () => {
    const gated = renderLabEntry({
      title: 'Weekly briefing',
      date: new Date('2026-07-18T14:30:00Z'),
      type: 'briefing',
      status: 'done',
      draft: true,
      summary: 'A point-of-view briefing.',
      body: 'Prose.\n',
    });
    expect(gated).toContain('draft: true');
  });
  it('includes the body after the frontmatter', () => {
    expect(entry.trim().endsWith('Implemented allowlist + fail-closed scan.')).toBe(true);
  });

  it('YAML-escapes unsafe tag values while keeping safe tags bare', () => {
    const unsafeEntry = renderLabEntry({
      title: 'Build the sanitization filter',
      date: new Date('2026-07-18T14:30:00Z'),
      status: 'done',
      tags: ['engine', 'a,b', 'c: d'],
      summary: 'The machine built the sanitizer.',
      body: 'Implemented allowlist + fail-closed scan.\n',
    });
    const tagsLine = unsafeEntry.split('\n').find((l) => l.startsWith('tags:'));
    expect(tagsLine).toBe('tags: [engine, "a,b", "c: d"]');
    // Simple safe tag stays bare and unescaped.
    expect(tagsLine).toMatch(/\[engine, /);
    // Unsafe tags are quoted so they round-trip as single YAML string scalars
    // rather than splitting on the comma or parsing as a nested mapping.
    expect(tagsLine).toContain('"a,b"');
    expect(tagsLine).toContain('"c: d"');
    // The unescaped/bare forms — which would corrupt the YAML — must not appear.
    expect(unsafeEntry).not.toContain('[engine, a,b, c: d]');
    expect(unsafeEntry).not.toMatch(/tags: \[[^\]]*[^"]a,b[^"][^\]]*\]/);
  });

  it('quotes numeric and YAML-reserved-word tags so they stay strings', () => {
    const entry2 = renderLabEntry({
      title: 'Build the sanitization filter',
      date: new Date('2026-07-18T14:30:00Z'),
      status: 'done',
      tags: ['engine', '2026', 'true', 'False', 'null', 'yes', 'no', '~'],
      summary: 'The machine built the sanitizer.',
      body: 'Implemented allowlist + fail-closed scan.\n',
    });
    const tagsLine = entry2.split('\n').find((l) => l.startsWith('tags:'));
    // A purely-numeric tag would parse as a number if left bare — must be quoted.
    expect(tagsLine).toContain('"2026"');
    // Reserved words parse as booleans/null if bare — quote them (any case).
    expect(tagsLine).toContain('"true"');
    expect(tagsLine).toContain('"False"');
    expect(tagsLine).toContain('"null"');
    expect(tagsLine).toContain('"yes"');
    expect(tagsLine).toContain('"no"');
    expect(tagsLine).toContain('"~"');
    // An ordinary word stays bare.
    expect(tagsLine).toMatch(/^tags: \[engine, /);
    expect(tagsLine).toBe('tags: [engine, "2026", "true", "False", "null", "yes", "no", "~"]');
  });
});

describe('parseActiveGhAccount', () => {
  // gh 2.45 no longer supports `gh auth status --active`; we parse the full
  // status text instead. These samples mirror real gh 2.45 output.
  const SINGLE = `github.com
  ✓ Logged in to github.com account wolfazoid (keyring)
  - Active account: true
  - Git operations protocol: https
  - Token: gho_************************************
  - Token scopes: 'gist', 'read:org', 'repo', 'workflow'
`;

  const MULTI = `github.com
  ✓ Logged in to github.com account wolf-personal (keyring)
  - Active account: false
  - Git operations protocol: https
  - Token: gho_************************************
  - Token scopes: 'gist', 'read:org', 'repo', 'workflow'

  ✓ Logged in to github.com account wolfazoid (keyring)
  - Active account: true
  - Git operations protocol: https
  - Token: gho_************************************
  - Token scopes: 'gist', 'read:org', 'repo', 'workflow'
`;

  it('returns the single logged-in account marked active', () => {
    expect(parseActiveGhAccount(SINGLE)).toBe('wolfazoid');
  });
  it('returns the active account when several are logged in', () => {
    expect(parseActiveGhAccount(MULTI)).toBe('wolfazoid');
  });
  it('does not return a non-active account listed first', () => {
    expect(parseActiveGhAccount(MULTI)).not.toBe('wolf-personal');
  });
  it('returns "" when no account is marked active', () => {
    const none = `github.com
  ✓ Logged in to github.com account wolfazoid (keyring)
  - Active account: false
`;
    expect(parseActiveGhAccount(none)).toBe('');
  });
  it('returns "" for empty / logged-out output', () => {
    expect(parseActiveGhAccount('')).toBe('');
    expect(parseActiveGhAccount('You are not logged into any GitHub hosts.')).toBe('');
  });
  it('coerces non-string input to "" without throwing', () => {
    expect(parseActiveGhAccount(undefined)).toBe('');
  });
});

describe('publicEntryFromReport', () => {
  // A report whose curated public block is genuinely clean.
  const clean = {
    meta: { client: 'Acme Corp', urls: ['https://acme.example'], secrets: ['sk-live-123'] },
    findings: 'internal: regression on acme.example, traced with token sk-live-123',
    public: { title: 'Audit complete', summary: 'Improved LCP on a key template', tags: ['perf'] },
  };
  // A report that smuggles a registered secret (the client name) into a public field.
  const leaky = {
    meta: { client: 'Acme Corp', urls: ['https://acme.example'], secrets: ['sk-live-123'] },
    findings: 'internal detail',
    public: { title: 'Audit complete', summary: 'Improved LCP for Acme Corp', tags: ['perf'] },
  };
  const date = new Date('2026-07-18T14:30:00Z');

  it('sanitizes then renders a public lab entry for a clean report', () => {
    const entry = publicEntryFromReport(clean, { sanitize, date, status: 'done' });
    expect(entry).toContain('title: "Audit complete"');
    expect(entry).toContain('summary: "Improved LCP on a key template"');
    expect(entry).toContain('status: done');
    expect(entry).toContain('tags: [perf]');
    expect(entry).toContain('date: 2026-07-18T14:30');
    // Fail-closed guarantee: no registered secret survives into the rendered entry.
    for (const secret of ['Acme Corp', 'acme.example', 'sk-live-123']) {
      expect(entry).not.toContain(secret);
    }
  });

  it('throws (fail-closed) when a registered secret leaks, emitting no entry', () => {
    expect(() => publicEntryFromReport(leaky, { sanitize, date })).toThrow(SanitizationError);
  });

  it('requires a sanitize function to be injected', () => {
    expect(() => publicEntryFromReport(clean, { date })).toThrow(TypeError);
  });
});

describe('parseCycleReport', () => {
  it('parses a well-formed report', () => {
    const r = parseCycleReport('{"status":"flagged","summary":"s","tags":["a"],"body":"b"}');
    expect(r).toEqual({ status: 'flagged', summary: 's', tags: ['a'], body: 'b' });
  });
  it('throws on a bad status', () => {
    expect(() => parseCycleReport('{"status":"weird"}')).toThrow();
  });
});

describe('parsePrivateReport', () => {
  const wellFormed = {
    status: 'flagged',
    meta: { urls: ['https://example.invalid/a'], secrets: ['/a-route'] },
    findings: 'the full private account',
    public: { title: 't', summary: 's', body: 'b', tags: ['monitoring'] },
  };
  const report = (over = {}) => JSON.stringify({ ...wellFormed, ...over });

  it('parses a well-formed private report', () => {
    expect(parsePrivateReport(report())).toEqual(wellFormed);
  });

  it('defaults meta and tags to empty arrays when absent', () => {
    const r = parsePrivateReport(report({ meta: undefined, public: { title: 't', summary: 's', body: 'b' } }));
    expect(r.meta).toEqual({ urls: [], secrets: [] });
    expect(r.public.tags).toEqual([]);
  });

  it('throws on a bad status', () => {
    expect(() => parsePrivateReport(report({ status: 'weird' }))).toThrow();
  });

  it('throws when the public block is missing', () => {
    expect(() => parsePrivateReport(report({ public: undefined }))).toThrow(/public/);
  });

  // A blank public field would render an empty entry rather than fail loudly.
  it('throws on an empty public field', () => {
    expect(() => parsePrivateReport(report({ public: { title: 't', summary: '  ', body: 'b' } })))
      .toThrow(/public.summary/);
  });

  // No findings means the private half is empty — the split the experiment exists
  // to prove never happened, so reject rather than publish half a report.
  it('throws when findings are missing', () => {
    expect(() => parsePrivateReport(report({ findings: '' }))).toThrow(/findings/);
  });
});

describe('resolveStatus', () => {
  it('keeps the machine-reported status when both gates pass', () => {
    expect(resolveStatus('done', true, true)).toBe('done');
    expect(resolveStatus('flagged', true, true)).toBe('flagged');
  });
  it('overrides to flagged when tests fail', () => {
    expect(resolveStatus('done', false, true)).toBe('flagged');
  });
  it('overrides to flagged when the check fails', () => {
    expect(resolveStatus('done', true, false)).toBe('flagged');
  });
  it('flags when both gates fail', () => {
    expect(resolveStatus('done', false, false)).toBe('flagged');
  });
});

describe('draftForType', () => {
  it('publishes monitor and experiment entries direct (draft:false)', () => {
    // Factual machine-log types — what ran, what changed, pass/fail — ship live.
    expect(draftForType('monitor')).toBe(false);
    expect(draftForType('experiment')).toBe(false);
  });
  it('publishes digest entries direct (draft:false)', () => {
    // Digests are factual roll-ups of what ran, so they ship live like other logs.
    expect(draftForType('digest')).toBe(false);
  });
  it('gates briefing- and opinion-style entries behind draft:true', () => {
    // These carry a point of view, so a human reviews before they go public.
    expect(draftForType('briefing')).toBe(true);
    expect(draftForType('note')).toBe(true);
  });
  it('fails safe: an unknown type is gated, never published unreviewed', () => {
    expect(draftForType('essay')).toBe(true);
    expect(draftForType('')).toBe(true);
    expect(draftForType(undefined)).toBe(true);
  });
});

describe('parseRemoteBranches', () => {
  it('pulls branch names out of git ls-remote --heads output', () => {
    const out = [
      'a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0\trefs/heads/lab/agent-weekly-2026-07-18',
      'b1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0\trefs/heads/lab/agent-weekly-2026-07-18-2',
    ].join('\n');
    expect(parseRemoteBranches(out)).toEqual([
      'lab/agent-weekly-2026-07-18',
      'lab/agent-weekly-2026-07-18-2',
    ]);
  });
  it('returns [] for empty output — the no-remote-branch case', () => {
    // --dry-run's sh() returns '' without shelling out; that must read as "nothing taken".
    expect(parseRemoteBranches('')).toEqual([]);
  });
  it('ignores lines that are not refs/heads entries', () => {
    const out = 'warning: something\nc0ffee00\trefs/tags/v1\nc0ffee11\trefs/heads/main';
    expect(parseRemoteBranches(out)).toEqual(['main']);
  });
});

describe('uniqueBranchName', () => {
  it('uses the plain dated name when the remote has no such branch', () => {
    expect(uniqueBranchName('lab/agent-weekly-2026-07-18', [])).toBe('lab/agent-weekly-2026-07-18');
  });
  it('steps to -2 when a same-day run already pushed the dated branch', () => {
    // Without this, `git push` hits a non-fast-forward and the whole run fails.
    expect(uniqueBranchName('lab/x-2026-07-18', ['lab/x-2026-07-18'])).toBe('lab/x-2026-07-18-2');
  });
  it('keeps stepping past every taken suffix', () => {
    const taken = ['lab/x-2026-07-18', 'lab/x-2026-07-18-2', 'lab/x-2026-07-18-3'];
    expect(uniqueBranchName('lab/x-2026-07-18', taken)).toBe('lab/x-2026-07-18-4');
  });
  it('ignores unrelated branches', () => {
    expect(uniqueBranchName('lab/x-2026-07-18', ['main', 'lab/y-2026-07-18'])).toBe('lab/x-2026-07-18');
  });
  it('throws rather than looping forever if every name is somehow taken', () => {
    const taken = ['lab/x', ...Array.from({ length: 98 }, (_, i) => `lab/x-${i + 2}`)];
    expect(() => uniqueBranchName('lab/x', taken)).toThrow(/no free branch name/);
  });
});
