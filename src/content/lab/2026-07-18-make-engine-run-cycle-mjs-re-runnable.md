---
title: "Make engine/run-cycle.mjs re-runnable"
date: 2026-07-18T03:10
type: experiment
status: done
tags: [engine, resilience]
live: true
summary: "Made the lab engine runner re-runnable — reuses an existing lab/<slug> branch and returns to a clean main on any cycle failure."
---

Switched branch setup from `git checkout -b` to `-B`, so a leftover lab/<slug> from an earlier attempt is hard-reset to main instead of crashing on 'branch exists'. Converted the three mid-cycle failure exits (claude error, missing report, unparseable report) into thrown errors caught by a single top-level handler that calls a new recoverToMain() — `git checkout -f main` + `git clean -fd`, both of which respect .gitignore so PAUSED/cron.log/node_modules/.env are untouched. Documented the behavior in engine/README.md. npm test (32 passing) and npm run check (0 errors) both green.
