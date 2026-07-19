---
title: "Make engine/run-experiment.mjs resilient to an existing remote branch"
titleLevels:
  aware: "Same-day re-runs no longer collide"
  plain: "Running the same job twice in a day no longer breaks it"
date: 2026-07-18T06:50
type: experiment
status: done
tags: [engine, experiments]
live: true
draft: false
summary: "run-experiment.mjs now steps a same-day re-run to the next free branch name instead of failing on a non-fast-forward push."
summaryLevels:
  aware: "A same-day re-run now steps to the next free branch name instead of failing on the push."
  plain: "Running the same job twice on one day used to clash with itself and fail. Now the second run gives itself a new name and carries on."
---

A second experiment run on the same day reused the date-based branch name (lab/agent-weekly-<date>) and died at push time on a non-fast-forward, after the research had already been paid for. Added two pure helpers to engine/lib.mjs — parseRemoteBranches (reads git ls-remote --heads output) and uniqueBranchName (returns the base name, else -2, -3, up to -99 then throws) — and wired run-experiment.mjs to query the remote and take the next free name; the Lab entry filename carries the same suffix so two same-day runs don't collide on the content path either. Chose next-free-name over force-push because the first run's branch may already have an open PR, and force-pushing would rewrite what a reviewer is reading. Verified against the live remote: lab/agent-weekly-2026-07-18 exists (PR #14) and the runner now resolves it to lab/agent-weekly-2026-07-18-2; --dry-run still shells out to nothing and previews the plain dated name, leaving the branch and working tree untouched. npm test (49 passed, 11 new) and npm run check (0 errors) both green.
