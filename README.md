# whatupwolf.com

Personal brand, portfolio, and always-on experimentation lab.
See the full design in [`docs/superpowers/specs/whatupwolf-site.md`](docs/superpowers/specs/whatupwolf-site.md).

## Stack

Astro + TypeScript + content collections, Tailwind CSS v4, deployed to Cloudflare Workers.
The build is static-first: every page prerenders. The Cloudflare adapter still emits a
worker (`dist/_worker.js`) so on-demand routes can be added later; none exist today.

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

`wrangler.jsonc` uploads `dist/` as static assets plus the adapter's worker at
`dist/_worker.js`.

The market feed that used to live at `/feed` moved to a private, self-hosted system
(2026-11-10); see
[`docs/superpowers/specs/2026-11-10-private-market-desk-design.md`](docs/superpowers/specs/2026-11-10-private-market-desk-design.md).

## Roadmap

Phase 2 (designed for, not yet built): an always-on agent on the local box generates lab
entries via headless Claude Code on a cron, with a public-safe sanitization filter and a
direct-vs-review publishing gate. See the spec.
