# Empty-Backlog Notifier Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When the hourly loop finds nothing to build, push an explicit notice out of the repo — a standing GitHub issue naming why the engine is idle and listing the untriaged ideas waiting in `engine/IDEAS.md` — and close it automatically when work is queued again.

**Architecture:** All decision logic is pure and unit-tested in `engine/lib.mjs`. Every `gh` side effect is isolated behind a new `engine/notify.mjs`, whose two exported entry points are fail-soft (they log and return rather than throwing, so a GitHub outage can never fail a cycle). `engine/run-cycle.mjs` gains two one-line call sites.

**Tech Stack:** Node ESM (`.mjs`, node builtins only), vitest, `gh` CLI 2.45.

Design: `docs/superpowers/specs/2026-07-25-empty-backlog-notifier-design.md`

## Global Constraints

- **No new dependencies.** The engine uses node builtins only. Do not add packages.
- **Every new file lives under `engine/**`** so the PR stays auto-zone and merges on green CI. Touching a root/config file would flip the whole PR to `needs-human`.
- **`--dry-run` must have zero write side effects.** Read-only `gh` calls may still run for real (this matches the existing `branchHasPr`, whose answer changes what dry-run reports).
- **The notifier must never fail a cycle.** Both entry points in `notify.mjs` wrap everything in `try/catch`, log to stderr, and return.
- **gh is 2.45.** `gh auth status --active` does not exist. `gh issue list --json number,title,body,comments` is verified available.
- **Issue title is the lookup key** and must stay byte-identical everywhere: `Engine idle — backlog empty` (note the em-dash, U+2014).
- **Marker format** is exactly `<!-- engine-idle: sweep=YYYY-MM-DD -->`, with `none` in place of the date when `IDEAS.md` has no dated sections yet.
- Run the full suite with `npm test` from the repo root.

## Note on one deliberate deviation from the spec

The spec says `pickNextBuildable` (in `run-cycle.mjs`) changes to return `{ next, skipped }`, and that its "existing tests" get updated. There are no existing tests for it — it is private to `run-cycle.mjs` and impure (it calls `branchHasPr`). Task 4 therefore extracts the decision into a pure, higher-order `partitionBuildable(items, hasPr)` in `lib.mjs`, which is fully testable with a fake predicate, and reduces `pickNextBuildable` to a one-line wrapper. This follows the codebase's established pattern (`lockIsFree`, `resolveStatus`, `pickBuildableItem` are all pure decisions with impure callers) and delivers the same `{ next, skipped }` contract the spec requires.

---

### Task 1: `parseIdeas` — read the idea inbox

**Files:**
- Modify: `engine/lib.mjs` (append a new export near `latestIdeaDate`, ~line 320)
- Test: `engine/lib.test.mjs`

**Interfaces:**
- Consumes: nothing.
- Produces: `parseIdeas(ideasMd: string) => Array<{ date: string, group: string|null, text: string }>` — used by Tasks 3 and 6.

The one trap: `engine/IDEAS.md` opens with a triage crib that is itself a bulleted list, and one of those bullets contains a literal `` `- [ ]` `` inside backticks. Bullets are only ideas when they appear **after** a `## YYYY-MM-DD` heading.

- [ ] **Step 1: Write the failing tests**

Append to `engine/lib.test.mjs`:

```js
describe('parseIdeas', () => {
  const HEADER = [
    '# Idea Inbox',
    '',
    '**Triage (Wolf, by hand):**',
    '- **Queue it** → copy the bullet into `engine/BACKLOG.md` as a `- [ ]` task.',
    '- **Reject it** → move the bullet to `engine/IDEAS-rejected.md`.',
    '',
  ].join('\n');

  it('ignores bullets before the first dated section', () => {
    expect(parseIdeas(HEADER)).toEqual([]);
  });

  it('collects bullets under a dated section, tagged with date and group', () => {
    const md = `${HEADER}## 2026-07-25\n\n### Ideas (dreamed up)\n- **Cycle cost ledger** — price each run.\n`;
    expect(parseIdeas(md)).toEqual([
      { date: '2026-07-25', group: 'Ideas', text: '**Cycle cost ledger** — price each run.' },
    ]);
  });

  it('strips the parenthetical gloss from a group heading', () => {
    const md = '## 2026-07-25\n### Opportunities (grounded in a repo read)\n- There is no 404 page.';
    expect(parseIdeas(md)[0].group).toBe('Opportunities');
  });

  it('keeps bullets from every dated section and both groups', () => {
    const md = [
      '## 2026-07-24',
      '### Ideas (dreamed up)',
      '- alpha',
      '### Opportunities (grounded in a repo read)',
      '- beta',
      '## 2026-07-25',
      '### Ideas (dreamed up)',
      '- gamma',
    ].join('\n');
    expect(parseIdeas(md).map((i) => `${i.date}/${i.group}/${i.text}`)).toEqual([
      '2026-07-24/Ideas/alpha',
      '2026-07-24/Opportunities/beta',
      '2026-07-25/Ideas/gamma',
    ]);
  });

  it('stops collecting when a non-date h2 opens a new section', () => {
    const md = '## 2026-07-25\n### Ideas (dreamed up)\n- kept\n\n## Archive\n- dropped';
    expect(parseIdeas(md)).toEqual([
      { date: '2026-07-25', group: 'Ideas', text: 'kept' },
    ]);
  });

  it('handles a bullet with no enclosing group heading', () => {
    expect(parseIdeas('## 2026-07-25\n- loose')).toEqual([
      { date: '2026-07-25', group: null, text: 'loose' },
    ]);
  });

  it('handles empty input', () => {
    expect(parseIdeas('')).toEqual([]);
  });
});
```

Add `parseIdeas` to the existing `latestIdeaDate` import line at the top of the file:

```js
import { latestIdeaDate, ideasBranch, parseIdeas } from './lib.mjs';
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run engine/lib.test.mjs -t parseIdeas`
Expected: FAIL — `parseIdeas is not a function`.

- [ ] **Step 3: Implement `parseIdeas`**

Append to `engine/lib.mjs`, after `ideasBranch`:

```js
// Every idea bullet in the inbox, tagged with the sweep that produced it and the
// group heading it sits under. Bullets before the first `## YYYY-MM-DD` heading are
// the file's own triage instructions, not ideas — that crib contains a literal
// `- [ ]` inside backticks and would otherwise parse as an idea — so collection only
// starts once a dated section is open, and a non-date h2 closes it again. The
// parenthetical gloss on a group heading ("### Ideas (dreamed up)") is dropped.
// Pure — the caller reads the file (or passes '' before it exists).
export function parseIdeas(ideasMd) {
  const out = [];
  let date = null;
  let group = null;
  for (const line of String(ideasMd).split('\n')) {
    const heading = line.match(/^(#{2,6})\s+(.*\S)\s*$/);
    if (heading) {
      if (heading[1].length === 2) {
        const d = heading[2].match(/^(\d{4}-\d{2}-\d{2})$/);
        date = d ? d[1] : null;
        group = null;
      } else if (heading[1].length === 3) {
        group = heading[2].replace(/\s*\(.*\)\s*$/, '').trim() || null;
      }
      continue;
    }
    const bullet = line.match(/^-\s+(.*\S)\s*$/);
    if (bullet && date) out.push({ date, group, text: bullet[1] });
  }
  return out;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run engine/lib.test.mjs -t parseIdeas`
Expected: PASS, 7 tests.

- [ ] **Step 5: Commit**

```bash
git add engine/lib.mjs engine/lib.test.mjs
git commit -m "engine: add parseIdeas — read the idea inbox into structured items"
```

---

### Task 2: The marker — deciding whether a sweep has been reported

**Files:**
- Modify: `engine/lib.mjs`
- Test: `engine/lib.test.mjs`

**Interfaces:**
- Consumes: nothing.
- Produces: `IDLE_ISSUE_TITLE: string`, `idleMarker(sweepDate: string|null) => string`, `sweepReported(texts: string[], sweepDate: string|null) => boolean` — used by Tasks 3, 5, 6.

- [ ] **Step 1: Write the failing tests**

Append to `engine/lib.test.mjs`:

```js
describe('idleMarker / sweepReported', () => {
  it('renders a marker for a sweep date', () => {
    expect(idleMarker('2026-07-25')).toBe('<!-- engine-idle: sweep=2026-07-25 -->');
  });

  it('renders a "none" marker when no sweep has run yet', () => {
    expect(idleMarker(null)).toBe('<!-- engine-idle: sweep=none -->');
  });

  it('is false when nothing carries the marker', () => {
    expect(sweepReported(['a body', 'a comment'], '2026-07-25')).toBe(false);
  });

  it('is true when the issue body carries the marker', () => {
    const body = '<!-- engine-idle: sweep=2026-07-25 -->\nEngine is idle.';
    expect(sweepReported([body], '2026-07-25')).toBe(true);
  });

  it('is true when a later comment carries the marker', () => {
    const texts = ['<!-- engine-idle: sweep=2026-07-24 -->', '<!-- engine-idle: sweep=2026-07-25 -->'];
    expect(sweepReported(texts, '2026-07-25')).toBe(true);
  });

  it('does not match a different sweep date', () => {
    expect(sweepReported(['<!-- engine-idle: sweep=2026-07-24 -->'], '2026-07-25')).toBe(false);
  });

  it('does not match a date that merely shares a prefix', () => {
    expect(sweepReported(['<!-- engine-idle: sweep=2026-07-2 -->'], '2026-07-25')).toBe(false);
  });

  it('treats the no-sweep-yet case like any other marker', () => {
    expect(sweepReported(['<!-- engine-idle: sweep=none -->'], null)).toBe(true);
    expect(sweepReported([], null)).toBe(false);
  });

  it('tolerates a missing texts argument', () => {
    expect(sweepReported(undefined, '2026-07-25')).toBe(false);
  });
});
```

Extend the import line added in Task 1:

```js
import { latestIdeaDate, ideasBranch, parseIdeas, idleMarker, sweepReported, IDLE_ISSUE_TITLE } from './lib.mjs';
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run engine/lib.test.mjs -t idleMarker`
Expected: FAIL — `idleMarker is not a function`.

- [ ] **Step 3: Implement the marker helpers**

Append to `engine/lib.mjs`:

```js
// The fixed title of the standing "engine is idle" issue. It is the lookup key —
// the notifier finds the issue by exact title match rather than by label, so no
// label has to be created first. Keep it byte-identical everywhere (em-dash, U+2014).
export const IDLE_ISSUE_TITLE = 'Engine idle — backlog empty';

// An invisible marker stamped into every idle notice, keyed to the SWEEP date
// rather than the calendar date. The sweep writes IDEAS.md on a branch that
// auto-merges, so at the moment it finishes main still holds the previous day's
// ideas; a calendar-date rule would fire on that tick, report yesterday's list, and
// stay one day behind forever. Keying to the sweep date means the notice fires on
// the first tick where main actually carries new ideas. `none` covers a repo whose
// inbox has no dated sections yet, so that case posts exactly once too.
export function idleMarker(sweepDate) {
  return `<!-- engine-idle: sweep=${sweepDate || 'none'} -->`;
}

// Has this sweep already been posted? `texts` is the issue body plus every comment
// body. Whole-marker matching (including the trailing ` -->`) is what stops
// '2026-07-2' from matching '2026-07-25'.
export function sweepReported(texts, sweepDate) {
  const marker = idleMarker(sweepDate);
  return (texts || []).some((t) => String(t).includes(marker));
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run engine/lib.test.mjs -t idleMarker`
Expected: PASS, 9 tests.

- [ ] **Step 5: Commit**

```bash
git add engine/lib.mjs engine/lib.test.mjs
git commit -m "engine: add the idle-notice marker keyed to sweep date"
```

---

### Task 3: `renderIdleNotice` — the message body

**Files:**
- Modify: `engine/lib.mjs`
- Test: `engine/lib.test.mjs`

**Interfaces:**
- Consumes: `idleMarker` (Task 2), the item shape from `parseIdeas` (Task 1).
- Produces: `renderIdleNotice({ sweepDate, ideas, skipped, repoUrl }) => string` — used by Task 6. `skipped` is `Array<{ title: string, branch: string }>` (produced by Task 4).

One renderer serves both the initial issue body and every later comment.

- [ ] **Step 1: Write the failing tests**

Append to `engine/lib.test.mjs`:

```js
describe('renderIdleNotice', () => {
  const ideas = [
    { date: '2026-07-24', group: 'Ideas', text: 'alpha' },
    { date: '2026-07-25', group: 'Ideas', text: 'beta' },
    { date: '2026-07-25', group: 'Opportunities', text: 'gamma' },
  ];

  it('leads with the marker so the post is self-identifying', () => {
    const out = renderIdleNotice({ sweepDate: '2026-07-25', ideas: [] });
    expect(out.split('\n')[0]).toBe('<!-- engine-idle: sweep=2026-07-25 -->');
  });

  it('says the backlog is empty when nothing was skipped', () => {
    const out = renderIdleNotice({ sweepDate: '2026-07-25', ideas: [] });
    expect(out).toContain('no unchecked items');
    expect(out).not.toContain('blocked behind');
  });

  it('names each skipped item and its branch when the backlog is blocked', () => {
    const out = renderIdleNotice({
      sweepDate: '2026-07-25',
      ideas: [],
      skipped: [{ title: 'Give writing posts their own pages', branch: 'lab/give-writing-posts' }],
    });
    expect(out).toContain('not** empty');
    expect(out).toContain('Give writing posts their own pages');
    expect(out).toContain('lab/give-writing-posts');
  });

  it('reports the sweep date and the untriaged count', () => {
    const out = renderIdleNotice({ sweepDate: '2026-07-25', ideas });
    expect(out).toContain('2026-07-25');
    expect(out).toContain('**3**');
  });

  it('groups ideas by sweep date, newest first', () => {
    const out = renderIdleNotice({ sweepDate: '2026-07-25', ideas });
    expect(out.indexOf('### 2026-07-25')).toBeLessThan(out.indexOf('### 2026-07-24'));
    expect(out).toContain('- _Ideas_ — beta');
    expect(out).toContain('- _Opportunities_ — gamma');
  });

  it('omits the idea list entirely when there is nothing untriaged', () => {
    const out = renderIdleNotice({ sweepDate: '2026-07-25', ideas: [] });
    expect(out).not.toContain('###');
    expect(out).toContain('**0**');
  });

  it('says "none yet" when no sweep has ever run', () => {
    expect(renderIdleNotice({ sweepDate: null, ideas: [] })).toContain('none yet');
  });

  it('always carries the triage crib and both file links', () => {
    const out = renderIdleNotice({ sweepDate: '2026-07-25', ideas: [] });
    expect(out).toContain('engine/IDEAS-rejected.md');
    expect(out).toContain('/blob/main/engine/IDEAS.md');
    expect(out).toContain('/blob/main/engine/BACKLOG.md');
  });
});
```

Extend the import line again:

```js
import { latestIdeaDate, ideasBranch, parseIdeas, idleMarker, sweepReported, IDLE_ISSUE_TITLE, renderIdleNotice } from './lib.mjs';
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run engine/lib.test.mjs -t renderIdleNotice`
Expected: FAIL — `renderIdleNotice is not a function`.

- [ ] **Step 3: Implement `renderIdleNotice`**

Append to `engine/lib.mjs`:

```js
export const REPO_URL = 'https://github.com/wolfazoid/whatupwolf';

// The body of an idle notice — used verbatim for both the initial issue and every
// later comment, so a reader who only sees one comment still gets full context.
// "Nothing buildable" conflates two different situations: a genuinely empty backlog
// and one whose remaining items are all parked behind an open PR. The notice
// distinguishes them, because the fix differs (queue work vs. merge a PR).
export function renderIdleNotice({ sweepDate, ideas = [], skipped = [], repoUrl = REPO_URL }) {
  const L = [idleMarker(sweepDate), ''];

  if (skipped.length) {
    L.push(`The loop found nothing buildable, but the backlog is **not** empty — ${skipped.length} unchecked item(s) are parked behind an existing PR:`, '');
    for (const s of skipped) L.push(`- ${s.title} — \`${s.branch}\``);
  } else {
    L.push('The loop found nothing buildable — the backlog has **no unchecked items**.');
  }
  L.push('');
  L.push(`Last idea sweep: **${sweepDate || 'none yet'}** · untriaged ideas in \`engine/IDEAS.md\`: **${ideas.length}**`);
  L.push('');

  const dates = [...new Set(ideas.map((i) => i.date))].sort().reverse();
  for (const d of dates) {
    L.push(`### ${d}`, '');
    for (const idea of ideas.filter((i) => i.date === d)) {
      L.push(`- ${idea.group ? `_${idea.group}_ — ` : ''}${idea.text}`);
    }
    L.push('');
  }

  L.push('**Triage:** queue → copy the bullet into `engine/BACKLOG.md` as `- [ ]` and delete it from the inbox · reject → move it to `engine/IDEAS-rejected.md` · ignore → leave it.');
  L.push('');
  L.push(`[IDEAS.md](${repoUrl}/blob/main/engine/IDEAS.md) · [BACKLOG.md](${repoUrl}/blob/main/engine/BACKLOG.md)`);
  return L.join('\n');
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run engine/lib.test.mjs -t renderIdleNotice`
Expected: PASS, 8 tests.

- [ ] **Step 5: Commit**

```bash
git add engine/lib.mjs engine/lib.test.mjs
git commit -m "engine: render the idle notice, separating empty from PR-blocked"
```

---

### Task 4: `partitionBuildable` — surface what was skipped

**Files:**
- Modify: `engine/lib.mjs`
- Modify: `engine/run-cycle.mjs:127-136` (`pickNextBuildable`) and its call site at `engine/run-cycle.mjs:267`
- Test: `engine/lib.test.mjs`

**Interfaces:**
- Consumes: `pickBuildableItem` (existing, `engine/lib.mjs:106`), `shortTitle` (existing).
- Produces: `partitionBuildable(items, hasPr) => { next: {item, branch}|null, skipped: Array<{title, branch}> }`, where `hasPr(branch) => boolean`. Used by Task 6 via `run-cycle.mjs`.

Today the loop throws away the fact that it skipped something, so a blocked backlog is indistinguishable from an empty one. This keeps the list.

- [ ] **Step 1: Write the failing tests**

Append to `engine/lib.test.mjs`:

```js
describe('partitionBuildable', () => {
  const items = [
    { title: 'Alpha task', done: true },
    { title: 'Beta task', done: false },
    { title: 'Gamma task', done: false },
  ];

  it('returns the first unchecked item and no skips when nothing has a PR', () => {
    const { next, skipped } = partitionBuildable(items, () => false);
    expect(next.item.title).toBe('Beta task');
    expect(skipped).toEqual([]);
  });

  it('skips items whose branch already has a PR and records them', () => {
    const betaBranch = branchForItem('Beta task');
    const { next, skipped } = partitionBuildable(items, (b) => b === betaBranch);
    expect(next.item.title).toBe('Gamma task');
    expect(skipped).toEqual([{ title: shortTitle('Beta task'), branch: betaBranch }]);
  });

  it('returns next=null and every skipped item when all are blocked', () => {
    const { next, skipped } = partitionBuildable(items, () => true);
    expect(next).toBeNull();
    expect(skipped.map((s) => s.title)).toEqual([shortTitle('Beta task'), shortTitle('Gamma task')]);
  });

  it('returns next=null and no skips when the backlog is genuinely empty', () => {
    const { next, skipped } = partitionBuildable([{ title: 'Done', done: true }], () => false);
    expect(next).toBeNull();
    expect(skipped).toEqual([]);
  });
});
```

Extend the import line:

```js
import { branchForItem, pickBuildableItem, prListArgs, partitionBuildable } from './lib.mjs';
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run engine/lib.test.mjs -t partitionBuildable`
Expected: FAIL — `partitionBuildable is not a function`.

- [ ] **Step 3: Implement `partitionBuildable`**

Append to `engine/lib.mjs`:

```js
// Walk the backlog for the first item the loop can actually build, keeping the ones
// passed over. `hasPr` is injected so the decision stays pure and testable; the
// runner supplies the gh-backed lookup. Returning the skipped list is what lets the
// idle notice say "blocked behind lab/foo" instead of the misleading "backlog empty".
export function partitionBuildable(items, hasPr) {
  const taken = [];
  const skipped = [];
  for (;;) {
    const next = pickBuildableItem(items, taken);
    if (!next) return { next: null, skipped };
    if (!hasPr(next.branch)) return { next, skipped };
    skipped.push({ title: shortTitle(next.item.title), branch: next.branch });
    taken.push(next.branch);
  }
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run engine/lib.test.mjs -t partitionBuildable`
Expected: PASS, 4 tests.

- [ ] **Step 5: Rewire `run-cycle.mjs` to use it**

Replace the whole `pickNextBuildable` function (`engine/run-cycle.mjs:127-136`) with:

```js
function pickNextBuildable(items) {
  const result = partitionBuildable(items, branchHasPr);
  for (const s of result.skipped) {
    console.log(`Skipping "${s.title}" — ${s.branch} has already been built into a PR.`);
  }
  return result;
}
```

Add `partitionBuildable` to the `./lib.mjs` import block at the top of `engine/run-cycle.mjs`.

Then change the call site at `engine/run-cycle.mjs:267` from:

```js
  const picked = pickNextBuildable(items);
  if (!picked) {
```

to:

```js
  const { next: picked, skipped } = pickNextBuildable(items);
  if (!picked) {
```

Leave the body of that `if` alone for now — Task 6 adds the notifier call.

- [ ] **Step 6: Verify the runner still works end to end**

Run: `npm test && node engine/run-cycle.mjs --dry-run`
Expected: all tests pass; the dry run prints its usual output and creates nothing. With the backlog currently empty it should reach the "Nothing buildable" line.

- [ ] **Step 7: Commit**

```bash
git add engine/lib.mjs engine/lib.test.mjs engine/run-cycle.mjs
git commit -m "engine: keep the skipped-item list when nothing is buildable"
```

---

### Task 5: `engine/notify.mjs` — the gh boundary

**Files:**
- Create: `engine/notify.mjs`
- Test: `engine/notify.test.mjs`

**Interfaces:**
- Consumes: `IDLE_ISSUE_TITLE`, `sweepReported`, `renderIdleNotice` (Tasks 2–3).
- Produces: `notifyIdle({ repoDir, sweepDate, ideas, skipped, dry }) => void` and `notifyBuilding({ repoDir, nowBuilding, dry }) => void` — both used by Task 6. Both are fail-soft and return nothing.

Mirrors `engine/publish.mjs`: a `sh` helper that logs-and-skips under `dry`, real `execFileSync` otherwise. Read-only lookups run for real even in dry mode, matching `branchHasPr`.

- [ ] **Step 1: Write the failing smoke test**

Create `engine/notify.test.mjs`:

```js
import { describe, it, expect, vi, afterEach } from 'vitest';
import { notifyIdle, notifyBuilding } from './notify.mjs';

describe('notify (dry mode)', () => {
  afterEach(() => vi.restoreAllMocks());

  it('previews the issue it would open and writes nothing', () => {
    const logs = [];
    vi.spyOn(console, 'log').mockImplementation((m) => logs.push(String(m)));

    notifyIdle({
      repoDir: '/tmp/repo',
      sweepDate: '2026-07-25',
      ideas: [{ date: '2026-07-25', group: 'Ideas', text: 'alpha' }],
      skipped: [],
      dry: true,
    });

    const joined = logs.join('\n');
    expect(joined).toContain('[dry-run]');
    expect(joined).toContain('Engine idle');
    expect(joined).toContain('alpha');
  });

  it('previews the close it would perform and writes nothing', () => {
    const logs = [];
    vi.spyOn(console, 'log').mockImplementation((m) => logs.push(String(m)));

    notifyBuilding({ repoDir: '/tmp/repo', nowBuilding: 'Some task', dry: true });

    expect(logs.join('\n')).toContain('[dry-run]');
  });

  it('never throws when gh is unavailable', () => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => notifyIdle({
      repoDir: '/nonexistent-path-for-this-test',
      sweepDate: '2026-07-25',
      ideas: [],
      skipped: [],
      dry: false,
    })).not.toThrow();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run engine/notify.test.mjs`
Expected: FAIL — cannot resolve `./notify.mjs`.

- [ ] **Step 3: Implement `engine/notify.mjs`**

```js
// GitHub-issue notifications for the lab engine. The loop's idle signals otherwise
// live only inside the repo (a line in cycle.log, a section appended to IDEAS.md),
// so nobody is told when the machine runs out of work. This pushes an explicit
// notice out: one standing issue, a comment per sweep, closed automatically when
// work is queued again.
//
// Everything here is BEST EFFORT. GitHub being unreachable must never fail a cycle,
// so both entry points swallow their errors and log instead of throwing.
import { execFileSync } from 'node:child_process';
import { IDLE_ISSUE_TITLE, sweepReported, renderIdleNotice } from './lib.mjs';

const gh = (args, repoDir) =>
  execFileSync('gh', args, { cwd: repoDir, encoding: 'utf8' }).trim();

// The open idle issue with its body and every comment body, or null if there isn't
// one. Read-only, so it runs for real even under --dry-run (nothing is mutated and
// the answer changes what dry-run reports) — same contract as run-cycle's
// branchHasPr. Throws on gh failure; the callers below turn that into a warning.
function findIdleIssue(repoDir) {
  const out = gh(
    ['issue', 'list', '--state', 'open', '--limit', '100', '--json', 'number,title,body,comments'],
    repoDir,
  );
  const issue = JSON.parse(out || '[]').find((i) => i.title === IDLE_ISSUE_TITLE);
  if (!issue) return null;
  const texts = [issue.body || '', ...(issue.comments || []).map((c) => c.body || '')];
  return { number: issue.number, texts };
}

// Post the idle notice, unless this sweep has already been reported. Opens the
// standing issue the first time and comments on it thereafter.
export function notifyIdle({ repoDir, sweepDate, ideas = [], skipped = [], dry = false }) {
  try {
    const issue = findIdleIssue(repoDir);
    if (issue && sweepReported(issue.texts, sweepDate)) {
      console.log(`Idle notice: sweep ${sweepDate || 'none'} already reported on issue #${issue.number}.`);
      return;
    }
    const body = renderIdleNotice({ sweepDate, ideas, skipped });
    if (dry) {
      console.log(`[dry-run] would ${issue ? `comment on issue #${issue.number}` : `open issue "${IDLE_ISSUE_TITLE}"`}:`);
      console.log(body);
      return;
    }
    if (issue) {
      gh(['issue', 'comment', String(issue.number), '--body', body], repoDir);
      console.log(`Idle notice: commented on issue #${issue.number}.`);
    } else {
      const url = gh(['issue', 'create', '--title', IDLE_ISSUE_TITLE, '--body', body], repoDir);
      console.log(`Idle notice: opened ${url}`);
    }
  } catch (err) {
    console.error(`Could not post the idle notice (${err.message}) — continuing.`);
  }
}

// Close the standing idle issue because the loop has work again. No-op when no
// issue is open, which is the common case.
export function notifyBuilding({ repoDir, nowBuilding, dry = false }) {
  try {
    const issue = findIdleIssue(repoDir);
    if (!issue) return;
    const body = `Back to work — building: ${nowBuilding}`;
    if (dry) {
      console.log(`[dry-run] would comment on and close issue #${issue.number}: ${body}`);
      return;
    }
    gh(['issue', 'close', String(issue.number), '--comment', body], repoDir);
    console.log(`Idle notice: closed issue #${issue.number}.`);
  } catch (err) {
    console.error(`Could not close the idle notice (${err.message}) — continuing.`);
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run engine/notify.test.mjs`
Expected: PASS, 3 tests.

Note the third test exercises the real failure path: `gh` is invoked with a `cwd` that does not exist, `execFileSync` throws, and the `catch` must turn that into a logged warning rather than an exception.

- [ ] **Step 5: Commit**

```bash
git add engine/notify.mjs engine/notify.test.mjs
git commit -m "engine: add notify.mjs — standing GitHub issue for the idle state"
```

---

### Task 6: Wire it into the loop and document it

**Files:**
- Modify: `engine/run-cycle.mjs` (import block; the `!picked` branch ~line 267; the `picked` path just after)
- Modify: `engine/README.md`

**Interfaces:**
- Consumes: `notifyIdle`, `notifyBuilding` (Task 5); `parseIdeas`, `latestIdeaDate` (Tasks 1, existing); `skipped` from Task 4.
- Produces: nothing — this is the top-level wiring.

- [ ] **Step 1: Add the imports**

In `engine/run-cycle.mjs`, add `parseIdeas` to the existing `./lib.mjs` import block, and add a new import line below the `publishBranch` one:

```js
import { notifyIdle, notifyBuilding } from './notify.mjs';
```

- [ ] **Step 2: Call the notifier on the idle path**

Replace the `!picked` branch in `runCycleLocked()`:

```js
  if (!picked) {
    console.log('Nothing buildable — the backlog is empty or every unchecked item has already been built into a PR.');
    runIdleIdeation();
    const ideasMd = existsSync(IDEAS) ? readFileSync(IDEAS, 'utf8') : '';
    notifyIdle({
      repoDir: REPO_DIR,
      sweepDate: latestIdeaDate(ideasMd),
      ideas: parseIdeas(ideasMd),
      skipped,
      dry: DRY,
    });
    return;
  }
```

`IDEAS.md` is re-read here rather than reusing anything `runIdleIdeation` holds: the sweep publishes on a branch that auto-merges later, so the copy on `main` is the one the notice should describe. That is exactly what the sweep-date marker is designed around.

- [ ] **Step 3: Close the issue when work resumes**

Immediately after the `const { item, branch } = picked;` / `shortTitle` lines and before the `git checkout -B` in step 3 of the cycle, add:

```js
  notifyBuilding({ repoDir: REPO_DIR, nowBuilding: short, dry: DRY });
```

- [ ] **Step 4: Verify both paths under dry-run**

Run: `npm test`
Expected: full suite passes.

Run: `node engine/run-cycle.mjs --dry-run`
Expected: with the backlog empty, it reaches "Nothing buildable" and then prints a `[dry-run] would open issue "Engine idle — backlog empty":` block containing the untriaged ideas. Nothing is created on GitHub.

Then add a temporary unchecked item to `engine/BACKLOG.md` (e.g. `- [ ] Temporary smoke-test item`), re-run `node engine/run-cycle.mjs --dry-run`, and confirm it prints the `[dry-run] would comment on and close issue` line (or nothing, if no idle issue is open yet) and proceeds into the build path. **Remove the temporary item before committing** — leaving it would make the live loop build it.

- [ ] **Step 5: Document it in `engine/README.md`**

Add a section (place it after the Cron section, matching the existing heading style):

```markdown
## Idle notifications

When a tick finds nothing to build, the runner posts to a standing GitHub issue
titled **"Engine idle — backlog empty"** (`engine/notify.mjs`). The issue names why
the loop is idle — a genuinely empty backlog, or items parked behind an open PR —
and lists the untriaged ideas in `engine/IDEAS.md`. The next tick that finds work
closes it, so an open issue means idle and a closed one means working.

Posting is keyed to the **sweep date**, not the calendar date. The idea sweep writes
`IDEAS.md` on a branch that auto-merges, so at the moment it finishes `main` still
holds the previous day's ideas; a calendar rule would report a day behind forever.
The notice fires on the first tick where `main` actually carries the new sweep,
usually the hour after.

**One-time setup, required:** GitHub → Settings → Notifications → enable
**"Include your own updates"**. The runner authenticates as `wolfazoid`, and GitHub
does not email you about your own activity by default — without this toggle the
issues are filed correctly and no email ever arrives.

Notification is best effort: if `gh` fails, the runner logs a warning and the cycle
continues. It never fails a build.
```

- [ ] **Step 6: Commit**

```bash
git add engine/run-cycle.mjs engine/README.md
git commit -m "engine: notify on the idle path, close the issue when work resumes"
```

- [ ] **Step 7: Final verification before opening the PR**

Run: `npm test && npm run check && npm run build`
Expected: all green. Confirm `git status --porcelain` shows no stray `BACKLOG.md` edit from Step 4's smoke test.

---

## Self-Review

**Spec coverage.** Channel/GitHub issue → Task 5. Once-per-sweep cadence and the marker rule → Task 2, applied in Tasks 5–6. One standing issue with daily comments → Task 5 (`notifyIdle`). Auto-close → Task 5 (`notifyBuilding`), wired in Task 6. Runner stays on `wolfazoid` → no account switching anywhere in the plan. `parseIdeas` → Task 1. `renderIdleNotice` incl. blocked-vs-empty → Tasks 3–4. Error handling → Task 5 (both `catch` blocks, plus the never-throws test). Dry-run → Task 5, verified in Task 6 Step 4. Testing → every task. Manual GitHub toggle → Task 6 Step 5. The spec's `pickNextBuildable` item is covered by Task 4 with the documented deviation.

**Placeholders.** None — every code step carries the literal code, and every test step the literal assertions.

**Type consistency.** `{ date, group, text }` from `parseIdeas` is what `renderIdleNotice` iterates and what Task 6 passes as `ideas`. `{ title, branch }` from `partitionBuildable` is what `renderIdleNotice` iterates as `skipped` and what Task 6 passes through. `idleMarker` is consumed by `sweepReported` and `renderIdleNotice` with the same signature throughout. `IDLE_ISSUE_TITLE` is defined once in Task 2 and used in Tasks 5–6. `notifyIdle`/`notifyBuilding` signatures match between Task 5's definition and Task 6's calls.
