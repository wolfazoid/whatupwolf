# Idle Idea Digest — Design

**Date:** 2026-07-21
**Status:** approved (brainstorm), pending implementation plan

## Framing

The self-building loop (`engine/run-cycle.mjs`, hourly cron) picks the first buildable
`- [ ]` in `engine/BACKLOG.md` each tick. When the backlog drains — as it has now that
Tiers 16–18 shipped (PRs #43–45) — the loop hits `run-cycle.mjs:185`, logs *"Nothing
buildable,"* and exits. That idle time is wasted potential.

**Goal:** turn an idle tick into a source of work. When the loop finds nothing to build,
it should **dream up interesting ideas** and **surface grounded opportunities on the
existing codebase** (features, refinements, optimizations, bugs), and log them to an
internal triage inbox. Wolf starts each day with a digest and promotes the ones worth
building into `BACKLOG.md` for future cycles — keeping the machine fed.

This is generative/research work, not code — closer to the experiment runner's job than
the coding cycle's. But the *trigger* is the empty-backlog condition inside the coding
loop, so the step lives in `run-cycle.mjs` (self-contained, no new cron).

## Decisions (locked during brainstorming)

- **Surface:** an internal triage inbox in the repo — not a public Lab post, not email.
- **Two files:** `engine/IDEAS.md` (live, untriaged) + `engine/IDEAS-rejected.md`
  (tombstones). The sweep reads both — plus `BACKLOG.md` and recent Lab — so it never
  re-proposes anything queued, shipped, or rejected.
- **Cadence:** on an empty-backlog tick, at most **once per day**, guarded so the hourly
  loop doesn't regenerate every hour. No new crontab entry.
- **Structure:** each run appends one dated section with two groups — **Ideas** (open
  brainstorm) and **Opportunities** (grounded).
- **Grounding:** the sweep runs as a headless `claude -p` with repo tool access and reads
  real source, so opportunities/bugs cite files that exist. It does **not** fetch the live
  site — the Site Health monitor already owns live-site auditing.

## Approach

**Idle-branch, PR-first, auto-merges — maximal reuse, no governance departure.**

When `run-cycle` finds nothing buildable it runs the ideate step on its own branch and
opens a PR, exactly like a normal cycle — just producing an `IDEAS.md` append instead of
code. Because `engine/*` is inside the guard allowlist, that PR auto-merges on green CI
(Tier B), landing the ideas on `main` with no manual step. Everything is reused: branch
creation, the single-instance lock, the verify gate, `publishBranch`, `recoverToMain`,
and the guard/CI auto-merge.

Rejected alternatives:
- **Separate daily cron** — contradicts the "self-contained, no new cron" decision, and
  adds a second schedule to keep in sync.
- **Direct commit to `main`, no PR** — lightest, but it would be the engine's first write
  that bypasses the PR/CI/guard discipline. Not worth breaking governance to save a
  trivial auto-merging PR.

## Design

### 1. New files

- **`engine/IDEAS.md`** — the live triage inbox. Seeded with a preamble explaining the
  two-file model and the triage lifecycle. New sections are appended newest-anywhere but
  keyed by a `## YYYY-MM-DD` heading. Bullets are plain `-` (never `- [ ]`) so the backlog
  parser can never mistake an idea for a task.

  ```markdown
  # Idea Inbox

  Daily sweeps land here when the backlog runs dry. Triage:
  - **Queue** an idea → copy it into engine/BACKLOG.md as a `- [ ]` task, delete it here.
  - **Reject** an idea → move it to engine/IDEAS-rejected.md (won't be re-proposed).
  - **Ignore** → leave it; it stays as context and won't be resurfaced.

  ## 2026-07-21

  ### Ideas (dreamed up)
  - Ambient "now playing" widget for the site chrome ...

  ### Opportunities (grounded in a repo read)
  - run-cycle.mjs:185 — the empty-backlog path is silent; ...
  ```

- **`engine/IDEAS-rejected.md`** — the tombstone list. Seeded with a one-line preamble.
  Wolf moves dismissed bullets here; the sweep reads it to avoid re-proposing them.

- **`engine/IDEATE.md`** — the operating manual for the sweep, sibling to `CYCLE.md`.
  Instructs the machine to:
  - Read `src/`, `engine/`, config, and recent `src/content/lab/` to ground itself.
  - Read `engine/IDEAS.md`, `engine/IDEAS-rejected.md`, and `engine/BACKLOG.md` (all
    states) so it repeats nothing already listed, queued, shipped, or rejected.
  - Propose a **modest, scannable** set — roughly 3–6 Ideas and 3–6 Opportunities.
    Opportunities must reference real files (grounded); Ideas may be open brainstorm.
  - **Append exactly one dated section** to `engine/IDEAS.md` and touch nothing else
    (no code edits, no git, no Lab entry).
  - Write `engine/.cycle-report.json` with the usual `{status, summary, tags, body}`
    contract; the runner uses `summary` for the PR body.

### 2. `run-cycle.mjs` — idle branch

At the point where `pickNextBuildable` returns `null` (`run-cycle.mjs:185`), replace the
bare log-and-return with:

1. **Guard — has an idea sweep already happened today?** Skip (cheap no-op, exit) if
   *either*:
   - `engine/IDEAS.md`'s newest `## YYYY-MM-DD` heading equals today's date, **or**
   - branch `lab/ideas-<date>` already has a PR (reuses the existing `branchHasPr` check —
     covers the window where today's PR is opened but not yet merged, so the next hourly
     tick doesn't collide on the branch).

   This double guard means: after a sweep runs, every remaining empty tick that day is the
   same cheap git-pull-and-exit no-op the loop already had.

2. **Run the sweep.** Checkout `lab/ideas-<date>`, invoke
   `claude -p <IDEATE prompt> --dangerously-skip-permissions` (repo tool access, same
   invocation shape as a normal cycle), then read `.cycle-report.json`.

3. **Verify + publish.** Run the same independent verify gate (`npm test` / `npm run
   check`) — a markdown-only change passes trivially, kept for consistency. Commit,
   **skip the Lab-entry render** (this is internal, not a public post), and open the PR via
   `publishBranch` with `prTitle` like `lab: idea sweep — <date>` and the report summary as
   the body.

4. **`--dry-run`** previews the decision and the branch/prompt it would use, writing
   nothing and making no `claude` call — mirroring the existing DRY handling.

The idle branch shares the existing lock, `try/catch`, and `recoverToMain`, so a failed
sweep leaves a clean `main` exactly like a failed cycle.

### 3. Testable helpers (`engine/lib.mjs`, unit-tested in `engine/lib.test.mjs`)

Pure functions, per repo convention (real tests, not stubs):

- `latestIdeaDate(ideasMd)` → the newest `## YYYY-MM-DD` heading string, or `null` when
  none. Drives the once-per-day guard (compare to today).
- `ideasBranch(date)` → `lab/ideas-YYYY-MM-DD`.

The `claude` invocation and git operations stay integration-level, exercised by the
`--dry-run` preview rather than unit tests.

### 4. Guard-allowlist check

Every file the sweep and this feature touch — `engine/IDEAS.md`, `engine/IDEAS-rejected.md`,
`engine/IDEATE.md`, `engine/run-cycle.mjs`, `engine/lib.mjs` (+ test) — is inside the
`engine/*` allowlist. So both the implementation PR and each daily idea PR are **auto-zone**
and auto-merge on green CI. No root/config file is touched, so nothing forces a
`needs-human` gate.

## Triage lifecycle (Wolf, manual — no new tooling)

- **Queue:** copy the bullet into `BACKLOG.md` as a `- [ ]` task; delete it from `IDEAS.md`.
- **Reject:** move the bullet to `IDEAS-rejected.md`; the next sweep won't resurface it.
- **Ignore:** leave it in `IDEAS.md` as standing context.

A plain text move is enough — a promote/reject command is deliberately out of scope (YAGNI).

## Out of scope

- **Live-site fetching** — Site Health already audits the deployed site; the sweep reads
  the repo only.
- **Email/Gmail delivery** — deferred engine-wide; the digest is the in-repo `IDEAS.md`.
- **Any promote/reject helper command** — a text move suffices.

## Testing & verification

- Unit tests for `latestIdeaDate` (newest-of-many, single, none/empty) and `ideasBranch`.
- `node engine/run-cycle.mjs --dry-run` against an empty backlog previews the idle branch
  (would checkout `lab/ideas-<date>`, would invoke claude, would append `IDEAS.md`) with no
  side effects; against a fresh `IDEAS.md` already dated today, previews the skip.
- `npm test` and `npm run check` green.
