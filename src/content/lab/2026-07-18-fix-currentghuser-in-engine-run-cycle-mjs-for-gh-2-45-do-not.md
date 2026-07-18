---
title: "Fix currentGhUser() in engine/run-cycle.mjs for gh 2.45: do not use the unsupported `gh auth status --active` flag; instead parse `gh auth status` output for the account marked active. Extract the parsing into a pure helper in engine/lib.mjs and unit-test it against sample gh output."
date: 2026-07-18T02:21
type: experiment
status: done
tags: [engine, gh-cli]
live: true
summary: "Fixed currentGhUser() for gh 2.45 by parsing `gh auth status` instead of using the removed `--active` flag."
---

gh 2.45 dropped `gh auth status --active`, which broke the runner's account detection and its restore-previous-user logic. I extracted a pure `parseActiveGhAccount()` helper into engine/lib.mjs that scans the full `gh auth status` text, tracking each 'Logged in to <host> account <name>' block and returning the one whose 'Active account: true' line matches. run-cycle.mjs now calls plain `gh auth status` (capturing stderr as a fallback for versions that print there) and delegates to the helper. Six new unit tests cover single/multi-account, no-active, logged-out, and non-string inputs; npm test (24) and npm run check both pass.
