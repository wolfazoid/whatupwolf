#!/usr/bin/env bash
# Backward-compat shim: Agent Weekly now runs through the parametric wrapper
# (engine/run-experiment.sh), which carries the nvm/robustness handling.
# Kept so an already-installed crontab line keeps working with no migration.
exec "$(dirname "$0")/run-experiment.sh" agent-weekly
