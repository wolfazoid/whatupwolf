# Lab Engine

The always-on bootstrap loop. Each cycle: pick the top backlog item, have headless
Claude Code build it on a branch, then open a PR with a Lab build-log entry. Nothing
merges without you.

## Run one cycle

```bash
node engine/run-cycle.mjs --dry-run   # print the plan, no side effects
node engine/run-cycle.mjs             # real cycle: branch → machine → PR
```

## What it does

1. `git pull` main, read `BACKLOG.md`, pick the top unchecked item.
2. Branch `lab/<slug>`, invoke `claude -p` with `CYCLE.md` + the task.
3. The machine writes code + `engine/.cycle-report.json`.
4. The runner renders `src/content/lab/<date>-<slug>.md`, checks off the backlog item,
   commits, pushes, and opens a PR.

## Re-runs & recovery

The loop is safe to run repeatedly. Branch setup uses `git checkout -B lab/<slug>`, so a
leftover `lab/<slug>` from an earlier attempt is reset to a fresh copy of `main` instead of
crashing on "branch already exists". If a cycle fails partway — the machine errors, writes no
report, or the report won't parse — the runner checks the working tree back out to `main` and
drops the failed attempt's uncommitted scratch (`git checkout -f main` + `git clean -fd`). Both
respect `.gitignore`, so `PAUSED`, `cron.log`, `node_modules`, and `.env` are left untouched;
the next run therefore always starts from a known-good `main`.

## Git auth

Push/PR use the `wolfazoid` GitHub account (the default account here has no push access).
The runner switches to `wolfazoid` for push and stays there (Wolf's preference); if it
can't identify the prior account it prints a warning rather than switching silently.
First-time setup on a new box:

```bash
gh auth switch --user wolfazoid && gh auth setup-git
```

## Off switches (containment)

Layered, most-accessible first:

- **Auto-merge toggle** (GitHub, phone/anywhere) — the master switch for *publishing*.
  Off = cycles still open PRs but nothing ships. This is the default in Tier A.
- **`engine/PAUSED`** — the runner exits on sight, before spending any Claude quota.
  `npm run pause` (or `touch engine/PAUSED`) on the box, or create the file from the GitHub
  web UI (a committed one is pulled and honoured). `npm run resume` (or delete it) to resume.
- **Disable cron** — stops cycles from starting: `crontab -e`, comment the line.
- **`pkill -f run-cycle.mjs`** — kills a cycle mid-flight.
- **`git revert`** — everything is PRs + commits, so anything merged is reversible.

## Autonomy tiers

- **Tier A (default, contained):** the machine opens PRs; a human merges each. A CI guard
  (`.github/workflows/ci.yml` + `guard.yml`) runs on every PR.
- **Tier B (hands-off):** the guard auto-merges an allowlisted PR only when ALL THREE are
  set up, **in this order**:
  1. **Branch protection on `main` requiring the `build` check** —
     `gh api --method PUT repos/wolfazoid/whatupwolf/branches/main/protection` with
     `required_status_checks.contexts: ["build"]`. This is the safety piece: it's what makes
     auto-merge *wait* for CI. Without it, `gh pr merge --auto` merges a mergeable PR
     immediately, before CI finishes (an early PR auto-merged ~22s before its CI passed).
  2. **Enable the repo's "Allow auto-merge" setting** — `gh repo edit wolfazoid/whatupwolf
     --enable-auto-merge`. Without this, `gh pr merge --auto` can't queue a merge at all and
     the guard's step no-ops (PRs just stay open). Safe to enable *because* step 1 is in place.
  3. **Flip the guard's tier switch:** `gh variable set AUTONOMY_TIER --body B`.

  In Tier A (the default — variable unset), the guard **labels only and never merges**;
  every PR waits for your manual merge. To drop back to Tier A: `gh variable delete AUTONOMY_TIER`.

## Experiments

Separate from the self-building coding loop, `engine/run-experiment.mjs <name>` runs a
research experiment: it invokes headless Claude Code with a prompt (`engine/experiments/<name>.md`),
the machine researches public sources and writes `engine/.experiment-report.json`, and the
runner renders a Lab entry and opens a PR. Experiments are **not** backlog items — nothing
is checked off. The `engine/PAUSED` kill-switch halts them too.

```bash
node engine/run-experiment.mjs agent-weekly --dry-run   # preview the entry, no side effects
node engine/run-experiment.mjs agent-weekly             # real run: research → branch → PR
```

**Agent Weekly** is the first experiment: a weekly, factual digest of the past 7 days in
AI agents (vendor releases, agent frameworks, trending repos, arXiv papers, HN threads),
every item carrying a real fetched link. It renders as a `type: digest` entry that
publishes direct (`draft: false`).

## Cron (once proven)

```cron
# daily at 07:00 — one cycle, log to ~/whatupwolf/engine/cron.log
0 7 * * * cd ~/whatupwolf && /usr/bin/node engine/run-cycle.mjs >> engine/cron.log 2>&1

# Agent Weekly — Sundays 07:00 (one digest per week)
0 7 * * 0 cd ~/whatupwolf && /usr/bin/node engine/run-experiment.mjs agent-weekly >> engine/experiment.log 2>&1
```
