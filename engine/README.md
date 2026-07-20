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

**Same-day re-runs.** Experiment branches are dated (`lab/agent-weekly-2026-07-18`), so a
second run on the same day used to push a branch built fresh off `main` onto one that
already had the first run's commit — git rejected the non-fast-forward and the run died at
publish time, after the research had already been paid for. The runner now asks the remote
which names are taken (`git ls-remote --heads`) and steps to the next free one:
`…-2`, `…-3`, and so on. The Lab entry filename takes the same suffix
(`2026-07-18-agent-weekly-2.md`), so two same-day runs don't collide on the content path
either. It picks a new name rather than force-pushing on purpose: the first run's branch
may already have an open PR, and rewriting it would change what a reviewer is mid-way
through reading. `--dry-run` shells out to nothing, so it always previews the plain dated
name.

**Titles.** An experiment titles as `<titlePrefix> — <cadence> <date>` when its registry
entry sets a `cadence` (`Agent Weekly — week of 2026-07-20`), and as
`<titlePrefix> — <date>` when it doesn't. One-shots omit `cadence`, so they don't claim a
schedule they don't have.

**Agent Weekly** is the first experiment: a weekly, factual digest of the past 7 days in
AI agents (vendor releases, agent frameworks, trending repos, arXiv papers, HN threads),
every item carrying a real fetched link. It renders as a `type: digest` entry that
publishes direct (`draft: false`).

**Interaction Landscape** is a **one-shot** sprint — run it by hand, there is no cron line
and it is not on the schedule below:

```bash
node engine/run-experiment.mjs interaction-landscape --dry-run   # preview
node engine/run-experiment.mjs interaction-landscape             # real run
```

It surveys the landscape of novel ways of interacting with LLMs (voice and ambient agents,
generative and streaming UI, memory/context UX, multimodal, computer use, tool-call and
clarification UX, reasoning surfaces, elicitation, agent handoff) and ends in a ranked
`## Prototype Shortlist`, each candidate tagged client-only / BYO-key / needs-server. It
renders as a `type: briefing` entry, which `draftForType()` gates behind `draft: true` —
Wolf's review of the shortlist is the gate, so nothing publishes unreviewed. Re-run it
whenever the landscape has moved enough to be worth re-surveying.

**Interaction Lab** is the recurring, lighter counterpart to that sprint: a **monthly**
digest of what's new in how people interact with LLMs, covering the same nine areas but
scoped to the past month and skipping the shortlist. It runs the same source-sweep
discipline and the same real-fetched-link hard rule, ~5–8 items, factual voice. It renders
as a `type: digest` entry, so unlike the sprint it publishes direct (`draft: false`) —
which is why the prompt holds it to reporting, not to a point of view. The sprint maps the
space; this keeps the map fresh.

## Cron

**Agent Weekly runs Sundays 07:00** via the wrapper `engine/run-weekly.sh`, **Site Health
runs Wednesdays 07:00** via `engine/run-health.sh`, and **Interaction Lab runs monthly on
the 1st at 07:00** via `engine/run-interaction-lab.sh`. These are the canonical crontab
lines (source of truth — `crontab -l` should match them):

```cron
# Agent Weekly — Sundays 07:00 (halt: touch engine/PAUSED)
0 7 * * 0 /home/wolf/whatupwolf/engine/run-weekly.sh

# Site Health — Wednesdays 07:00 (halt: touch engine/PAUSED)
0 7 * * 3 /home/wolf/whatupwolf/engine/run-health.sh

# Interaction Lab — 1st of the month, 07:00 (halt: touch engine/PAUSED)
0 7 1 * * /home/wolf/whatupwolf/engine/run-interaction-lab.sh
```

Wolf installs these by hand — the engine never edits a crontab. Adding a wrapper here is
only half the job; the line above has to be pasted into `crontab -e` before anything is
actually scheduled.

All wrappers must be executable (`chmod +x engine/run-*.sh`) — cron won't run them
otherwise, and it fails quietly.

**Always point cron at the wrapper, never at a `node` path.** Cron runs with a bare
environment and can't find nvm's `node`/`claude`; a pinned versioned path
(`…/v24.15.0/bin`) rots *silently* the moment nvm upgrades node — on a Sunday, a
Wednesday, or the 1st of a month nobody is watching. Each wrapper sources nvm to use whatever node is current, so
there is nothing to remember or update after a node upgrade.

**The self-building loop runs hourly** via `engine/run-cycle.sh` — its wrapper adds one
thing the experiment wrappers don't need: `flock -n`, a non-blocking exclusive lock, so a
cycle that overruns the hour is never joined by a second concurrent run (which would corrupt
the shared git branch state). Each tick that finds no buildable backlog is a cheap
git-pull-and-exit no-op that makes no `claude` call, so the cron is safe to leave installed —
it only does work when the backlog has an unbuilt `- [ ]` item. Canonical crontab line:

```cron
# Self-building loop — hourly (halt: touch engine/PAUSED)
0 * * * * /home/wolf/whatupwolf/engine/run-cycle.sh
```

Halt the loop with `npm run pause` (or `touch engine/PAUSED`); resume with `npm run resume`.
Remove the schedule entirely with `crontab -e` (delete the line).
