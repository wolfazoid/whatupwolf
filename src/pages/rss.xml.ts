import rss from '@astrojs/rss';
import { getCollection } from 'astro:content';
import type { APIContext } from 'astro';
import { buildFeedItems } from '../lib/rss-feed';

export async function GET(context: APIContext) {
  // Item construction (draft filtering, per-post links, ordering) lives in
  // src/lib/rss-feed.ts so the guid-uniqueness rule can be unit-tested without
  // a build — see src/lib/rss-feed.test.ts.
  const items = buildFeedItems(await getCollection('lab'), await getCollection('writing'));

  return rss({
    title: 'whatupwolf',
    description: 'Personal brand, portfolio, and always-on experimentation lab.',
    site: context.site ?? 'https://whatupwolf.com',
    items,
  });
}
