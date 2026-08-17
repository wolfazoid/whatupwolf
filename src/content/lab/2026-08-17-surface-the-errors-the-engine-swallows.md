---
title: "Surface the errors the engine swallows"
date: 2026-08-17T16:07
type: experiment
status: done
tags: [engine, observability]
live: true
draft: false
summary: "The engine's swallowed best-effort failures are now counted from cycle.log and reported in the Agent Weekly digest, so a silently broken path leaves the box."
---

Added `engine/log-scan.mjs`: a defensive scan of the gitignored `engine/cycle.log` that counts the best-effort failures the engine catches and logs but never surfaces. The watched set is `SWALLOWED_ERROR_PATTERNS` in `engine/lib.mjs` — the three idle-notice catches in notify.mjs, run-cycle's PR lookup, both runners' recoverToMain, and publish.mjs's gh-account restore — deliberately excluding failures that already reach a surface off the box (a failed cycle or experiment exits non-zero, a failed sweep leads the idle notice, a failed verify gate flags the PR). Each pattern matches the whole emitted line shape rather than its opening words, because cycle.log also carries the full task text of every cycle and this tier's own backlog line quotes two of those messages in prose; a unit test asserts that prose is not counted.

The scan reads only the bytes appended since the previous digest, tracked as a byte offset in the gitignored `engine/.log-scan.json`. Key decision: the reporting surface is the Agent Weekly digest, appended by the runner rather than requested from the machine — the digest prompt researches the outside world and has no business reading the log, and a fact this exists to stop losing must not depend on a model remembering to include it. Opting in is `selfCheck: true` on a registry entry. `--dry-run` scans without advancing the offset, so a preview never eats the window the next real run should report.

The scan cannot throw: a missing log, a corrupt state file, an unreadable path, and a log rotated or truncated under the recorded offset each return "no data" with a reason or restart from the top of the file — and it renders "no data" rather than "0", since a scanner reporting zero failures it never looked for would be a second silent failure. The read is capped at 4 MiB with the partial first line dropped, because the unbounded read is what broke the notifier in the first place.

Verification: `npm test` → 325 passed (12 files), 26 new. `npm run check` → 0 errors, 0 warnings. `node engine/run-experiment.mjs agent-weekly --dry-run` previews the Engine self-check section against the real log — it finds 180 swallowed lines, all of them the 2026-08-11 ENOBUFS burst, and writes no state file. The other experiments' dry-runs are unchanged.
