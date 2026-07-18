import { describe, it, expect } from 'vitest';
import { parseBacklog, pickNextItem, markItemDone } from './lib.mjs';
import { slugify, renderLabEntry, parseCycleReport, resolveStatus } from './lib.mjs';
import { parseActiveGhAccount } from './lib.mjs';

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
    expect(entry).toContain('title: "Build the sanitization filter"');
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

describe('parseCycleReport', () => {
  it('parses a well-formed report', () => {
    const r = parseCycleReport('{"status":"flagged","summary":"s","tags":["a"],"body":"b"}');
    expect(r).toEqual({ status: 'flagged', summary: 's', tags: ['a'], body: 'b' });
  });
  it('throws on a bad status', () => {
    expect(() => parseCycleReport('{"status":"weird"}')).toThrow();
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
