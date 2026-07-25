---
title: "Give writing posts their own pages and fix the RSS guid collision.…"
date: 2026-07-24T18:03
type: experiment
status: done
tags: [engine, writing, rss, routing]
live: true
draft: false
summary: "Writing posts get per-post routes and the RSS feed's writing guid collision is fixed."
---

Added src/pages/writing/[...id].astro mirroring the lab per-post page (Base layout, paper theme, mono chrome, tech-level data-variant on the summary and tag row) and moved the listing to src/pages/writing/index.astro so each entry title links to its own route. Extracted feed item construction into src/lib/feed.ts — drafts filtered, lab items at /lab/<id>/ and writing items at /writing/<id>/, newest first — and rewired src/pages/rss.xml.ts to it, so @astrojs/rss now derives a distinct permalink guid per item instead of pointing every writing item at /writing/. New unit tests in src/lib/feed.test.ts assert link uniqueness across two writing posts, draft exclusion, and ordering. Verified with a temporary second writing post: the build emitted /writing/why-a-lab/ and /writing/__tmp-guid-check/ as separate pages and the feed carried 40 items with 40 unique <guid>/<link> values; the fixture was removed and a clean rebuild, npm test (213 passing) and npm run check (0 errors) all pass.
