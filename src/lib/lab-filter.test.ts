import { describe, it, expect } from 'vitest';
import {
  EMPTY_QUERY,
  describeQuery,
  filterLabItems,
  isFiltered,
  tagFacets,
  typeFacets,
  isFeatured,
  partitionLab,
  DEFAULT_READS_CAP,
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

  it('matches a term that only appears in a lighter reading of the entry', () => {
    // A visitor reading the plain level searches the words they can see. The
    // technical source says "probe"; only the plain variant says "checkup".
    const translated = item({
      id: 'd',
      title: 'Site health probe',
      titleLevels: { plain: 'A weekly checkup for the website' },
      summary: 'Audits TLS expiry and CSP headers.',
      summaryLevels: { plain: 'Checks the site is safe and still working.' },
    });
    expect(
      filterLabItems([translated], { ...EMPTY_QUERY, search: 'checkup' }).map((i) => i.id),
    ).toEqual(['d']);
    expect(
      filterLabItems([translated], { ...EMPTY_QUERY, search: 'safe' }).map((i) => i.id),
    ).toEqual(['d']);
  });

  it('still matches the technical wording once an entry is translated', () => {
    const translated = item({
      id: 'e',
      title: 'Site health probe',
      titleLevels: { plain: 'A weekly checkup for the website' },
    });
    expect(
      filterLabItems([translated], { ...EMPTY_QUERY, search: 'probe' }).map((i) => i.id),
    ).toEqual(['e']);
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

describe('isFeatured', () => {
  it('features an entry that ships an interactive tool', () => {
    expect(isFeatured(item({ id: 't', type: 'experiment', tool: '/tools/x.html' }))).toBe(true);
  });
  it('features curated read types (digest / briefing / monitor)', () => {
    for (const type of ['digest', 'briefing', 'monitor']) {
      expect(isFeatured(item({ id: type, type }))).toBe(true);
    }
  });
  it('does NOT feature a routine build-log (experiment, no tool)', () => {
    expect(isFeatured(item({ id: 'r', type: 'experiment' }))).toBe(false);
  });
  it('does NOT feature a plain note', () => {
    expect(isFeatured(item({ id: 'n', type: 'note' }))).toBe(false);
  });
});

describe('partitionLab', () => {
  it('routes tools, reads, and routine build-logs to their buckets', () => {
    const input = [
      item({ id: 'tool', type: 'experiment', tool: '/tools/x.html' }),
      item({ id: 'digest', type: 'digest' }),
      item({ id: 'cycle', type: 'experiment' }),
    ];
    const { tools, reads, log } = partitionLab(input);
    expect(tools.map((i) => i.id)).toEqual(['tool']);
    expect(reads.map((i) => i.id)).toEqual(['digest']);
    expect(log.map((i) => i.id)).toEqual(['cycle']);
  });

  it('treats a read that also carries a tool link as a tool', () => {
    const { tools, reads } = partitionLab([item({ id: 'x', type: 'monitor', tool: '/tools/x.html' })]);
    expect(tools.map((i) => i.id)).toEqual(['x']);
    expect(reads).toEqual([]);
  });

  it('caps reads and overflows the older ones into the log, newest kept', () => {
    // 8 digests, newest-first; cap is default 6.
    const digests = Array.from({ length: 8 }, (_, i) => item({ id: `d${i}`, type: 'digest' }));
    const { reads, log } = partitionLab(digests);
    expect(reads).toHaveLength(DEFAULT_READS_CAP);
    expect(reads.map((i) => i.id)).toEqual(['d0', 'd1', 'd2', 'd3', 'd4', 'd5']);
    expect(log.map((i) => i.id)).toEqual(['d6', 'd7']); // overflow, still in order
  });

  it('never caps tools — they all stay featured', () => {
    const tools = Array.from({ length: 9 }, (_, i) => item({ id: `t${i}`, tool: `/tools/${i}.html` }));
    const { tools: featured, log } = partitionLab(tools, { readsCap: 2 });
    expect(featured).toHaveLength(9);
    expect(log).toEqual([]);
  });

  it('preserves newest-first order and interleaves overflow reads into the log', () => {
    const input = [
      item({ id: 'cycleA', type: 'experiment' }),
      item({ id: 'read1', type: 'briefing' }),
      item({ id: 'cycleB', type: 'experiment' }),
      item({ id: 'read2', type: 'briefing' }),
    ];
    const { reads, log } = partitionLab(input, { readsCap: 1 });
    expect(reads.map((i) => i.id)).toEqual(['read1']);
    expect(log.map((i) => i.id)).toEqual(['cycleA', 'cycleB', 'read2']); // overflow read2 kept in place
  });

  it('handles an empty feed', () => {
    expect(partitionLab([])).toEqual({ tools: [], reads: [], log: [] });
  });
});
