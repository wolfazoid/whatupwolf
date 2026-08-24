---
title: "Re-arm auto-merge when a PR turns green, and serialise the guard"
date: 2026-08-17T13:05
type: experiment
status: done
tags: [engine, ci, guard, auto-merge]
live: true
draft: false
summary: "Guard re-arms auto-merge when CI goes green, disarms it when a PR moves onto a protected path, and serialises its jobs per PR."
---

guard.yml armed auto-merge exactly once, at PR open, on a pull_request trigger only — so when GitHub dropped PR #77's pending arming on a check-state transition (2026-08-11, 24s after it was set), nothing re-triggered the workflow and a green allowlisted PR sat unmerged until later sweeps made it CONFLICTING. Added a second trigger on workflow_run for the CI workflow rather than check_suite, because a check_suite completed event does not start a workflow when the suite was created by GitHub Actions, which is exactly this case. The re-arm path resolves the open PR for the run's head SHA, refuses the event if the PR has since moved past that SHA or if CI was red, and then runs the same allowlist evaluation as the first arming, so it can never merge a diff the guard already rejected. Added concurrency keyed on the head branch (the only value both event types can produce) with cancel-in-progress limited to pull_request, so a newer push kills an older in-flight evaluation but a CI completion queues behind instead of cancelling one; also closed the opposite half of the same hinge with a gh pr merge --disable-auto step on the protected branch, made the needs-human comment idempotent so the new trigger does not re-comment, and moved the file list out of a single-quoted YAML interpolation into an env var. Verified with a new engine/guard-workflow.test.mjs that lifts the workflow's actual shell blocks out of the YAML and runs them against a stubbed gh (15 tests: allowlist decisions including a quote-in-filename case, and all six PR-resolution branches); it errors out against the pre-change guard.yml and passes against the new one. npm test 296/296 and npm run check 0 errors. Touches .github/workflows/** — GATED, needs Wolf's review and manual merge; note the workflow_run trigger only takes effect once this is on main.
