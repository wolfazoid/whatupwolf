---
title: "Move post-failure recovery inside the single-instance lock"
date: 2026-07-29T17:03
type: experiment
status: done
tags: [engine, concurrency]
live: true
draft: false
summary: "Post-failure git recovery now runs inside the single-instance lock in both runners, closing the window where a second tick could have its untracked files cleaned out."
---

Both runners released engine/.run.lock in main()'s finally while recoverToMain() — `git checkout -f main` + `git clean -fd` — was called from the outer top-level catch, so recovery ran unlocked at the one moment the tree is guaranteed half-finished; a second tick could take the freed lock and have its untracked files deleted mid-recovery. Extracted the sequencing into a new lib.mjs helper, runLocked({acquire, run, recover, onBusy, onFail}), which catches inside the locked region, logs, recovers, and only then releases in the finally; it returns an outcome so the runner supplies the exit code, because process.exit(1) would have skipped the release. run-cycle.mjs and run-experiment.mjs both adopt it with their existing log wording and exit 1 preserved, the outer catch now covering only pre-lock failures, and the backwards comment claiming the finally covered "the outer catch/recover" was corrected. Five unit tests assert the ordering with fakes and no real git — the failure cases fail against the old release-first shape and pass against the new one. npm test (260) and npm run check both pass; --dry-run smoke runs of both runners behave as before.
