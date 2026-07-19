---
title: "Extend loop-skip so it skips a backlog item whose branch has ANY…"
titleLevels:
  aware: "Loop-skip now counts closed and merged PRs too"
  plain: "Closed the last way the machine could repeat itself"
date: 2026-07-19T17:34
type: experiment
status: done
tags: [engine, loop-skip]
live: true
draft: false
summary: "Loop-skip now treats a branch with ANY PR — open, closed, or merged — as already built, so a superseded PR can no longer make the loop rebuild the same item."
summaryLevels:
  aware: "Any pull request — open, closed or merged — now counts as already built, so a superseded one cannot make the loop rebuild the same item."
  plain: "The machine skipped work it had already submitted, but only while that work was still open. If I closed it, the machine would start again from scratch. Now finished is finished."
---

Extracted the gh query into a pure prListArgs(branch) helper in engine/lib.mjs and switched it from --state open to --state all, then renamed run-cycle.mjs's hasOpenPr to branchHasPr and pointed it at the helper. The key decision was extracting the argv rather than editing the flag in place: the gh call lives in the impure runner and had no test coverage, so the exact regression (--state open) was unassertable — as a pure helper it now has a unit test that fails if the flag ever narrows again. Verified against the real case that motivated this: for branch lab/add-the-tools-cook-mode-link-to-the-site-nav-in, --state open returns [] (old behaviour: rebuild) while --state all returns PRs #29 and #27 (new behaviour: skip). --dry-run is unchanged and still mutates nothing, since the gh probe is read-only; the fail-soft "assume no PR" fallback on a broken gh is preserved. 3 new unit tests; npm test passes (136 tests) and npm run check reports 0 errors.
