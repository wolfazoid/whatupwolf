// RSS item construction — the pure core behind src/pages/rss.xml.ts.
//
// @astrojs/rss derives `<guid isPermaLink="true">` from each item's `link`, so
// two items sharing a link share a guid and readers dedupe one of them away.
// That is exactly what happened while every writing item pointed at the
// collection listing (`/writing/`). Every item now carries its own per-post
// route, which is also the page that actually renders its body. Keeping the
// mapping here — pure, no astro:content import — lets the uniqueness rule be
// unit-tested without a build.

export interface FeedItem {
  title: string;
  pubDate: Date;
  description: string;
  link: string;
}

/** The shape this module needs from a collection entry — structural on
 *  purpose, so the real `CollectionEntry<'lab'>` satisfies it as-is. */
export interface FeedEntry<Data> {
  id: string;
  data: Data;
}

export interface LabData {
  title: string;
  date: Date;
  type: string;
  summary: string;
  draft: boolean;
}

export interface WritingData {
  title: string;
  date: Date;
  summary: string;
  draft: boolean;
}

/** Trailing slashes match the routes Astro emits for `[...id].astro`. */
export function labPath(id: string): string {
  return `/lab/${id}/`;
}

export function writingPath(id: string): string {
  return `/writing/${id}/`;
}

/**
 * Published lab + writing entries as feed items, newest first. Drafts never
 * reach the feed; every surviving item links to its own page.
 */
export function buildFeedItems(
  lab: FeedEntry<LabData>[],
  writing: FeedEntry<WritingData>[],
): FeedItem[] {
  return [
    ...lab
      .filter((e) => !e.data.draft)
      .map((e) => ({
        title: `[${e.data.type}] ${e.data.title}`,
        pubDate: e.data.date,
        description: e.data.summary,
        link: labPath(e.id),
      })),
    ...writing
      .filter((e) => !e.data.draft)
      .map((e) => ({
        title: e.data.title,
        pubDate: e.data.date,
        description: e.data.summary,
        link: writingPath(e.id),
      })),
  ].sort((a, b) => b.pubDate.valueOf() - a.pubDate.valueOf());
}
