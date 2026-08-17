import { describe, expect, it } from 'vitest';
import {
  buildFeedItems,
  FEED_LEVEL,
  labPath,
  writingPath,
  type FeedEntry,
  type LabData,
  type WritingData,
} from './feed';

const lab = (id: string, over: Partial<LabData> = {}): FeedEntry<LabData> => ({
  id,
  data: {
    title: `lab ${id}`,
    date: new Date('2026-07-01T00:00:00Z'),
    type: 'experiment',
    summary: 's',
    draft: false,
    ...over,
  },
});

const post = (id: string, over: Partial<WritingData> = {}): FeedEntry<WritingData> => ({
  id,
  data: {
    title: `post ${id}`,
    date: new Date('2026-07-02T00:00:00Z'),
    summary: 's',
    draft: false,
    ...over,
  },
});

describe('feed paths', () => {
  it('point at the per-post routes', () => {
    expect(labPath('a-log')).toBe('/lab/a-log/');
    expect(writingPath('why-a-lab')).toBe('/writing/why-a-lab/');
  });
});

describe('buildFeedItems', () => {
  it('gives every writing item a unique link — the guid collision guard', () => {
    const items = buildFeedItems([], [post('why-a-lab'), post('second-post')]);
    const links = items.map((i) => i.link);
    expect(links).toHaveLength(2);
    expect(new Set(links).size).toBe(2);
    expect(links).toContain('/writing/why-a-lab/');
    expect(links).toContain('/writing/second-post/');
  });

  it('keeps links unique across both collections', () => {
    const items = buildFeedItems(
      [lab('one'), lab('two')],
      [post('one'), post('two')],
    );
    expect(new Set(items.map((i) => i.link)).size).toBe(items.length);
  });

  it('drops drafts from both collections', () => {
    const items = buildFeedItems([lab('kept'), lab('hidden', { draft: true })], [
      post('shown'),
      post('unpublished', { draft: true }),
    ]);
    expect(items.map((i) => i.link)).toEqual(['/writing/shown/', '/lab/kept/']);
  });

  it('sorts newest first and prefixes lab titles with their type', () => {
    const items = buildFeedItems(
      [lab('old', { date: new Date('2026-01-01T00:00:00Z'), type: 'note' })],
      [post('new', { date: new Date('2026-12-01T00:00:00Z') })],
    );
    expect(items.map((i) => i.title)).toEqual(['post new', '[note] lab old']);
  });
});

describe('feed reading level', () => {
  // A feed reader has no level switch, so the feed picks one. Pin the choice:
  // changing it should be a deliberate edit here, not a silent drift.
  it('ships lab copy at the tech-aware reading', () => {
    expect(FEED_LEVEL).toBe('aware');
  });

  it('uses the authored aware title and summary, not the technical source', () => {
    const [item] = buildFeedItems(
      [
        lab('quote-tags', {
          type: 'experiment',
          title: 'Quote unsafe tags in renderLabEntry (engine/lib.mjs)',
          titleLevels: { aware: 'Quote YAML-unsafe tags', plain: 'Stopped odd tag names breaking the build' },
          summary: 'renderLabEntry now quotes numeric and YAML-reserved-word tags.',
          summaryLevels: {
            aware: 'Tags that are numbers or YAML keywords are quoted, so they stay strings.',
            plain: 'A tag like 2026 could be misread by the site builder. It no longer can be.',
          },
        }),
      ],
      [],
    );
    expect(item.title).toBe('[experiment] Quote YAML-unsafe tags');
    expect(item.description).toBe(
      'Tags that are numbers or YAML keywords are quoted, so they stay strings.',
    );
  });

  it('falls back to the technical source for untranslated entries', () => {
    const [item] = buildFeedItems(
      [lab('raw', { type: 'note', title: 'Fix currentGhUser in engine/run-cycle.mjs', summary: 'gh 2.45 dropped the field.' })],
      [],
    );
    expect(item.title).toBe('[note] Fix currentGhUser in engine/run-cycle.mjs');
    expect(item.description).toBe('gh 2.45 dropped the field.');
  });

  it('ignores an empty variant rather than shipping a blank item', () => {
    const [item] = buildFeedItems(
      [lab('blank', { type: 'note', title: 'Real title', titleLevels: { aware: '   ' }, summary: 'Real summary', summaryLevels: { aware: '' } })],
      [],
    );
    expect(item.title).toBe('[note] Real title');
    expect(item.description).toBe('Real summary');
  });

  it("leaves writing at Wolf's own voice — no level translation", () => {
    const [item] = buildFeedItems([], [post('why-a-lab', { title: 'Why a lab', summary: 'The argument for building in public.' })]);
    expect(item.title).toBe('Why a lab');
    expect(item.description).toBe('The argument for building in public.');
  });
});
