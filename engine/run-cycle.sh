#!/usr/bin/env bash
# Robust cron entry for the self-building loop (run-cycle.mjs).
#
# WHY THIS EXISTS (two reasons):
#
# 1. nvm environment — cron runs with a bare environment and won't find nvm's
#    `node` or `claude`. Pinning a versioned path (…/v24.15.0/bin) in the crontab
#    rots the moment nvm upgrades node — silently. So the crontab points at THIS
#    script, which sources nvm to pick up whatever node is currently the default.
#    (Same rule as run-weekly.sh / run-health.sh.)
#
# 2. Overlap protection — a cycle can run for several minutes (a research cycle
#    longer). If the next hourly tick fired while one was still running, two
#    run-cycle.mjs processes would both `git checkout main` and corrupt each
#    other's branch state. `flock -n` takes a non-blocking exclusive lock: if a
#    cycle is already running, this tick exits immediately instead of colliding.
#    (run-cycle.mjs also grows its own in-code lock — Tier 15 — but belt-and-braces.)
#
# The canonical crontab line lives in engine/README.md (Cron section).
# Halt everything: `npm run pause` (or `touch engine/PAUSED`).
export NVM_DIR="${NVM_DIR:-$HOME/.nvm}"
if [ -s "$NVM_DIR/nvm.sh" ]; then . "$NVM_DIR/nvm.sh" >/dev/null 2>&1; fi
# GOTCHA: nvm's default alias on this box is `lts/*`, which sourcing nvm.sh does NOT
# resolve to a node on PATH in cron's bare environment — so `node`/`claude` go missing
# and every tick dies with "flock: failed to execute node". Fallback: prepend the newest
# installed node bin directly (no lts resolution, no network, survives an nvm upgrade —
# it globs whatever's installed). claude lives in the same bin, so this covers both.
command -v node >/dev/null 2>&1 || {
  NODE_BIN="$(ls -d "$NVM_DIR"/versions/node/*/bin 2>/dev/null | sort -V | tail -1)"
  [ -n "$NODE_BIN" ] && export PATH="$NODE_BIN:$PATH"
}
cd "$(dirname "$0")/.." || exit 1
exec flock -n /tmp/whatupwolf-run-cycle.lock node engine/run-cycle.mjs >> engine/cycle.log 2>&1
