---
title: "Pick a reading level for the RSS feed on purpose"
date: 2026-08-17T17:02
type: experiment
status: done
tags: [engine, rss, tech-levels]
live: true
draft: false
summary: "The RSS feed now ships lab titles and summaries at the tech-aware reading instead of the technical source."
---

src/lib/feed.ts declared LabData without the level fields, so buildFeedItems shipped `[type] <technical title>` and the technical summary to every subscriber — the wall of file names the three-level content model exists to prevent, on the one surface with no level switch. Threaded titleLevels/summaryLevels through LabData and added an exported FEED_LEVEL constant, resolved through the existing resolveLevelText fallback so untranslated entries still fall back to their technical source. Picked `aware` rather than `plain`: it drops the internals but keeps the register of the writing posts sitting next to it, which stay at Wolf's own voice and are deliberately left untranslated. feed.test.ts pins FEED_LEVEL and asserts the authored aware copy ships, that untranslated and blank-variant entries fall back, and that writing is untouched; npm test (330) and npm run check (0 errors) both pass, and a build confirms dist/rss.xml carries the aware titles. Note for review: docs/tech-levels.md still lists /rss.xml under "Deliberate limits" as staying technical — that line is now stale, but docs/ is outside this cycle's auto-zone so it was left alone.
