// RSS item construction — the pure core behind src/pages/rss.xml.ts.
//
// @astrojs/rss derives `<guid isPermaLink="true">` from each item's `link`, so
// two items sharing a link share a guid and readers dedupe one of them away.
// That is exactly what happened while every writing item pointed at the
// collection listing (`/writing/`). Every item now carries its own per-post
// route, which is also the page that actually renders its body. Keeping the
// mapping here — pure, no astro:content import — lets the uniqueness rule be
// unit-tested without a build.
//
// A feed reader has no tech-level switch, so this is the one surface that has
// to pick a reading depth on the subscriber's behalf — see FEED_LEVEL below.

import { resolveLevelText, type LevelText, type TechLevel } from './tech-level';

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

/** The authored-down readings of a field; absent when nobody has written
 *  them. Same shape the Lab page and LabEntry pass around. */
export type LevelVariants = Omit<LevelText, 'technical'>;

export interface LabData {
  title: string;
  titleLevels?: LevelVariants;
  date: Date;
  type: string;
  summary: string;
  summaryLevels?: LevelVariants;
  draft: boolean;
}

/** Writing has `summaryLevels` in its schema, but the feed deliberately ignores
 *  it: those posts are Wolf's own voice, and the technical source *is* the
 *  post. Only the machine-written lab copy gets translated down. */
export interface WritingData {
  title: string;
  date: Date;
  summary: string;
  draft: boolean;
}

/**
 * The depth lab entries ship at in the feed.
 *
 * Lab titles and summaries are written by the engine, technical-first: they
 * carry file names, line numbers and flags. On the site a visitor can turn that
 * down; a feed reader can't, so subscribing to the technical source means
 * subscribing to a wall of file names. `aware` is the deliberate pick — it
 * drops the internals but keeps the register of the writing posts alongside it,
 * where `plain` would read oddly next to Wolf's own untranslated voice.
 *
 * Entries the engine hasn't had translated fall back to their technical source
 * (see resolveLevelText), so nothing goes missing.
 */
export const FEED_LEVEL: TechLevel = 'aware';

function atFeedLevel(technical: string, levels?: LevelVariants): string {
  return resolveLevelText({ technical, ...levels })[FEED_LEVEL];
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
 * reach the feed; every surviving item links to its own page, and lab copy
 * ships at FEED_LEVEL rather than at its technical source.
 */
export function buildFeedItems(
  lab: FeedEntry<LabData>[],
  writing: FeedEntry<WritingData>[],
): FeedItem[] {
  return [
    ...lab
      .filter((e) => !e.data.draft)
      .map((e) => ({
        // The type prefix stays at every level — it's the feed's only
        // classifier, and it reads as a label rather than as jargon.
        title: `[${e.data.type}] ${atFeedLevel(e.data.title, e.data.titleLevels)}`,
        pubDate: e.data.date,
        description: atFeedLevel(e.data.summary, e.data.summaryLevels),
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
