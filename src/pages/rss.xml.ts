import rss from '@astrojs/rss';
import { getCollection } from 'astro:content';
import type { APIContext } from 'astro';

export async function GET(context: APIContext) {
  const lab = (await getCollection('lab')).filter((e) => !e.data.draft);
  const writing = (await getCollection('writing')).filter((e) => !e.data.draft);

  const items = [
    ...lab.map((e) => ({
      title: `[${e.data.type}] ${e.data.title}`,
      pubDate: e.data.date,
      description: e.data.summary,
      link: `/lab/${e.id}/`,
    })),
    ...writing.map((e) => ({
      title: e.data.title,
      pubDate: e.data.date,
      description: e.data.summary,
      link: `/writing/`,
    })),
  ].sort((a, b) => b.pubDate.valueOf() - a.pubDate.valueOf());

  return rss({
    title: 'whatupwolf',
    description: 'Personal brand, portfolio, and always-on experimentation lab.',
    site: context.site ?? 'https://whatupwolf.com',
    items,
  });
}
