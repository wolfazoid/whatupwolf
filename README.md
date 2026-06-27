# whatupwolf.com

Personal brand, portfolio, and always-on experimentation lab.
See the full design in [`docs/superpowers/specs/whatupwolf-site.md`](docs/superpowers/specs/whatupwolf-site.md).

## Stack

Astro + TypeScript + content collections, Tailwind CSS v4, deployed to Cloudflare Pages.

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

## Deploy (Cloudflare Pages)

1. Push this repo to GitHub.
2. Cloudflare dashboard → Workers & Pages → Create → Pages → connect the repo.
3. Build command: `npm run build` · Output directory: `dist`.
4. Deploys on every push to `main`.

## Roadmap

Phase 2 (designed for, not yet built): an always-on agent on the local box generates lab
entries via headless Claude Code on a cron, with a public-safe sanitization filter and a
direct-vs-review publishing gate. See the spec.
