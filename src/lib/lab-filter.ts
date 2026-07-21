// Pure filtering logic for the Lab feed, kept out of the React island so it can
// be unit-tested without a DOM. LabFilter.tsx is the thin presentational shell.

import { resolveLevelText, type LevelText } from './tech-level';

/** The authored-down readings of a field; absent when nobody has written them. */
export type LevelVariants = Omit<LevelText, 'technical'>;

// A serializable view of a lab entry — the Astro page passes plain objects
// (no Date instances) so this can be sent across the SSR→client boundary.
// `title`/`summary` are always the technical source; the *Levels fields carry
// the lighter readings, and the island renders whichever the visitor picked.
export interface LabItem {
  id: string;
  title: string;
  titleLevels?: LevelVariants;
  ts: string;
  type: string;
  status: string;
  tags: string[];
  live: boolean;
  summary: string;
  summaryLevels?: LevelVariants;
  /** A "try it" deep-link to the interactive tool this entry ships, when it
   *  ships one. Present marks the entry as an interactive tool for featuring. */
  tool?: string;
}

export interface LabQuery {
  tag: string | null;
  type: string | null;
  search: string;
}

export const EMPTY_QUERY: LabQuery = { tag: null, type: null, search: '' };

/** A selectable value plus how many entries carry it — the count goes in the
 *  option label so the dropdown stays informative as entries pile up. */
export interface Facet {
  value: string;
  count: number;
}

function tally(values: string[]): Facet[] {
  const counts = new Map<string, number>();
  for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1);
  // Most-used first, alphabetical within a tie — the long tail sinks to the
  // bottom instead of burying common tags in an alphabetical wall.
  return [...counts]
    .map(([value, count]) => ({ value, count }))
    .sort((a, b) => b.count - a.count || a.value.localeCompare(b.value));
}

export function tagFacets(items: LabItem[]): Facet[] {
  return tally(items.flatMap((i) => i.tags));
}

export function typeFacets(items: LabItem[]): Facet[] {
  return tally(items.map((i) => i.type));
}

/** Whitespace-separated terms, all of which must appear somewhere in the
 *  entry's title or summary (case-insensitive substring).
 *
 *  Every reading is searched, not just the one on screen: a visitor at the
 *  plain level types the words they can see, while someone who remembers the
 *  technical wording should still find the entry after it's been translated. */
function matchesSearch(item: LabItem, search: string): boolean {
  const terms = search.toLowerCase().split(/\s+/).filter(Boolean);
  if (terms.length === 0) return true;
  const readings = [
    ...Object.values(resolveLevelText({ technical: item.title, ...item.titleLevels })),
    ...Object.values(resolveLevelText({ technical: item.summary, ...item.summaryLevels })),
  ];
  const haystack = readings.join(' ').toLowerCase();
  return terms.every((t) => haystack.includes(t));
}

/** Filters are ANDed: an entry must satisfy every active constraint. */
export function filterLabItems(items: LabItem[], query: LabQuery): LabItem[] {
  return items.filter(
    (i) =>
      (!query.tag || i.tags.includes(query.tag)) &&
      (!query.type || i.type === query.type) &&
      matchesSearch(i, query.search),
  );
}

export function isFiltered(query: LabQuery): boolean {
  return Boolean(query.tag || query.type || query.search.trim());
}

/** Human-readable description of the active filters, for the empty state. */
export function describeQuery(query: LabQuery): string {
  const parts: string[] = [];
  if (query.type) parts.push(`type ${query.type}`);
  if (query.tag) parts.push(`#${query.tag}`);
  if (query.search.trim()) parts.push(`"${query.search.trim()}"`);
  return parts.join(' + ');
}

// --- Featured strip -------------------------------------------------------
// The Lab feed mixes two kinds of content: curated writeups (interactive tools,
// digests, briefings, monitors) worth headlining, and routine engine build-logs
// (one per cycle). These helpers split the feed so the page can show a featured
// strip above a secondary activity log.

/** Curated read types — substantial human-facing posts that are not a routine
 *  engine build-log. Interactive tools are featured via their `tool:` link
 *  (see isFeatured) rather than by type. */
export const FEATURED_READ_TYPES = ['digest', 'briefing', 'monitor'] as const;

/** How many recent reads the featured strip holds before the rest overflow into
 *  the activity log — enough to headline without letting weekly series (Site
 *  Health, Agent Weekly) bury the tools. Tools are never capped. */
export const DEFAULT_READS_CAP = 6;

const isReadType = (type: string): boolean =>
  (FEATURED_READ_TYPES as readonly string[]).includes(type);

/** A featured entry is either an interactive tool (has a "try it" link) or a
 *  curated read (digest/briefing/monitor). A routine cycle — type `experiment`
 *  with no tool — is not featured. */
export function isFeatured(item: LabItem): boolean {
  return Boolean(item.tool) || isReadType(item.type);
}

export interface LabPartition {
  /** Every entry that ships an interactive tool — never capped (small, stable). */
  tools: LabItem[];
  /** The most recent `readsCap` curated reads (that aren't already tools). */
  reads: LabItem[];
  /** Routine build-logs, plus any reads beyond the cap. */
  log: LabItem[];
}

/** Splits the (newest-first) feed into the featured strip and the activity log.
 *  Each entry lands in exactly one bucket, and input order is preserved within
 *  each. A read that also carries a `tool:` link is treated as a tool. */
export function partitionLab(
  items: LabItem[],
  { readsCap = DEFAULT_READS_CAP }: { readsCap?: number } = {},
): LabPartition {
  const tools: LabItem[] = [];
  const reads: LabItem[] = [];
  const log: LabItem[] = [];
  for (const item of items) {
    if (item.tool) tools.push(item);
    else if (isReadType(item.type)) (reads.length < readsCap ? reads : log).push(item);
    else log.push(item);
  }
  return { tools, reads, log };
}
