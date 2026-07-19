---
title: "Build a visitor-selectable **tech level** for the whole site. A…"
date: 2026-07-19T20:39
type: experiment
status: done
tags: [site, tech-level, content-model, accessibility]
live: true
draft: false
summary: "Added a visitor-selectable tech level — technical, tech-aware, or plain — that re-reads the whole site from pre-authored copy variants, switched client-side by CSS with no per-element JavaScript."
---

The constraint was a static Astro build on Cloudflare, so all three readings are authored ahead of time and ship together in the HTML: a blocking inline script in Base.astro restores the saved level onto <html data-level>, and one unlayered CSS rule hides every [data-variant] element whose token list omits that level. Choosing the cascade over React state meant the Lab's existing client island needed no level awareness at all — it renders every reading and the stylesheet picks one — and with JavaScript off the rule falls through to the technical source, leaving the site exactly as it was. Content collections gained optional summaryLevels/descriptionLevels (plus titleLevels on lab, where machine-written titles carry file names), with a plain-to-aware-to-technical fallback so untranslated entries still render; all 33 existing content files were then translated down by hand, and the engine tags and /work stack chips are marked technical-only rather than left as jargon for plain readers. Lab entry bodies, page <title>/meta and RSS deliberately stay technical, and lighter levels get an honest note that the body below is written for engineers instead of a fabricated translation. 25 new unit tests cover the level vocabulary, the fallback and variant-collapsing rules, search across all readings, and a guard that fails if the un-importable inline boot script drifts from src/lib/tech-level.ts; npm test 163 passed, npm run check 0 errors, build 36 pages, and the built HTML was re-read at each level to verify. Touches pages, components, layout, content and config — a gated path, so this PR waits for review.
