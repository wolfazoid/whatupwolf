import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

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
    summary: z.string(),
    tool: z.string().optional(),
  }),
});

const tools = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/tools' }),
  schema: z.object({
    title: z.string(),
    description: z.string(),
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
