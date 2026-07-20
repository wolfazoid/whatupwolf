---
title: "Extract the experiment registry into a module and collapse the wrapper…"
date: 2026-07-20T19:20
type: experiment
status: done
tags: [engine, refactor, experiments]
live: true
draft: false
summary: "Extracted the experiment registry into engine/experiments/registry.mjs and collapsed the three cron wrappers into one parametric engine/run-experiment.sh, with the named scripts kept as backward-compat shims."
---

Moved the EXPERIMENTS object and its explanatory comment verbatim out of engine/run-experiment.mjs into engine/experiments/registry.mjs and imported it back — a pure data/logic split with no behavior change. Added engine/experiments/registry.test.mjs (17 assertions) checking every entry has kind in {digest, monitor}, type in the lab content enum, a non-empty titlePrefix, and — for monitors — a target; the test was verified to bite by temporarily corrupting three fields, which failed exactly the three expected cases. Added engine/run-experiment.sh, one parametric wrapper taking the experiment name as $1 (missing arg exits 2), carrying the nvm/robustness comment, and tracked at mode 100755; run-weekly.sh, run-health.sh and run-interaction-lab.sh are now one-line execs onto it, so already-installed crontabs keep working with zero migration. Verified with --dry-run for all four experiments, a temp-dir harness proving each shim passes the right name and cds to the repo root from any cwd, and README updated to the canonical `run-experiment.sh <name>` cron form; npm test (180 passed) and npm run check (0 errors) are both green.
