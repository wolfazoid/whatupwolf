---
title: "Add an in-code single-instance lock to engine/run-cycle.mjs AND…"
date: 2026-07-21T03:05
type: experiment
status: done
tags: [engine, single-instance-lock]
live: true
draft: false
summary: "Added a dependency-free pidfile single-instance lock to both engine runners so overlapping runs can't corrupt each other's git state."
---

Extracted the pure decision `lockIsFree(lockContents, isAlive)` into engine/lib.mjs (free when the file is missing, holds no valid pid, or names a dead pid) and unit-tested the free / held-by-live / stale-pid / garbage cases. In run-cycle.mjs and run-experiment.mjs, after the PAUSED kill switch and before any git/network work, acquireLock() exclusively creates engine/.run.lock ('wx') with the pid, clears a stale lock and retries, or exits 0 with 'another run in progress — exiting' when a live process holds it; a finally releases on every path including the catch/recover, and release only deletes a lock it still owns. --dry-run takes no lock (no-op release, no side effects), and engine/.run.lock is gitignored. Verified: npm test (184 passing) and npm run check both green; a planted live-pid lock made a real run exit 0 before touching git.
