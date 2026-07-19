---
title: "De-duplicate the Cook Mode Lab entries"
date: 2026-07-19T15:28
type: experiment
status: done
tags: [engine, lab-content]
live: true
draft: false
summary: "Removed the duplicate generic build-log Lab entry for Cook Mode, leaving the single dedicated writeup."
---

PR #25 published two Lab entries describing the same tool: a dedicated 'Cook Mode' writeup and a generic build-log entry titled after the backlog item. Compared both files and confirmed identical subject matter (public/tools/cooking.html), then deleted src/content/lab/2026-07-18-research-and-build-a-first-prototype-of-a-better-recipe-cook.md and kept the dedicated writeup, which carries the fuller research/decisions/verification detail. A grep for 'Cook Mode' and 'cooking.html' across src/content/lab now matches exactly one file. Gates green: npm run build complete (31 pages, the removed route no longer emitted), npm test 119/119 passed, npm run check 0 errors.
