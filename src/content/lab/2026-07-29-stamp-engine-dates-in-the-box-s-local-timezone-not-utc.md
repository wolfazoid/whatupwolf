---
title: "Stamp engine dates in the box's local timezone, not UTC"
date: 2026-07-29T18:04
type: experiment
status: done
tags: [engine, timezone]
live: true
draft: false
summary: "Engine dates now stamp in the box's local timezone instead of UTC, so evening cycles stop dating themselves tomorrow."
---

Every date the engine wrote came from new Date().toISOString(), so on a UTC-5 box the day rolled over at 19:00 local and every later cycle stamped tomorrow — the live case was PR #59, opened at 21:00 CDT on 2026-07-28 as 'idea sweep - 2026-07-29'. Added two pure helpers to engine/lib.mjs, localDay(date, timeZone) and localStamp(date, timeZone), both built on Intl.DateTimeFormat('en-CA').formatToParts so the zone and DST arithmetic is the platform's and no dependency is added; each defaults to the box's own zone. The key decision was to keep the date: frontmatter naive local wall-clock rather than adding a -05:00 offset: the Lab pages render the field back through toISOString(), so an offset-bearing stamp would convert straight to UTC and put the entry back on tomorrow. Replaced all four call sites (idea-sweep day and Lab filename in run-cycle.mjs, the day keying the branch/title/entry/report-archive path in run-experiment.mjs, and the frontmatter in lib.mjs), and pinned timeZone explicitly in the two pre-existing renderLabEntry assertions so they keep the same meaning on the box and in CI. Fifteen new unit tests cover both sides of the 19:00-CDT boundary (2026-07-29T02:00:00Z renders 2026-07-28), the exact midnight instants, standard time outside DST, a zone east of UTC, and midnight rendering as 00:00 rather than 24:00. Nothing already published was renamed or rewritten. npm test passes (272 tests, 11 files) and npm run check reports 0 errors; the current clock is 13:00 local so the after-19:00 case was reproduced by running the dry-run under TZ=Pacific/Kiritimati, where local is already 2026-07-30 while UTC is still the 29th, and the runner correctly reported the 30th.
