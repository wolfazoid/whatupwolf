# Empty-Backlog Notifier — Design

**Date:** 2026-07-25
**Status:** approved (brainstorm), pending implementation plan

## Framing

The hourly loop (`engine/run-cycle.mjs`) picks the first buildable `- [ ]` in
`engine/BACKLOG.md`. When it finds nothing, it logs *"Nothing buildable"* to
`engine/cycle.log` and runs the daily idea sweep (Idle Idea Digest, PR #46), which
appends a dated section to `engine/IDEAS.md`.

Both of those signals live **inside the repo**, and neither is pushed anywhere. The
sweep is explicitly forbidden from queueing its own work — `engine/IDEATE.md:56` says
*"Never edit `engine/BACKLOG.md`"* — because triage is Wolf's gate. That gate only works
if Wolf knows there is something to triage.

On 2026-07-25 the failure mode showed up in practice: the backlog drained overnight, the
sweep ran correctly at 00:04, and 18 ideas accumulated across three sweeps with none
triaged. The loop idled all day. Nothing was broken; nobody was told.

**Goal:** when the loop has nothing to build, push an explicit notice **out of the repo**
carrying (a) that the engine is idle, (b) why, and (c) the untriaged ideas waiting in
`engine/IDEAS.md` — so the triage gate is something Wolf is prompted into rather than
something he has to remember to go and check.

This supersedes the "not email" line in the Idle Idea Digest design
(`2026-07-21-idle-idea-digest-design.md`), which chose an in-repo inbox and deferred the
delivery question. The inbox stays exactly as it is; this design only adds the push.

## Decisions (locked during brainstorming)

- **Channel: a GitHub issue** on `wolfazoid/whatupwolf`, not email. Email was the
  starting proposal and was rejected on cost: the box has **no MTA at all** (no
  `sendmail`, `msmtp`, `mail`, `ssmtp` — only `curl` and `python3`), so email means a
  transactional HTTP API, which means the first production secret this engine has ever
  held, plus a verified sending domain and a new silent-failure mode. A GitHub issue
  needs none of that — `gh` is already authenticated — and rides GitHub's own
  notification email to reach the inbox anyway.
- **Cadence: once per sweep**, on the idle path. Not once per tick (24 notices/day) and
  not once per calendar day (see *The marker rule* below for why those differ).
- **Lifecycle: one standing issue.** First idle day opens it; each later sweep adds a
  comment; the runner **closes it automatically** when a tick finds work again. Issue
  open means idle, closed means working — no manual upkeep, no duplicate issues.
- **Identity: the runner stays on `wolfazoid`.** It does not switch gh accounts. This
  costs a one-time manual step (below) and buys zero new machinery in the hot path.
- **The notifier is best-effort.** It must never fail a cycle.

## Manual prerequisite (load-bearing)

**GitHub → Settings → Notifications → enable "Include your own updates" (email).**

GitHub does not notify you about your own activity by default. The runner authenticates
as `wolfazoid`, so without this toggle the issues will be filed correctly and **no email
will ever arrive** — the feature looks healthy while delivering nothing. Flip it before
the first run so the first real issue proves the path end to end.

Rejected alternatives, for the record: filing as `wolfhoward-pack` (works — it has READ
on this public repo, which is enough to open an issue — but puts a work identity publicly
on a personal repo) and a dedicated bot account (cleanest, but real setup work before
anything ships).

## Approach

Decision logic is pure and unit-tested in `engine/lib.mjs`; every `gh` side effect is
isolated behind `engine/notify.mjs`. `run-cycle.mjs` gains two call sites and no
restructuring. Everything is under `engine/**`, so the PR is **auto-zone** and merges on
green CI.

### The marker rule

The naive rule — "post once per calendar day" — is wrong here, and the reason is worth
stating because it is not obvious.

The sweep writes `IDEAS.md` **on a branch** (`lab/ideas-<date>`) and opens a PR that
auto-merges on green CI. At the instant the sweep finishes, `main`'s `IDEAS.md` still
holds the *previous* day's ideas. A calendar-day rule would fire on that same tick, mail
yesterday's list, mark the day done, and never report today's — permanently one day
behind.

So the marker is keyed to **the sweep date**, not the calendar date. Every post carries
an invisible HTML comment:

```
<!-- engine-idle: sweep=YYYY-MM-DD -->
```

and the rule is one line:

> Post when `latestIdeaDate(IDEAS.md)` has no matching marker on the open issue.

Worked timeline for 2026-07-25:

| Tick  | `main`'s newest section | Markers on issue | Action |
|-------|-------------------------|------------------|--------|
| 00:04 | `07-24` (sweep still on its branch) | `sweep=07-24` | silent |
| 01:04 | `07-25` (PR merged) | `sweep=07-24` | **post** |
| 02:04 | `07-25` | `sweep=07-24`, `sweep=07-25` | silent |

Consequences, accepted deliberately:

- The notice arrives up to an hour after the sweep. Fine for a daily nudge.
- If a sweep's PR never merges, no new marker appears and no post fires. The standing
  issue from a previous day is still open, so the idle state is not hidden — only that
  day's ideas are missing, and they do not exist on `main` to report anyway.
- The issue **is** the state store. No new file, no `.gitignore` entry, and the rule
  survives a wiped working tree or a fresh clone.

### Components

**`engine/lib.mjs`** — new pure exports, unit-tested in `engine/lib.test.mjs`:

- `parseIdeas(ideasMd)` → `[{ date, group, text }]`. Every bullet under each
  `## YYYY-MM-DD` section, tagged with its group (`Ideas` or `Opportunities`). Ignores
  the file's header prose and its HTML comments. Mirrors `latestIdeaDate`'s existing
  section parsing.
- `idleMarker(sweepDate)` → the `<!-- engine-idle: sweep=... -->` string.
- `sweepReported(texts, sweepDate)` → boolean. Given the issue body plus every comment
  body, has this sweep date already been posted?
- `renderIdleNotice({ sweepDate, ideas, skipped, repoUrl })` → the markdown used for
  both the issue body and each later comment. One renderer, two call sites.

**`engine/run-cycle.mjs`** — one modified signature:

- The pure `pickBuildableItem` in `lib.mjs` is unchanged. Its impure wrapper
  `pickNextBuildable` (in `run-cycle.mjs`) currently accumulates skipped branches in a
  local `taken` array and discards them when it returns `null`. It changes to return
  `{ next, skipped }` — `next` possibly `null`, `skipped` an array of
  `{ title, branch }`. This is what lets the notice distinguish *genuinely empty* from
  *blocked* (see below). One definition, one call site, both in `run-cycle.mjs`.

**`engine/notify.mjs`** (new) — the only module that shells out to `gh`:

- `findIdleIssue()` → the open issue whose title matches the fixed marker title, or
  `null`. Uses `gh issue list --state open --json number,title,body` and matches on the
  title; no label needs creating.
- `postIdleNotice({ issue, body, dry })` → creates the issue if `issue` is `null`,
  otherwise comments on it.
- `closeIdleIssue({ issue, nowBuilding, dry })` → comments with what is now being built,
  then closes.

**`engine/run-cycle.mjs`** — two call sites:

- In the `!next` branch (currently line 269): after `runIdleIdeation()`, call the
  notifier with the skipped list.
- In the `next` branch: if an idle issue is open, close it, naming the item being built.

### What the notice says

Title, fixed and stable so it is findable: `Engine idle — backlog empty`

Body and each comment contain:

- The `<!-- engine-idle: sweep=... -->` marker.
- **Status** — backlog state, last sweep date, count of untriaged ideas.
- **Blocked vs. genuinely empty.** *"Nothing buildable"* today means **either** an empty
  backlog **or** every remaining item skipped behind an existing PR. Those are different
  situations and the current log line conflates them. The notice names each skipped item
  and its blocking branch explicitly. (On 2026-07-25 the backlog was not empty: one item
  was hidden behind PR #50.)
- **The untriaged ideas**, grouped by sweep date, in `IDEAS.md` order.
- **Triage crib** — queue → copy the bullet into `BACKLOG.md` as `- [ ]` and delete it
  here; reject → move to `IDEAS-rejected.md`; ignore → leave it.
- Links to `engine/IDEAS.md` and `engine/BACKLOG.md` on GitHub.

Note that `IDEAS.md` already lives in a public repo, so putting its contents in a public
issue discloses nothing new. The sanitizer is not involved: the notifier reads only
`BACKLOG.md` and `IDEAS.md`, never a private report, and holds no secrets.

### Error handling

Every `gh` call is wrapped. On failure the notifier logs a warning to `engine/cycle.log`
and returns; the cycle proceeds normally. GitHub being unreachable must never stall a
build or fail a tick. The notifier is strictly additive to the idle path.

`--dry-run` prints the would-be issue title, body, and action (`create` / `comment` /
`close`) and performs no `gh` writes, matching the existing dry-run contract.

### Testing

- `parseIdeas` — multiple dated sections, both groups, bullets containing `**bold**` and
  inline code and backtick-quoted paths, an empty file, a file with only header prose.
- `sweepReported` — marker present in the body, present in a comment, absent, and a
  near-miss date that must not match.
- `renderIdleNotice` — genuinely-empty backlog, blocked-behind-PR backlog, both at once,
  and zero untriaged ideas.
- `pickNextBuildable`'s new `{ next, skipped }` shape — existing tests updated, plus one
  asserting `skipped` carries every passed-over item.
- `engine/notify.mjs` gets a smoke test only, matching how `engine/publish.test.mjs`
  already handles an inherently side-effecting module.

## Out of scope

- Email delivery, and therefore any secret handling, sender-domain verification, or
  transactional-email vendor. Revisit only if GitHub notifications prove unreliable in
  practice.
- Notifying on anything other than the idle condition — build failures, flagged cycles
  and stalled crons are separate signals and would need their own design.
- Automatic triage. The machine proposes and reports; deciding what gets built stays
  Wolf's gate, unchanged.
