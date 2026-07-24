import { describe, expect, it } from 'vitest';
import { buildFeedItems, labPath, writingPath, type FeedEntry, type LabData, type WritingData } from './feed';

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
