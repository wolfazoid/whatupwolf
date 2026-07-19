import { describe, it, expect } from 'vitest';
import {
  EMPTY_QUERY,
  describeQuery,
  filterLabItems,
  isFiltered,
  tagFacets,
  typeFacets,
  type LabItem,
} from './lab-filter';

function item(partial: Partial<LabItem> & { id: string }): LabItem {
  return {
    title: 'Untitled',
    ts: '2026-07-19 09:00',
    type: 'build',
    status: 'done',
    tags: [],
    live: false,
    summary: '',
    ...partial,
  };
}

const items: LabItem[] = [
  item({
    id: 'a',
    title: 'Site health probe',
    summary: 'Checks security headers on every deploy.',
    type: 'probe',
    tags: ['engine', 'security'],
  }),
  item({
    id: 'b',
    title: 'Cook Mode prototype',
    summary: 'A hands-free recipe reader for the kitchen.',
    type: 'build',
    tags: ['cooking', 'ux'],
  }),
  item({
    id: 'c',
    title: 'Lab filter revamp',
    summary: 'Dropdown and search replace the tag buttons.',
    type: 'build',
    tags: ['ux', 'engine'],
  }),
];

describe('facets', () => {
  it('ranks tags by frequency, then alphabetically', () => {
    expect(tagFacets(items)).toEqual([
      { value: 'engine', count: 2 },
      { value: 'ux', count: 2 },
      { value: 'cooking', count: 1 },
      { value: 'security', count: 1 },
    ]);
  });

  it('counts types the same way', () => {
    expect(typeFacets(items)).toEqual([
      { value: 'build', count: 2 },
      { value: 'probe', count: 1 },
    ]);
  });

  it('returns nothing for an empty feed', () => {
    expect(tagFacets([])).toEqual([]);
    expect(typeFacets([])).toEqual([]);
  });
});

describe('filterLabItems', () => {
  it('returns everything when no filter is active', () => {
    expect(filterLabItems(items, EMPTY_QUERY)).toEqual(items);
  });

  it('filters by tag', () => {
    expect(filterLabItems(items, { ...EMPTY_QUERY, tag: 'ux' }).map((i) => i.id)).toEqual(['b', 'c']);
  });

  it('filters by type', () => {
    expect(filterLabItems(items, { ...EMPTY_QUERY, type: 'probe' }).map((i) => i.id)).toEqual(['a']);
  });

  it('searches title and summary, case-insensitively', () => {
    expect(filterLabItems(items, { ...EMPTY_QUERY, search: 'COOK' }).map((i) => i.id)).toEqual(['b']);
    expect(filterLabItems(items, { ...EMPTY_QUERY, search: 'headers' }).map((i) => i.id)).toEqual(['a']);
  });

  it('requires every search term to match (AND, not OR)', () => {
    expect(filterLabItems(items, { ...EMPTY_QUERY, search: 'recipe kitchen' }).map((i) => i.id)).toEqual(['b']);
    expect(filterLabItems(items, { ...EMPTY_QUERY, search: 'recipe headers' })).toEqual([]);
  });

  it('ignores surrounding and repeated whitespace in the search', () => {
    expect(filterLabItems(items, { ...EMPTY_QUERY, search: '   ' })).toEqual(items);
    expect(filterLabItems(items, { ...EMPTY_QUERY, search: '  lab   filter ' }).map((i) => i.id)).toEqual(['c']);
  });

  it('does not match on tags — search is title + summary only', () => {
    // 'cooking' is a tag on entry b, but appears in no title or summary.
    expect(filterLabItems(items, { ...EMPTY_QUERY, search: 'cooking' })).toEqual([]);
  });

  it('ANDs tag, type and search together', () => {
    expect(
      filterLabItems(items, { tag: 'engine', type: 'build', search: 'dropdown' }).map((i) => i.id),
    ).toEqual(['c']);
    expect(filterLabItems(items, { tag: 'engine', type: 'probe', search: 'dropdown' })).toEqual([]);
  });
});

describe('isFiltered', () => {
  it('is false for the empty query and for whitespace-only search', () => {
    expect(isFiltered(EMPTY_QUERY)).toBe(false);
    expect(isFiltered({ ...EMPTY_QUERY, search: '  ' })).toBe(false);
  });

  it('is true when any constraint is set', () => {
    expect(isFiltered({ ...EMPTY_QUERY, tag: 'ux' })).toBe(true);
    expect(isFiltered({ ...EMPTY_QUERY, type: 'build' })).toBe(true);
    expect(isFiltered({ ...EMPTY_QUERY, search: 'cook' })).toBe(true);
  });
});

describe('describeQuery', () => {
  it('joins the active constraints in a readable order', () => {
    expect(describeQuery({ tag: 'ux', type: 'build', search: 'cook' })).toBe('type build + #ux + "cook"');
    expect(describeQuery({ ...EMPTY_QUERY, tag: 'ux' })).toBe('#ux');
    expect(describeQuery(EMPTY_QUERY)).toBe('');
  });
});
