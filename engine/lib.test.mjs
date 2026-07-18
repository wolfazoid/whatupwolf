import { describe, it, expect } from 'vitest';
import { parseBacklog, pickNextItem, markItemDone } from './lib.mjs';
import { slugify, renderLabEntry, parseCycleReport, resolveStatus } from './lib.mjs';

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
