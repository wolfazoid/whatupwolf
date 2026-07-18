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
- **Tier B (hands-off):** enable repo auto-merge + branch protection requiring the `build`
  check. Then PRs whose diff is entirely within the guard allowlist (Lab posts + engine
  machinery) auto-merge on green; anything touching the core site, Wolf's writing/work,
  config, `CYCLE.md`, or `.github/**` is labelled `needs-human` and waits for review.

  Turn Tier B on:
  ```bash
  gh repo edit wolfazoid/whatupwolf --enable-auto-merge
  # + branch protection requiring the "build" status check (see setup notes)
  ```

## Cron (once proven)

```cron
# daily at 07:00 — one cycle, log to ~/whatupwolf/engine/cron.log
0 7 * * * cd ~/whatupwolf && /usr/bin/node engine/run-cycle.mjs >> engine/cron.log 2>&1
```
