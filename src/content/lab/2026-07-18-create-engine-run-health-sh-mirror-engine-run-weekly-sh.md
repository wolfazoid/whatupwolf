---
title: "Create engine/run-health.sh (mirror engine/run-weekly.sh"
date: 2026-07-18T07:05
type: experiment
status: done
tags: [engine, cron]
live: true
draft: false
summary: "Added engine/run-health.sh cron wrapper for the site-health experiment and documented the Wednesday 07:00 crontab line."
---

Created engine/run-health.sh as a direct mirror of run-weekly.sh: it sources nvm from NVM_DIR, cds to the repo root via dirname "$0"/.., and execs `node engine/run-experiment.mjs site-health >> engine/experiment.log 2>&1`. Marked it executable (0755, matching run-weekly.sh) and verified `bash -n` parses it and that `node engine/run-experiment.mjs site-health --dry-run` resolves and renders an entry, so the exec'd command is real. Updated the README Cron section to carry both canonical lines (Sundays 07:00 run-weekly.sh, Wednesdays 07:00 run-health.sh), restated the point-cron-at-the-wrapper rule for both, and added a note that the wrappers must stay chmod +x since cron fails quietly otherwise. npm test (76 tests, 4 files) and npm run check (0 errors) both pass.
