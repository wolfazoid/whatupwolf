# Idle Idea Digest Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When the self-building loop finds an empty backlog, run a once-daily generative sweep that appends dreamed-up ideas + grounded repo opportunities to an internal triage inbox (`engine/IDEAS.md`), PR-first and auto-merging.

**Architecture:** A new idle branch in `engine/run-cycle.mjs` fires where `pickNextBuildable` returns `null`. Guarded to run at most once per calendar day (newest dated section in `IDEAS.md`, plus the existing `branchHasPr` check for the in-flight window), it invokes a headless `claude -p` with a new operating manual (`engine/IDEATE.md`), which appends one dated section to `engine/IDEAS.md`, then commits and opens a PR via the existing `publishBranch` — no Lab entry. Everything else (branch, lock, verify gate, recover) is reused.

**Tech Stack:** Node ESM (`.mjs`), vitest for unit tests, the existing `gh`/`git`/`claude` CLI machinery.

## Global Constraints

- **Guard allowlist / auto-zone:** every file touched (`engine/IDEAS.md`, `engine/IDEAS-rejected.md`, `engine/IDEATE.md`, `engine/run-cycle.mjs`, `engine/lib.mjs` + test, `engine/README.md`) is inside `engine/*`. Do **not** touch any root/config file (`.gitignore`, `package.json`, etc.) — that would force a `needs-human` gate. No new files outside `engine/`.
- **Pure helpers stay pure:** new logic in `engine/lib.mjs` does no I/O; the runner reads files and passes strings in. Unit-tested in `engine/lib.test.mjs`.
- **Preserve `--dry-run`:** the idle path must make no `claude` call, no git writes, and no lock side effects under `--dry-run` (mirrors the existing contract). `branchHasPr` is read-only and runs for real even in dry-run — that is existing, intended behavior.
- **Idea bullets are plain `-`, never `- [ ]`:** the backlog parser (`parseBacklog`) only matches `- [ ]`/`- [x]`; keeping idea bullets plain guarantees an idea can never be mistaken for a buildable task.
- **No Lab entry for sweeps:** idle ideation is internal — it must NOT render a `src/content/lab/*.md` post.
- **Voice:** the inbox is an internal ops note, not public writing. Factual, terse bullets.
- **Test runner:** `npm test` == `vitest run`; type check == `npm run check` == `astro check`.

---

### Task 1: Pure guard helpers in `engine/lib.mjs`

Two pure functions that drive the once-per-day guard and the sweep's branch name.

**Files:**
- Modify: `engine/lib.mjs` (append two exported functions after `newLabEntriesInStatus`, ~line 303)
- Test: `engine/lib.test.mjs` (add imports + two `describe` blocks)

**Interfaces:**
- Produces: `latestIdeaDate(ideasMd: string) -> string | null` — the newest `## YYYY-MM-DD` heading in the inbox, or `null` when there are none. ISO dates compare correctly as strings (lexicographic == chronological).
- Produces: `ideasBranch(date: string) -> string` — returns `lab/ideas-<date>`.

- [ ] **Step 1: Write the failing tests**

Add to the import block at the top of `engine/lib.test.mjs` (after the existing `lockIsFree` import line):

```js
import { latestIdeaDate, ideasBranch } from './lib.mjs';
```

Append these `describe` blocks to `engine/lib.test.mjs`:

```js
describe('latestIdeaDate', () => {
  it('returns null when there are no dated sections', () => {
    expect(latestIdeaDate('# Idea Inbox\n\nsome preamble, no dates yet')).toBeNull();
  });
  it('returns the only dated section', () => {
    expect(latestIdeaDate('## 2026-07-21\n\n### Ideas\n- a thing')).toBe('2026-07-21');
  });
  it('returns the NEWEST date regardless of file order', () => {
    const md = '## 2026-07-19\n- old\n\n## 2026-07-21\n- new\n\n## 2026-07-20\n- mid';
    expect(latestIdeaDate(md)).toBe('2026-07-21');
  });
  it('ignores headings that are not a bare ## date', () => {
    const md = '## Triaged\n## 2026-07-18 (notes)\n### 2026-99-99\n## 2026-07-18';
    expect(latestIdeaDate(md)).toBe('2026-07-18');
  });
  it('handles empty input', () => {
    expect(latestIdeaDate('')).toBeNull();
  });
});

describe('ideasBranch', () => {
  it('builds the dated idea-sweep branch', () => {
    expect(ideasBranch('2026-07-21')).toBe('lab/ideas-2026-07-21');
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- engine/lib.test.mjs`
Expected: FAIL — `latestIdeaDate is not a function` / `ideasBranch is not a function` (import resolves to `undefined`).

- [ ] **Step 3: Write the minimal implementation**

Append to `engine/lib.mjs` (after `newLabEntriesInStatus`, the last export, ~line 303):

```js
// The newest dated section in the idea inbox (engine/IDEAS.md), or null when
// there are none yet. Each idle sweep heads its block with a bare `## YYYY-MM-DD`
// line; the runner compares this to today so an empty-backlog loop dreams up work
// at most once a day instead of every hourly tick. ISO dates sort lexicographically,
// so a plain string `>` is the chronological max. Pure — the caller reads the file
// (or passes '' before it exists).
export function latestIdeaDate(ideasMd) {
  let latest = null;
  for (const line of String(ideasMd).split('\n')) {
    const m = line.match(/^##\s+(\d{4}-\d{2}-\d{2})\s*$/);
    if (m && (latest === null || m[1] > latest)) latest = m[1];
  }
  return latest;
}

// The branch an idle idea sweep publishes on, keyed by date (mirrors the
// experiment branch convention, lab/agent-weekly-<date>). Same-day re-runs reuse
// the name, and the runner's branchHasPr guard then skips a sweep already in flight.
export function ideasBranch(date) {
  return `lab/ideas-${date}`;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test -- engine/lib.test.mjs`
Expected: PASS — all `latestIdeaDate` and `ideasBranch` cases green, existing tests still green.

- [ ] **Step 5: Commit**

```bash
git add engine/lib.mjs engine/lib.test.mjs
git commit -m "lab: add idle-ideation guard helpers (latestIdeaDate, ideasBranch)"
```

---

### Task 2: Seed the inbox files and the sweep operating manual

Three committed engine files: the live inbox, the tombstone list, and the manual the sweep follows. No code — content only. A reviewer can accept/reject the manual's wording independent of the runner wiring.

**Files:**
- Create: `engine/IDEAS.md`
- Create: `engine/IDEAS-rejected.md`
- Create: `engine/IDEATE.md`

**Interfaces:**
- Produces (consumed by Task 3): `engine/IDEATE.md` (read by `buildIdeatePrompt`), `engine/IDEAS.md` (read by the guard, appended by the sweep). `IDEAS.md` MUST ship with **no dated `## YYYY-MM-DD` section** so `latestIdeaDate` returns `null` and the first sweep is not pre-empted.

- [ ] **Step 1: Create the live inbox `engine/IDEAS.md`**

Write `engine/IDEAS.md` (preamble only — no dated sections):

```markdown
# Idea Inbox

Daily **idea sweeps** land here when the backlog runs dry. Each sweep appends one
`## YYYY-MM-DD` section with two groups: **Ideas** (dreamed up) and **Opportunities**
(grounded in a read of the actual repo). Bullets are plain `-`, never `- [ ]`, so the
backlog parser never mistakes an idea for a buildable task.

**Triage (Wolf, by hand):**
- **Queue it** → copy the bullet into `engine/BACKLOG.md` as a `- [ ]` task, then delete
  it from here.
- **Reject it** → move the bullet to `engine/IDEAS-rejected.md`; the next sweep reads that
  file and won't re-propose it.
- **Ignore it** → leave it here; it stays as standing context and won't be resurfaced.

<!-- Sweeps append below this line, newest section wins the once-per-day guard. -->
```

- [ ] **Step 2: Create the tombstone list `engine/IDEAS-rejected.md`**

Write `engine/IDEAS-rejected.md`:

```markdown
# Rejected Ideas

Ideas Wolf has dismissed. The daily idea sweep reads this file and will **not**
re-propose anything listed here. Move a rejected bullet from `engine/IDEAS.md` into
this file (a plain `-` bullet; a short trailing note on *why* helps future sweeps).
```

- [ ] **Step 3: Create the operating manual `engine/IDEATE.md`**

Write `engine/IDEATE.md`:

```markdown
# Lab Engine — Idle Ideation Manual

The backlog is empty, so instead of building you are **dreaming up work**. Your job is
to append ONE dated section to `engine/IDEAS.md` and nothing else. You write no code,
touch no other file, and do no git.

## Ground yourself first (read before you write)

- Skim the real codebase so opportunities cite things that exist: `src/` (pages,
  components, layouts, content config), `engine/`, root config, and the recent entries
  in `src/content/lab/`.
- Read `engine/BACKLOG.md` (every state), `engine/IDEAS.md`, and
  `engine/IDEAS-rejected.md`. You must **never** propose anything that is already queued
  or shipped (in the backlog / Lab), already sitting in the inbox, or already rejected.

## What to write

Append to the END of `engine/IDEAS.md` exactly one section headed with today's date as a
bare `## YYYY-MM-DD` line, with two groups of plain `-` bullets (NOT `- [ ]`):

```
## <today's date, YYYY-MM-DD>

### Ideas (dreamed up)
- <a genuinely interesting new feature, tool, experiment, or direction — one line;
  a short "why it's interesting" clause is welcome>

### Opportunities (grounded in a repo read)
- <a concrete refinement, optimization, useful feature, or real bug — reference the
  actual file (e.g. `src/components/LabEntry.astro`) so it's verifiable>
```

- Aim for a **modest, scannable** set: roughly **3–6 Ideas** and **3–6 Opportunities**.
  Quality over volume — a short, high-signal list Wolf can triage in a minute.
- **Ideas** may be open brainstorm. **Opportunities** MUST be grounded in code you
  actually read — no hallucinated bugs, no "maybe add X" for an X that already exists.
- Terse, factual ops voice. This is an internal note, not public writing, and NOT a Lab
  post — do not create any `src/content/lab/*.md`.

## Report file (required)

Before you finish, write `engine/.cycle-report.json`:

```json
{
  "status": "done | flagged",
  "summary": "one sentence for the PR body, e.g. 'Idea sweep: N ideas, M opportunities.'",
  "tags": ["engine", "ideas"],
  "body": "unused for idle sweeps; a one-line note is fine"
}
```

## Hard rules

- Touch ONLY `engine/IDEAS.md` (append) and `engine/.cycle-report.json` (write).
- Never edit `engine/BACKLOG.md`, never create a Lab entry, never commit/push/merge.
- Never propose anything already queued, shipped, in the inbox, or in the rejected list.
```

- [ ] **Step 4: Verify the guard reads the seed as "never ideated"**

Run:
```bash
node --input-type=module -e "import {latestIdeaDate} from './engine/lib.mjs'; import {readFileSync} from 'node:fs'; console.log('latestIdeaDate =', latestIdeaDate(readFileSync('engine/IDEAS.md','utf8')));"
```
Expected: `latestIdeaDate = null` (the seed has no dated section, so the first sweep will run).

- [ ] **Step 5: Commit**

```bash
git add engine/IDEAS.md engine/IDEAS-rejected.md engine/IDEATE.md
git commit -m "lab: seed idea inbox, rejected list, and ideation manual"
```

---

### Task 3: Wire the idle branch into `engine/run-cycle.mjs`

Replace the bare "nothing buildable" log-and-return with the idle ideation flow, and document the behavior in the engine README.

**Files:**
- Modify: `engine/run-cycle.mjs` (imports line 6–9; add path consts near line 14–18; add `buildIdeatePrompt` + `runIdleIdeation`; change the `if (!picked)` block at ~line 185)
- Modify: `engine/README.md` (document idle ideation + triage lifecycle)

**Interfaces:**
- Consumes: `latestIdeaDate`, `ideasBranch` (Task 1); `parseCycleReport`, `resolveStatus` (already imported); `publishBranch` (already imported); local `sh`, `gate`, `branchHasPr`, and consts `REPORT`, `REPO_DIR`, `ENGINE_DIR`, `GH_USER`, `DRY`.
- Produces: side effect only — a `lab/ideas-<date>` PR appending `engine/IDEAS.md`. No new exports.

- [ ] **Step 1: Add the two helper imports**

In `engine/run-cycle.mjs`, extend the `lib.mjs` import (currently lines 6–9). Add `latestIdeaDate, ideasBranch` to the imported names, e.g. change the last imported line so the block reads:

```js
import {
  parseBacklog, pickBuildableItem, prListArgs, markItemDone, slugify, renderLabEntry, parseCycleReport,
  resolveStatus, shortTitle, draftForType, lockIsFree, newLabEntriesInStatus,
  latestIdeaDate, ideasBranch,
} from './lib.mjs';
```

- [ ] **Step 2: Add the inbox/manual path constants**

After the existing `const LOCK = join(ENGINE_DIR, '.run.lock');` line (~line 18), add:

```js
const IDEAS = join(ENGINE_DIR, 'IDEAS.md');
const IDEATE_MANUAL = join(ENGINE_DIR, 'IDEATE.md');
```

- [ ] **Step 3: Add `buildIdeatePrompt` and `runIdleIdeation`**

Immediately after the existing `buildPrompt` function (ends ~line 143, before `function main()`), add:

```js
function buildIdeatePrompt() {
  const manual = readFileSync(IDEATE_MANUAL, 'utf8');
  return [
    'You are the whatupwolf lab engine running one IDLE IDEATION sweep.',
    'The backlog is empty, so instead of building code you are dreaming up work.',
    'Operating manual (follow it exactly):',
    '', manual, '',
  ].join('\n');
}

// The empty-backlog path. Instead of a bare exit, once a day the loop dreams up
// work: it appends a dated section of ideas + grounded repo opportunities to
// engine/IDEAS.md and opens a PR (which auto-merges on green CI — engine/* is in
// the guard allowlist). Guarded twice so the hourly loop can't regenerate every
// hour: skip if IDEAS.md already carries today's section (the merged case), or if
// today's lab/ideas-<date> branch already has a PR (the in-flight case, before the
// PR merges). No Lab entry — this is an internal ops note, not a public post.
function runIdleIdeation() {
  const today = new Date().toISOString().slice(0, 10);
  const ideasMd = existsSync(IDEAS) ? readFileSync(IDEAS, 'utf8') : '';
  if (latestIdeaDate(ideasMd) === today) {
    console.log(`Idle: an idea sweep already ran today (${today}) — nothing to do.`);
    return;
  }
  const branch = ideasBranch(today);
  if (branchHasPr(branch)) {
    console.log(`Idle: today's idea sweep (${branch}) already has a PR — skipping.`);
    return;
  }

  if (DRY) {
    console.log(`Idle: backlog empty — would run the daily idea sweep on ${branch}.`);
    console.log('[dry-run] would checkout', branch);
    console.log('[dry-run] would invoke: claude -p <IDEATE prompt> --dangerously-skip-permissions');
    console.log(`[dry-run] the sweep would append a "## ${today}" section to engine/IDEAS.md`);
    console.log('[dry-run] would commit + open a PR (no Lab entry)');
    return;
  }

  console.log(`Idle: backlog empty — running the daily idea sweep on ${branch}.`);
  sh('git', ['checkout', '-B', branch]);

  if (existsSync(REPORT)) rmSync(REPORT);
  try {
    execFileSync('claude', ['-p', buildIdeatePrompt(), '--dangerously-skip-permissions'],
      { cwd: REPO_DIR, stdio: 'inherit' });
  } catch (err) {
    throw new Error(`claude exited with an error during ideation (${err.message})`);
  }
  if (!existsSync(REPORT)) {
    throw new Error(`no cycle report was written to ${REPORT}`);
  }
  const report = parseCycleReport(readFileSync(REPORT, 'utf8'));

  // Independent verify gate. An idle sweep should touch only engine/IDEAS.md, so
  // the checks pass trivially; kept for consistency, and a failure (the machine
  // edited code it shouldn't have) flags the PR instead of shipping it quietly.
  const testsPassed = gate('npm', ['test']);
  const checkPassed = gate('npm', ['run', 'check']);
  const gateFailed = !testsPassed || !checkPassed;
  report.status = resolveStatus(report.status, testsPassed, checkPassed);
  if (existsSync(REPORT)) rmSync(REPORT);

  const prTitle = `${gateFailed ? '[FLAGGED] ' : ''}lab: idea sweep — ${today}`;
  const prBody = gateFailed
    ? `⚠️ The verify gate failed — an idle idea sweep should only touch engine/IDEAS.md. Review before merge.\n\n${report.summary}`
    : report.summary;
  publishBranch({
    repoDir: REPO_DIR,
    branch,
    commitMsg: `lab: idea sweep — ${today}`,
    prTitle,
    prBody,
    ghUser: GH_USER,
    dry: DRY,
  });
  console.log('Idle ideation complete — PR opened for review.');
}
```

- [ ] **Step 4: Call it from the empty-backlog branch**

In `runCycleLocked`, replace the current line (~185):

```js
  if (!picked) { console.log('Nothing buildable — the backlog is empty or every unchecked item has already been built into a PR.'); return; }
```

with:

```js
  if (!picked) {
    console.log('Nothing buildable — the backlog is empty or every unchecked item has already been built into a PR.');
    runIdleIdeation();
    return;
  }
```

- [ ] **Step 5: Verify the idle branch previews under `--dry-run`**

The backlog is currently all-`[x]`, so `pickNextBuildable` returns `null` and the idle branch runs. The seed `IDEAS.md` has no dated section, so the guard passes.

Run: `node engine/run-cycle.mjs --dry-run`
Expected: after the "Nothing buildable" line, the preview shows:
```
Idle: backlog empty — would run the daily idea sweep on lab/ideas-<today>.
[dry-run] would checkout lab/ideas-<today>
[dry-run] would invoke: claude -p <IDEATE prompt> --dangerously-skip-permissions
[dry-run] the sweep would append a "## <today>" section to engine/IDEAS.md
[dry-run] would commit + open a PR (no Lab entry)
```
No branch is created, no `claude` runs, working tree stays on `main`, clean.

Then confirm no side effects:
Run: `git status --porcelain && git branch --list 'lab/ideas-*'`
Expected: empty output (nothing modified, no idea branch created).

- [ ] **Step 6: Confirm the full suite and type check are green**

Run: `npm test && npm run check`
Expected: all tests PASS, `astro check` reports 0 errors.

- [ ] **Step 7: Document the behavior in `engine/README.md`**

Add a section to `engine/README.md` (place it near the run-cycle / loop description — match the file's existing heading style). Content:

```markdown
## Idle ideation (empty-backlog digest)

When an hourly `run-cycle` tick finds nothing buildable, instead of exiting it runs a
**once-daily idea sweep**: a headless `claude` run (manual: `engine/IDEATE.md`) reads the
repo and appends a dated section of **Ideas** + grounded **Opportunities** to
`engine/IDEAS.md`, then opens a PR that auto-merges on green CI (engine/* is allowlisted).
It fires at most once per calendar day — guarded by the newest `## YYYY-MM-DD` section in
`IDEAS.md` and by `branchHasPr('lab/ideas-<date>')` for the window while today's PR is
still open. No Lab entry is produced (internal only).

**Triage:** read `engine/IDEAS.md` each morning. **Queue** an idea by copying it into
`BACKLOG.md` as a `- [ ]` task (and delete it from the inbox); **reject** one by moving it
to `engine/IDEAS-rejected.md` (the next sweep won't re-propose it); **ignore** by leaving
it. `npm run pause` halts the loop (and thus ideation) like any other cycle.
```

- [ ] **Step 8: Commit**

```bash
git add engine/run-cycle.mjs engine/README.md
git commit -m "lab: idle ideation — empty-backlog sweep appends to the idea inbox"
```

---

## Self-Review

**Spec coverage:**
- Two-file inbox (`IDEAS.md` + `IDEAS-rejected.md`) → Task 2. ✓
- `IDEATE.md` manual: grounded repo read, reads both idea files + BACKLOG, no repeats, modest 3–6 each, appends one dated section, no Lab entry, writes report → Task 2 Step 3. ✓
- Once-per-day guard (newest dated section) + in-flight `branchHasPr` guard → Task 1 (`latestIdeaDate`) + Task 3 `runIdleIdeation`. ✓
- Idle branch reuses branch/lock/verify-gate/publishBranch/recover, skips Lab render → Task 3. ✓
- `--dry-run` makes no claude call / no writes → Task 3 Step 5. ✓
- Testable helpers `latestIdeaDate` + `ideasBranch` unit-tested → Task 1. ✓
- Guard-allowlist: all files under `engine/*` (auto-zone) → Global Constraints; no root/config file touched. ✓
- Triage lifecycle documented → Task 2 preamble + Task 3 README. ✓
- Out of scope (live fetch, email, helper command) → not implemented. ✓

**Placeholder scan:** No TBD/TODO; every code and content block is complete and literal. ✓

**Type consistency:** `latestIdeaDate`/`ideasBranch` defined in Task 1 are imported and called with matching signatures in Task 3. `parseCycleReport`/`resolveStatus`/`publishBranch` used per their real signatures in `engine/lib.mjs` and `engine/publish.mjs`. Report contract (`{status, summary, tags, body}`) matches `parseCycleReport`. ✓
