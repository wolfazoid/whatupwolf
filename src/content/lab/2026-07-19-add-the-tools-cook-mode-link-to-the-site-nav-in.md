---
title: "Add the Tools / Cook Mode link to the site nav in…"
date: 2026-07-19T17:21
type: experiment
status: done
tags: [engine, nav, tools]
live: true
draft: false
summary: "Added a Cook Mode nav link pointing at /tools/cooking.html in src/components/Nav.astro."
---

Added a single entry to the items array in src/components/Nav.astro — { href: '/tools/cooking.html', label: 'Cook Mode' } — placed between Lab and Now so the tool sits alongside the other build-output sections. No markup or styling changes were needed: the existing map already applies the paper-theme mono chrome class and the active-path underline, so the new link inherits them. Labelled it 'Cook Mode' rather than 'Tools' because no /tools listing page exists yet (that is a later backlog item, which will replace this per-tool link with a Tools → /tools link). Gates green: npm run build complete (33 pages), npm run check 0 errors/0 warnings/0 hints, npm test 133/133 passed; grep of dist/index.html confirms the rendered anchor and dist/tools/cooking.html is emitted.
