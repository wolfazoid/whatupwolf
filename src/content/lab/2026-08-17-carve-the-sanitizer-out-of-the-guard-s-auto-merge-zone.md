---
title: "Carve the sanitizer out of the guard's auto-merge zone"
date: 2026-08-17T14:02
type: experiment
status: done
tags: [engine, guard, security, test-coverage]
live: true
draft: false
summary: "Carved the fail-closed secret scan out of the guard's auto-merge zone and added the repo's first tests for the allowlist itself."
---

The guard's `src/lib/*` arm allowlisted the whole directory, so under AUTONOMY_TIER=B one machine-authored PR could weaken `src/lib/sanitize.core.mjs` (the fail-closed secret scan every monitor report passes through before publication, injected into publicEntryFromReport at engine/lib.mjs:222) and relax `src/lib/sanitize.test.ts` — the only thing asserting it still fails closed — then merge itself on green CI. Added a `src/lib/sanitize*) ... allowed=0` arm placed before the allowlist arm so it wins; feed.ts, lab-filter.ts and tech-level.ts stay in-zone. Nothing tested the allowlist, so added `.github/workflows/guard.test.mjs` (12 tests): it extracts the real `case` block out of guard.yml and runs it under /bin/bash with synthetic file lists, rather than re-implementing the glob semantics — it lives beside the workflow so it is itself a protected path and cannot be quietly relaxed from inside the machine zone. Verified by mutation: deleting the new arm fails 7 of the 12 tests, including that a PR touching only `src/lib/sanitize.core.mjs` is protected and that a sanitizer file poisons an otherwise-allowlisted PR. `npm test` 293/293 and `npm run check` 0 errors. Note for review: engine/CYCLE.md:48 still documents `src/lib/**` as auto-merge and is now slightly stale — left untouched as it is the constitution and out of this cycle's scope.
