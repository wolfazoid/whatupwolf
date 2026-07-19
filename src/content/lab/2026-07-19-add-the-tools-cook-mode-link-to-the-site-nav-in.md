---
title: "Add the Tools / Cook Mode link to the site nav in…"
date: 2026-07-19T15:30
type: experiment
status: done
tags: [engine, nav]
live: true
draft: false
summary: "Added a Cook Mode nav link pointing at /tools/cooking.html so the recipe reader is reachable from every page."
---

Added a single entry to the items array in src/components/Nav.astro — { href: '/tools/cooking.html', label: 'Cook Mode' } — placed between Lab and Now, so it inherits the existing paper-theme mono chrome styling and active-state underline without any new markup or CSS. Linked the tool directly rather than introducing a /tools index page, since cooking.html is currently the only tool and no index route exists. Verified the built dist/index.html emits the link with the standard chrome classes and that dist/tools/cooking.html is present. Gates green: npm run build complete (32 pages), npm test 119/119 passed, npm run check 0 errors. Touches src/components, so the PR is gated and waits for Wolf's review.
