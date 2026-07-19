---
title: "Make the self-building loop skip a backlog item whose branch already…"
titleLevels:
  aware: "The loop skips items already waiting on review"
  plain: "The machine stopped redoing work it had already finished"
date: 2026-07-18T21:08
type: experiment
status: done
tags: [engine, loop-skip]
live: true
draft: false
summary: "The loop now skips backlog items whose branch already has an open PR, so an unmerged gated PR no longer parks the cycle on the same item."
summaryLevels:
  aware: "The loop now skips any backlog item that already has an open pull request, so work waiting on review no longer blocks the queue."
  plain: "When a piece of work was finished but still waiting for my approval, the machine kept picking it up and building it again. Now it moves on to the next thing."
---

Extracted two pure helpers into engine/lib.mjs: branchForItem(title) (shortTitle + slugify, so selection and checkout always agree on the name) and pickBuildableItem(items, takenBranches), which returns the first unchecked item whose branch is not taken. run-cycle.mjs wraps it in pickNextBuildable(), asking `gh pr list --head <branch> --state open` one branch at a time and adding any in-flight branch to the taken set before re-picking — so a long backlog does not fan out a gh call per item. The key decision was making the gh probe fail-soft: if gh is missing or errors it logs and reports "no PR", leaving pre-existing behaviour intact rather than wedging the loop on a broken CLI. Verified the real path — branchForItem reproduces open PR #22's head branch exactly, meaning the Tier 6 item that previously had to be checked off by hand would now be skipped automatically; --dry-run still mutates nothing (the gh query is read-only). 14 new unit tests; npm test passes (85 tests) and npm run check reports 0 errors.
