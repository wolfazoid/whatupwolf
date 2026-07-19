---
title: "Build a Tools home and link Lab entries to their tools. FOUR parts"
date: 2026-07-19T17:24
type: experiment
status: done
tags: [engine, tools, site]
live: true
draft: false
summary: "Added a tools content collection, a /tools listing page, a Tools nav link, and an optional tool field that links Lab entries to the tool they shipped."
---

Added a `tools` collection to src/content.config.ts (title, description, href, date, tags) with the first entry src/content/tools/cook-mode.md pointing at /tools/cooking.html, and built src/pages/tools/index.astro as a listing page reusing the paper theme and Base layout from work.astro/writing.astro, each card ending in an accent 'Open →' link. Nav.astro gained a single Tools → /tools link in the existing nav-link style. The lab schema gained `tool: z.string().optional()`, rendered on src/pages/lab/[...id].astro as a prominent bordered 'Try it →' button; in LabEntry.astro the card is already wrapped in an anchor, so the tool is signalled there with an accent marker instead of an invalid nested <a>, with the real link on the entry page. npm run check reports 0 errors, npm run build completes 34 pages, and npm test passes 133 tests; the rendered dist output was spot-checked for the Try it, Open, and /tools nav links.
