# whatupwolf.com

Personal brand, portfolio, and always-on experimentation lab.
See the full design in [`docs/superpowers/specs/whatupwolf-site.md`](docs/superpowers/specs/whatupwolf-site.md).

## Stack

Astro + TypeScript + content collections, Tailwind CSS v4, deployed to Cloudflare Workers.
The build is static-first: every page prerenders, except `/api/events`, which runs
on-demand in the worker (`dist/_worker.js`) that the Cloudflare adapter emits. The
`/feed` page polls `/api/events` for public market data (SEC EDGAR filings).

## Develop

```bash
npm install
npm run dev      # local dev server
npm run build    # static build → dist/
npm run preview  # preview the build
npm run check    # type + content check
```

## Content

Each entry is one Markdown file with frontmatter. Collections live in `src/content/`:

- `lab/` — machine output (`type: experiment | briefing | monitor | note`, plus
  `status`, `tags`, `live`, `draft`). This is what the always-on box writes to.
- `work/`, `writing/`, `video/` — human-curated.

Publishing = write a `.md` file, commit, push. Cloudflare auto-deploys on push to `main`.

## Deploy (Cloudflare Workers)

```bash
npm run build
npx wrangler deploy
```

`wrangler.jsonc` uploads `dist/` as static assets plus the worker at
`dist/_worker.js` for `/api/events`. `PUBLIC_FEED` gates which market-data
sources the worker serves: unset builds the public deploy (EDGAR and other
public sources only); set to exactly `'false'` builds the private/tailnet
deploy, which also serves licensed sources (e.g. Benzinga). Never set
`PUBLIC_FEED=false` on the public deploy — see `src/lib/feed/sources.ts`.

## Roadmap

Phase 2 (designed for, not yet built): an always-on agent on the local box generates lab
entries via headless Claude Code on a cron, with a public-safe sanitization filter and a
direct-vs-review publishing gate. See the spec.
