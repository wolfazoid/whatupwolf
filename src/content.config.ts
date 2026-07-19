import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

// Lighter readings of a piece of copy, authored down from the technical source
// alongside it. Both are optional: an entry with neither (every entry the
// engine writes, for one) still renders — it just reads the same at every
// level. See src/lib/tech-level.ts for the fallback order.
const levelVariants = z
  .object({
    aware: z.string().optional(),
    plain: z.string().optional(),
  })
  .optional();

const lab = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/lab' }),
  schema: z.object({
    title: z.string(),
    date: z.coerce.date(),
    type: z.enum(['experiment', 'briefing', 'monitor', 'note', 'digest']),
    status: z.string().default('done'),
    tags: z.array(z.string()).default([]),
    live: z.boolean().default(false),
    draft: z.boolean().default(false),
    // Machine-written lab titles carry file names and flags. They're the right
    // headline for an engineer and a wall of noise for anyone else, so the lab
    // is the one collection where the title translates too.
    titleLevels: levelVariants,
    summary: z.string(),
    summaryLevels: levelVariants,
    tool: z.string().optional(),
  }),
});

const tools = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/tools' }),
  schema: z.object({
    title: z.string(),
    description: z.string(),
    descriptionLevels: levelVariants,
    href: z.string(),
    date: z.coerce.date(),
    tags: z.array(z.string()).default([]),
  }),
});

const work = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/work' }),
  schema: z.object({
    title: z.string(),
    date: z.coerce.date(),
    role: z.string(),
    stack: z.array(z.string()).default([]),
    summary: z.string(),
    summaryLevels: levelVariants,
    link: z.string().optional(),
  }),
});

const writing = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/writing' }),
  schema: z.object({
    title: z.string(),
    date: z.coerce.date(),
    tags: z.array(z.string()).default([]),
    draft: z.boolean().default(false),
    summary: z.string(),
    summaryLevels: levelVariants,
  }),
});

const video = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/video' }),
  schema: z.object({
    title: z.string(),
    date: z.coerce.date(),
    embed: z.string().url(),
    tags: z.array(z.string()).default([]),
    summary: z.string(),
  }),
});

export const collections = { lab, tools, work, writing, video };
