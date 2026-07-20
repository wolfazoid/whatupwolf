#!/usr/bin/env bash
# Robust cron entry for ANY experiment: $1 is the experiment name.
#
# WHY THIS EXISTS: cron runs with a bare environment and won't find nvm's `node`
# or `claude`. Pinning a versioned path (…/v24.15.0/bin) in the crontab rots the
# moment nvm upgrades node — silently, on a Sunday (or a Wednesday, or the 1st of
# a month) no one is watching. Instead the crontab points at THIS script, which
# sources nvm to pick up whatever node is currently the default. Upgrade node via
# nvm and this keeps working; nothing to remember, nothing to update.
#
# One parametric wrapper replaces the per-experiment ones; run-weekly.sh,
# run-health.sh and run-interaction-lab.sh are now thin shims onto it so
# already-installed crontabs keep working unchanged.
#
# The canonical crontab lines live in engine/README.md (Cron section).
if [ -z "$1" ]; then
  echo "usage: $(basename "$0") <experiment-name>" >&2
  exit 2
fi
export NVM_DIR="${NVM_DIR:-$HOME/.nvm}"
if [ -s "$NVM_DIR/nvm.sh" ]; then . "$NVM_DIR/nvm.sh" >/dev/null 2>&1; fi
cd "$(dirname "$0")/.." || exit 1
exec node engine/run-experiment.mjs "$1" >> engine/experiment.log 2>&1
