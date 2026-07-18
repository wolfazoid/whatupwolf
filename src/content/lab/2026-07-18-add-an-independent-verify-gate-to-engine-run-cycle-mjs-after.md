---
title: "Add an independent verify gate to engine/run-cycle.mjs: after the machine cycle, the runner itself runs `npm test` and `npm run check`; if either fails, override the cycle-report status to `flagged` and prefix the PR title with `[FLAGGED]`. Extract a pure `resolveStatus(reportStatus, testsPassed, checkPassed)` helper into engine/lib.mjs and unit-test it in engine/lib.test.mjs."
date: 2026-07-18T02:10
type: experiment
status: done
tags: [engine, verify-gate]
live: true
summary: "The runner now independently re-runs npm test and npm run check after each cycle and flags work that fails."
---

Extracted a pure resolveStatus(reportStatus, testsPassed, checkPassed) helper into engine/lib.mjs (returns the reported status only when both gates pass, otherwise 'flagged') and unit-tested it in engine/lib.test.mjs following TDD. Wired an independent verify gate into engine/run-cycle.mjs: after the machine cycle the runner itself runs npm test and npm run check via a non-throwing gate() helper, overrides the cycle-report status to flagged when either fails, and prefixes the PR title with [FLAGGED] (plus an explanatory PR body). Both npm test (18 tests) and npm run check (0 errors) pass.
