---
title: "Harden the guard workflow's allowlist loop against filename injection"
date: 2026-07-29T16:02
type: experiment
status: done
tags: [engine, ci, security]
live: true
draft: false
summary: "Guard workflow now reads the changed-file list from env instead of splicing it into the shell script, so a quoted filename can no longer run as code in the auto-merge job."
---

The allowlist loop in .github/workflows/guard.yml ended with `done <<< '${{ steps.files.outputs.list }}'`, interpolating the file list into a single-quoted shell string inside the job that holds contents:write and pull-requests:write. Fixed by passing the list to the step as `env: LIST: ${{ steps.files.outputs.list }}` and reading `done <<< "$LIST"`, so the value arrives as data. Allowlist semantics are untouched: engine/CYCLE.md still protected, src/content/lab/*|engine/*|src/lib/* still allowed, Tier A/B split unchanged. Verified by replaying both loop forms locally against the payload `docs/a'; touch /tmp/PWNED; echo 'b.md` — the old form executed the injected command, the new form saw one filename and marked it protected (allowed=0); a path like src/lib/o'brien.ts is read as a single filename and matched as normal. npm test (255 tests, 11 files) and npm run check (0 errors) both pass. Touches .github/workflows/** so the PR is gated for Wolf's manual merge.
