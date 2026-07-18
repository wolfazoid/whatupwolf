#!/usr/bin/env bash
# Robust cron entry for Agent Weekly.
#
# WHY THIS EXISTS: cron runs with a bare environment and won't find nvm's `node`
# or `claude`. Pinning a versioned path (…/v24.15.0/bin) in the crontab rots the
# moment nvm upgrades node — silently, on a Sunday no one is watching. Instead the
# crontab points at THIS script, which sources nvm to pick up whatever node is
# currently the default. Upgrade node via nvm and this keeps working; nothing to
# remember, nothing to update.
#
# The canonical crontab line lives in engine/README.md (Experiments section).
export NVM_DIR="${NVM_DIR:-$HOME/.nvm}"
if [ -s "$NVM_DIR/nvm.sh" ]; then . "$NVM_DIR/nvm.sh" >/dev/null 2>&1; fi
cd "$(dirname "$0")/.." || exit 1
exec node engine/run-experiment.mjs agent-weekly >> engine/experiment.log 2>&1
