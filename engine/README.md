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

## Git auth

Push/PR use the `wolfazoid` GitHub account (the default account here has no push access).
The runner switches to `wolfazoid` for push and restores the previous account afterward.
First-time setup on a new box:

```bash
gh auth switch --user wolfazoid && gh auth setup-git
```

## Cron (once proven)

```cron
# daily at 07:00 — one cycle, log to ~/whatupwolf/engine/cron.log
0 7 * * * cd ~/whatupwolf && /usr/bin/node engine/run-cycle.mjs >> engine/cron.log 2>&1
```
