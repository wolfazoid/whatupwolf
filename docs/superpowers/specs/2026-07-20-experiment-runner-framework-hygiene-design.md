# Experiment-Runner Framework Hygiene — Design

**Date:** 2026-07-20
**Status:** approved (brainstorm), queued to `engine/BACKLOG.md` (Tier 13)

## Framing

The long-deferred "experiment-runner framework" (YAGNI until 2–3 experiments exist)
is ripe — with Agent Weekly, Site Health, and the two Tier-12 interaction experiments
there will be four. But the honest finding on reading the code: **`run-experiment.mjs`
is already the framework** — a unified, registry-driven spine handling both `digest`
and `monitor` kinds through one path. There is no per-experiment runner duplication.

Only two repetitions actually remain:

1. **Wrapper scripts** — `run-weekly.sh` and `run-health.sh` are byte-for-byte identical
   except the experiment name on the last line. Each new experiment adds another copy.
2. **The registry** is a hardcoded literal *inside* `run-experiment.mjs`, so every new
   experiment is a core-file code edit.

This is a small, non-speculative extraction — remove those two, nothing more. No scaffold
command (that would be speculative for four experiments).

## Design

### 1. Registry module
Move the `EXPERIMENTS` object (and its explanatory comment) out of `run-experiment.mjs`
into a new `engine/experiments/registry.mjs` that exports it; `run-experiment.mjs` imports
it. Pure data/logic separation — behavior identical, `--dry-run` and the test suite stay
green. Adding an experiment becomes: one line in `registry.mjs` + a prompt file.

*Optional cheap guard:* a unit test asserting every registry entry is well-formed —
`kind ∈ {digest, monitor}`, `type` in the lab enum, and monitors carry a `target`.

### 2. One parametric wrapper
New `engine/run-experiment.sh <name>` holds the nvm-sourcing + `cd` + log-redirect +
`exec node engine/run-experiment.mjs "$1"` logic **once**, with a guard for a missing
name arg. Ensure the executable bit is set (git tracks it). A future experiment then needs
**no new wrapper** — point cron at `run-experiment.sh <name>`.

### 3. Safe migration — shims, not deletion
`run-weekly.sh`, `run-health.sh`, and (by the time this runs) `run-interaction-lab.sh`
become **one-line shims** that `exec "$(dirname "$0")/run-experiment.sh" <name>`. The
already-installed crontabs keep working with **zero migration and no silent breakage** —
the exact "node upgrade / renamed file breaks cron on a morning no one is watching" failure
the wrappers' own comments exist to prevent. The DRY win is real: all logic lives in one
file; the shims carry no duplicated logic. Shims are removable later, at Wolf's leisure,
once he re-points crontab — but nothing forces it.

### 4. README
Document the canonical form (`run-experiment.sh <name>`) and note the named files are
compatibility shims for already-installed crontabs.

## Placement & ordering
Queued as **Tier 13**, after the Tier-12 research items. Tier 12-B still creates
`run-interaction-lab.sh`; Tier 13 folds all three wrappers into shims together. This keeps
each backlog item self-contained and thematically clean (research phase vs. engine hygiene),
at the cost of B writing a wrapper that 13 immediately simplifies — acceptable iterative
churn. All changes are `engine/**` → auto-zone.

## Non-goals
- No scaffold / generator command (speculative at four experiments).
- No change to the runner's control flow, the two `kind` pipelines, or the sanitizer rail.
- No forced crontab migration.
