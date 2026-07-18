# Self-Building Lab Engine — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a hand-crafted "bootstrap loop" — a cron-driven agent that works a backlog, opens a PR per cycle, and logs to the Lab — then use it to have the machine build the first real engine capability: an allowlist + fail-closed sanitization filter.

**Architecture:** A Node runner (`engine/run-cycle.mjs`) reads a markdown backlog, branches, invokes headless Claude Code to do one coding task, then deterministically renders a Lab entry, commits, and opens a PR (human-gated). Pure cycle logic lives in `engine/lib.mjs` and is unit-tested; the sanitizer (`src/lib/sanitize.ts`) is seeded as a typed, throwing stub plus human-written failing tests, and the *machine* implements the body during the proving cycle.

**Tech Stack:** Node 20+ ESM (`.mjs`, no build step for the engine), TypeScript (Astro strict) for site code, Vitest for tests, `git` + `gh` CLI for VCS/PR, headless Claude Code (`claude -p`) as the worker.

## Global Constraints

- **Engine is plain ESM `.mjs`** — no build step; cron runs it directly with `node`. Site code stays TypeScript.
- **Test runner: Vitest** (`npm test` → `vitest run`). Tests are `*.test.ts` (site) and `*.test.mjs` (engine).
- **No new *runtime* site dependencies** — Vitest is a `devDependency` only.
- **Lab entries use the existing `lab` collection schema unchanged** — `type: experiment`, fields `title/date/type/status/tags/live/summary`. No schema edits.
- **PR-first, human-gated** — the runner opens a PR and never merges. Nothing auto-ships.
- **Git auth uses the `wolfazoid` GitHub account** — the default `gh` account here (`wolfhoward-pack`) has no push access; a plain push fails with `could not read Username`. The runner switches to `wolfazoid` for push/PR and restores the prior account after.
- **Sanitizer is allowlist + fail-closed** — emit only author-allowlisted fields; a registered secret reaching the output throws. Never denylist-scrub free text.
- **Honest logging** — if a cycle's tests go red, the PR still opens and the Lab entry records `status: flagged`.

---

### Task 1: Test tooling + backlog-parsing helpers

**Files:**
- Modify: `package.json` (add Vitest devDep + `test` scripts)
- Modify: `tsconfig.json` (exclude `engine` from `astro check`)
- Create: `engine/lib.mjs`
- Test: `engine/lib.test.mjs`

**Interfaces:**
- Consumes: nothing (first task).
- Produces:
  - `parseBacklog(md: string): { title: string, done: boolean, raw: string }[]`
  - `pickNextItem(items): item | null` — first item with `done === false`
  - `markItemDone(md: string, title: string): string` — flips that item's `[ ]` → `[x]`

- [ ] **Step 1: Add Vitest and test scripts to `package.json`**

Run:
```bash
npm install -D vitest@^3
```

Then confirm `package.json` `scripts` contains (add these two lines):
```json
    "test": "vitest run",
    "test:watch": "vitest"
```

- [ ] **Step 2: Exclude the engine dir from `astro check`**

In `tsconfig.json`, change the `exclude` array to:
```json
  "exclude": [
    "dist",
    "engine"
  ],
```
(The engine is plain JS ops tooling; we don't want `astro check` type-checking it. Vitest still runs `engine/*.test.mjs`.)

- [ ] **Step 3: Write the failing test**

Create `engine/lib.test.mjs`:
```js
import { describe, it, expect } from 'vitest';
import { parseBacklog, pickNextItem, markItemDone } from './lib.mjs';

const SAMPLE = `# Engine Backlog

- [ ] Build the sanitization filter
- [ ] Build the experiment-runner framework
- [x] Bootstrap the loop
`;

describe('parseBacklog', () => {
  it('parses checkbox items with their done state', () => {
    const items = parseBacklog(SAMPLE);
    expect(items).toHaveLength(3);
    expect(items[0]).toMatchObject({ title: 'Build the sanitization filter', done: false });
    expect(items[2]).toMatchObject({ title: 'Bootstrap the loop', done: true });
  });
  it('ignores non-item lines', () => {
    expect(parseBacklog('# Heading\n\nsome prose')).toEqual([]);
  });
});

describe('pickNextItem', () => {
  it('returns the first unchecked item', () => {
    expect(pickNextItem(parseBacklog(SAMPLE)).title).toBe('Build the sanitization filter');
  });
  it('returns null when everything is done', () => {
    expect(pickNextItem(parseBacklog('- [x] done'))).toBeNull();
  });
});

describe('markItemDone', () => {
  it('flips the matching unchecked item to checked', () => {
    const out = markItemDone(SAMPLE, 'Build the sanitization filter');
    expect(out).toContain('- [x] Build the sanitization filter');
    // leaves the other unchecked item alone
    expect(out).toContain('- [ ] Build the experiment-runner framework');
  });
});
```

- [ ] **Step 4: Run the test to verify it fails**

Run: `npm test`
Expected: FAIL — `Failed to load ... engine/lib.mjs` / "does not provide an export named 'parseBacklog'".

- [ ] **Step 5: Write the minimal implementation**

Create `engine/lib.mjs`:
```js
// Pure helpers for one lab-engine cycle. No I/O — unit-tested in lib.test.mjs.

export function parseBacklog(md) {
  const items = [];
  for (const line of md.split('\n')) {
    const m = line.match(/^\s*-\s*\[([ xX])\]\s+(.*\S)\s*$/);
    if (m) items.push({ title: m[2].trim(), done: m[1].toLowerCase() === 'x', raw: line });
  }
  return items;
}

export function pickNextItem(items) {
  return items.find((i) => !i.done) ?? null;
}

export function markItemDone(md, title) {
  return md
    .split('\n')
    .map((line) => {
      const m = line.match(/^(\s*-\s*)\[ \](\s+)(.*\S)\s*$/);
      if (m && m[3].trim() === title) return `${m[1]}[x]${m[2]}${m[3]}`;
      return line;
    })
    .join('\n');
}
```

- [ ] **Step 6: Run the test to verify it passes**

Run: `npm test`
Expected: PASS (all `engine/lib.test.mjs` tests green).

- [ ] **Step 7: Commit**

```bash
git add package.json package-lock.json tsconfig.json engine/lib.mjs engine/lib.test.mjs
git commit -m "feat(engine): backlog-parsing helpers + vitest setup"
```

---

### Task 2: Slug, Lab-entry rendering, and cycle-report helpers

**Files:**
- Modify: `engine/lib.mjs`
- Test: `engine/lib.test.mjs`

**Interfaces:**
- Consumes: nothing new.
- Produces:
  - `slugify(text: string): string` — lowercase, non-alphanumerics → `-`, trimmed, ≤60 chars
  - `renderLabEntry({ title, date: Date, type?, status, tags?, live?, summary, body }): string` — a full `lab/*.md` (frontmatter + body)
  - `parseCycleReport(jsonStr: string): { status: 'done'|'flagged', summary: string, tags: string[], body: string }` — throws if `status` is not one of the two literals

- [ ] **Step 1: Write the failing test**

Append to `engine/lib.test.mjs`:
```js
import { slugify, renderLabEntry, parseCycleReport } from './lib.mjs';

describe('slugify', () => {
  it('lowercases and hyphenates', () => {
    expect(slugify('Build the sanitization filter')).toBe('build-the-sanitization-filter');
  });
  it('trims stray hyphens and caps length', () => {
    expect(slugify('  Hello, World!  ')).toBe('hello-world');
    expect(slugify('x'.repeat(80)).length).toBeLessThanOrEqual(60);
  });
});

describe('renderLabEntry', () => {
  const entry = renderLabEntry({
    title: 'Build the sanitization filter',
    date: new Date('2026-07-18T14:30:00Z'),
    status: 'done',
    tags: ['engine', 'sanitizer'],
    summary: 'The machine built the sanitizer.',
    body: 'Implemented allowlist + fail-closed scan.\n',
  });
  it('emits valid frontmatter with the existing schema fields', () => {
    expect(entry).toContain('type: experiment');
    expect(entry).toContain('date: 2026-07-18T14:30');
    expect(entry).toContain('status: done');
    expect(entry).toContain('tags: [engine, sanitizer]');
    expect(entry).toContain('live: true');
    expect(entry).toContain('title: "Build the sanitization filter"');
  });
  it('includes the body after the frontmatter', () => {
    expect(entry.trim().endsWith('Implemented allowlist + fail-closed scan.')).toBe(true);
  });
});

describe('parseCycleReport', () => {
  it('parses a well-formed report', () => {
    const r = parseCycleReport('{"status":"flagged","summary":"s","tags":["a"],"body":"b"}');
    expect(r).toEqual({ status: 'flagged', summary: 's', tags: ['a'], body: 'b' });
  });
  it('throws on a bad status', () => {
    expect(() => parseCycleReport('{"status":"weird"}')).toThrow();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test`
Expected: FAIL — "does not provide an export named 'slugify'".

- [ ] **Step 3: Write the minimal implementation**

Append to `engine/lib.mjs`:
```js
export function slugify(text) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
    .replace(/-+$/g, '');
}

const yamlStr = (s) => `"${String(s).replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;

export function renderLabEntry({ title, date, type = 'experiment', status, tags = [], live = true, summary, body }) {
  const iso = date.toISOString().slice(0, 16); // YYYY-MM-DDTHH:mm
  return [
    '---',
    `title: ${yamlStr(title)}`,
    `date: ${iso}`,
    `type: ${type}`,
    `status: ${status}`,
    `tags: [${tags.join(', ')}]`,
    `live: ${live}`,
    `summary: ${yamlStr(summary)}`,
    '---',
    '',
    String(body).trim(),
    '',
  ].join('\n');
}

export function parseCycleReport(jsonStr) {
  const r = JSON.parse(jsonStr);
  if (r.status !== 'done' && r.status !== 'flagged') {
    throw new Error(`cycle report: status must be "done" or "flagged", got ${JSON.stringify(r.status)}`);
  }
  return {
    status: r.status,
    summary: String(r.summary ?? ''),
    tags: Array.isArray(r.tags) ? r.tags.map(String) : [],
    body: String(r.body ?? ''),
  };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add engine/lib.mjs engine/lib.test.mjs
git commit -m "feat(engine): slug, Lab-entry render, and cycle-report helpers"
```

---

### Task 3: Seed the sanitizer — typed throwing stub + human-written failing tests

This is the "spec handed to the machine." We author the interface and the tests; the *machine* fills in the body during Task 6. The stub keeps `astro check` green while the behavior tests fail.

**Files:**
- Create: `src/lib/sanitize.ts`
- Test: `src/lib/sanitize.test.ts`

**Interfaces:**
- Produces (consumed by the machine in Task 6, and by future engine experiments):
  - `interface PrivateReport { meta: { client?: string; urls?: string[]; secrets?: string[] }; findings: string; public: PublicSnapshot }`
  - `interface PublicSnapshot { title: string; summary: string; body?: string; tags?: string[] }`
  - `class SanitizationError extends Error`
  - `function sanitize(report: PrivateReport): PublicSnapshot`

- [ ] **Step 1: Write the typed throwing stub**

Create `src/lib/sanitize.ts`:
```ts
// Public-safe sanitizer for lab reports. Allowlist + fail-closed by design:
// emit ONLY the author-curated `public` block, then scan the emitted output
// against the report's registered secrets and THROW if any survives.
//
// NOTE: the body of `sanitize` is intentionally a stub. It is implemented by
// the lab engine itself as the first backlog item (see engine/BACKLOG.md).
// The failing tests in sanitize.test.ts define exactly what it must satisfy.

export interface PublicSnapshot {
  title: string;
  summary: string;
  body?: string;
  tags?: string[];
}

export interface PrivateReport {
  meta: { client?: string; urls?: string[]; secrets?: string[] };
  findings: string;
  public: PublicSnapshot;
}

export class SanitizationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SanitizationError';
  }
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function sanitize(report: PrivateReport): PublicSnapshot {
  throw new Error('NotImplemented: sanitize() — to be built by the lab engine');
}
```

- [ ] **Step 2: Write the human-seeded failing tests + fixtures**

Create `src/lib/sanitize.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { sanitize, SanitizationError, type PrivateReport } from './sanitize';

// A report whose public block is genuinely clean.
const clean: PrivateReport = {
  meta: { client: 'Acme Corp', urls: ['https://acme.example'], secrets: ['sk-live-123'] },
  findings: 'internal: regression on acme.example, traced with token sk-live-123',
  public: { title: 'Audit complete', summary: 'Improved LCP on a key template', tags: ['perf'] },
};

// A report that smuggles a registered secret (the client name) into a public field.
const leaky: PrivateReport = {
  meta: { client: 'Acme Corp', urls: ['https://acme.example'], secrets: ['sk-live-123'] },
  findings: 'internal detail',
  public: { title: 'Audit complete', summary: 'Improved LCP for Acme Corp', tags: ['perf'] },
};

describe('sanitize — allowlist', () => {
  it('emits only the allowlisted public fields, never meta', () => {
    const out = sanitize(clean);
    expect(out).toEqual({ title: 'Audit complete', summary: 'Improved LCP on a key template', tags: ['perf'] });
    const serialized = JSON.stringify(out);
    for (const secret of ['Acme Corp', 'acme.example', 'sk-live-123']) {
      expect(serialized).not.toContain(secret);
    }
  });
});

describe('sanitize — fail closed', () => {
  it('throws SanitizationError when a registered secret reaches the output', () => {
    expect(() => sanitize(leaky)).toThrow(SanitizationError);
  });
});
```

- [ ] **Step 3: Run the tests to verify they fail (behaviorally)**

Run: `npm test`
Expected: FAIL — both `sanitize` tests throw `NotImplemented: sanitize()`. (Failing for a *behavioral* reason, not a missing module — this is the intended seed state.)

- [ ] **Step 4: Verify the site still type-checks and builds**

Run: `npm run check`
Expected: 0 errors (the stub provides real types).

- [ ] **Step 5: Commit the seed**

```bash
git add src/lib/sanitize.ts src/lib/sanitize.test.ts
git commit -m "test(sanitize): seed typed stub + failing allowlist/fail-closed tests"
```

---

### Task 4: Engine operating docs — CYCLE.md, BACKLOG.md, README.md

**Files:**
- Create: `engine/CYCLE.md` (the machine's operating manual)
- Create: `engine/BACKLOG.md` (the steering wheel; top item points at Task 3's tests)
- Create: `engine/README.md` (human docs)
- Modify: `.gitignore` (ignore the transient cycle report)

**Interfaces:**
- Consumes: `src/lib/sanitize.test.ts` path (referenced by the backlog).
- Produces: `engine/CYCLE.md`, `engine/BACKLOG.md` (read by the runner in Task 5).

- [ ] **Step 1: Write the operating manual**

Create `engine/CYCLE.md`:
```markdown
# Lab Engine — Cycle Operating Manual

You are the whatupwolf lab engine running ONE automated cycle on a feature branch.
The runner has already checked out a fresh branch and told you this cycle's task.

## Do exactly this

1. **Implement the task.** Follow existing repo conventions. Write real code, not stubs.
2. **Make it green.** Run `npm test` and `npm run check` until BOTH pass. If the task
   ships a capability with seeded failing tests, your job is to make those tests pass
   without weakening them.
3. **If you cannot make it green**, stop and report honestly with `status: "flagged"`.
4. **Check off nothing and touch no git state** — the runner handles commit, branch,
   PR, and the Lab entry. You only change source files and write the report below.

## Report file (required)

Before you finish, write `engine/.cycle-report.json`:

```json
{
  "status": "done | flagged",
  "summary": "one sentence for the Lab feed",
  "tags": ["engine", "<capability>"],
  "body": "2-5 sentences: what you tried, the key decision, and pass/fail."
}
```

## Hard rules

- Never edit `engine/BACKLOG.md`, never commit, never push, never merge.
- Never weaken or delete a seeded test to make it pass.
- Keep changes scoped to this cycle's task.
```

- [ ] **Step 2: Write the backlog (the steering wheel)**

Create `engine/BACKLOG.md`:
```markdown
# Engine Backlog

Top unchecked item is picked each cycle. Human-editable between cycles.

- [ ] Build the sanitization filter — implement `src/lib/sanitize.ts` so `npm test` passes (allowlist + fail-closed; do not weaken the seeded tests)
- [ ] Build the experiment-runner framework (deferred — do not start yet)
- [ ] Choose and build the first real experiment (deferred — do not start yet)
```

- [ ] **Step 3: Write the human README**

Create `engine/README.md`:
```markdown
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
```

- [ ] **Step 4: Ignore the transient cycle report**

Append to `.gitignore`:
```
engine/.cycle-report.json
engine/cron.log
```

- [ ] **Step 5: Commit**

```bash
git add engine/CYCLE.md engine/BACKLOG.md engine/README.md .gitignore
git commit -m "docs(engine): operating manual, backlog, and README"
```

---

### Task 5: The runner — `engine/run-cycle.mjs`

The orchestration: pure helpers from Task 1–2 for logic, `git`/`gh`/`claude` shell-outs for wiring. Verified via `--dry-run` (no unit test — it's I/O orchestration; the logic it depends on is already tested).

**Files:**
- Create: `engine/run-cycle.mjs`

**Interfaces:**
- Consumes: `parseBacklog`, `pickNextItem`, `markItemDone`, `slugify`, `renderLabEntry`, `parseCycleReport` from `engine/lib.mjs`; `engine/BACKLOG.md`, `engine/CYCLE.md`.
- Produces: a CLI (`node engine/run-cycle.mjs [--dry-run]`).

- [ ] **Step 1: Write the runner**

Create `engine/run-cycle.mjs`:
```js
#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
  parseBacklog, pickNextItem, markItemDone, slugify, renderLabEntry, parseCycleReport,
} from './lib.mjs';

const ENGINE_DIR = dirname(fileURLToPath(import.meta.url));
const REPO_DIR = join(ENGINE_DIR, '..');
const BACKLOG = join(ENGINE_DIR, 'BACKLOG.md');
const CYCLE = join(ENGINE_DIR, 'CYCLE.md');
const REPORT = join(ENGINE_DIR, '.cycle-report.json');
const GH_USER = 'wolfazoid';
const DRY = process.argv.includes('--dry-run');

function sh(cmd, args) {
  if (DRY) { console.log(`[dry-run] ${cmd} ${args.join(' ')}`); return ''; }
  return execFileSync(cmd, args, { cwd: REPO_DIR, encoding: 'utf8' }).trim();
}

function currentGhUser() {
  try {
    const out = execFileSync('gh', ['auth', 'status', '--active'], { encoding: 'utf8' });
    return out.match(/account (\S+)/)?.[1] ?? '';
  } catch { return ''; }
}

function buildPrompt(task) {
  const cycle = readFileSync(CYCLE, 'utf8');
  return [
    'You are the whatupwolf lab engine running one automated cycle.',
    'Operating manual (follow it exactly):',
    '', cycle, '',
    `THIS CYCLE'S TASK: ${task}`,
  ].join('\n');
}

function main() {
  // 1. Sync main
  sh('git', ['checkout', 'main']);
  sh('git', ['pull', '--ff-only', 'origin', 'main']);

  // 2. Pick the task
  const backlogMd = readFileSync(BACKLOG, 'utf8');
  const item = pickNextItem(parseBacklog(backlogMd));
  if (!item) { console.log('Backlog empty — nothing to do.'); return; }
  const slug = slugify(item.title);
  const branch = `lab/${slug}`;
  console.log(`Task:   ${item.title}\nBranch: ${branch}`);

  // 3. Fresh branch
  sh('git', ['checkout', '-b', branch]);

  // 4. Run the machine
  if (existsSync(REPORT)) rmSync(REPORT);
  if (DRY) {
    console.log('[dry-run] would invoke: claude -p <prompt> --dangerously-skip-permissions');
  } else {
    execFileSync('claude', ['-p', buildPrompt(item.title), '--dangerously-skip-permissions'],
      { cwd: REPO_DIR, stdio: 'inherit' });
  }

  // 5. Read the machine's report
  const report = DRY
    ? { status: 'done', summary: '(dry-run)', tags: ['engine'], body: '(dry-run)' }
    : parseCycleReport(readFileSync(REPORT, 'utf8'));

  // 6. Render the Lab entry + check off the backlog item
  const date = new Date();
  const entry = renderLabEntry({
    title: item.title,
    date,
    status: report.status,
    tags: report.tags.length ? report.tags : ['engine'],
    summary: report.summary,
    body: report.body,
  });
  const entryPath = join(REPO_DIR, 'src', 'content', 'lab', `${date.toISOString().slice(0, 10)}-${slug}.md`);

  if (DRY) {
    console.log(`[dry-run] would write ${entryPath}`);
    console.log(`[dry-run] would check off "${item.title}" in BACKLOG.md`);
    console.log('----- Lab entry preview -----\n' + entry);
    return;
  }

  writeFileSync(BACKLOG, markItemDone(backlogMd, item.title));
  writeFileSync(entryPath, entry);
  if (existsSync(REPORT)) rmSync(REPORT);

  // 7. Commit, push, PR — as wolfazoid, then restore
  const prevUser = currentGhUser();
  sh('gh', ['auth', 'switch', '--user', GH_USER]);
  try {
    sh('git', ['add', '-A']);
    sh('git', ['commit', '-m', `lab: ${item.title}`]);
    sh('git', ['push', '-u', 'origin', branch]);
    sh('gh', ['pr', 'create', '--fill', '--head', branch, '--base', 'main']);
  } finally {
    if (prevUser && prevUser !== GH_USER) sh('gh', ['auth', 'switch', '--user', prevUser]);
  }
  console.log('Cycle complete — PR opened for review.');
}

main();
```

- [ ] **Step 2: Verify the dry run produces the plan with no side effects**

Run: `node engine/run-cycle.mjs --dry-run`
Expected output includes:
- `Task:   Build the sanitization filter — implement src/lib/sanitize.ts ...`
- `Branch: lab/build-the-sanitization-filter-implement-src-lib-sanitiz` (slug ≤60 chars)
- `[dry-run] would invoke: claude -p <prompt> ...`
- a `----- Lab entry preview -----` block with valid frontmatter (`type: experiment`, `status: done`).

- [ ] **Step 3: Confirm no branch/commit was created**

Run: `git status && git branch`
Expected: still on `main`, clean tree, no `lab/*` branch.

- [ ] **Step 4: Commit**

```bash
git add engine/run-cycle.mjs
git commit -m "feat(engine): cycle runner with --dry-run"
```

---

### Task 6: Prove the loop end-to-end (the machine builds the sanitizer)

The deliverable is operational, not a code diff *you* write: run one real cycle, let the machine implement `src/lib/sanitize.ts`, review the PR, merge, and confirm the site deploys. This closes the spec's Definition of Done.

**Files:**
- No files authored by you. The *machine* modifies `src/lib/sanitize.ts` and the runner creates `src/content/lab/<date>-build-the-sanitization-filter....md` and updates `engine/BACKLOG.md`, on a `lab/*` branch.

**Preconditions:**
- `claude` CLI available and logged in; `gh` has a `wolfazoid` account with push access (`gh auth switch --user wolfazoid && gh auth setup-git` once).
- Working tree clean on `main`.

- [ ] **Step 1: Run one real cycle**

Run: `node engine/run-cycle.mjs`
Expected: it branches, invokes Claude Code (which edits `src/lib/sanitize.ts` and writes `engine/.cycle-report.json`), then prints `Cycle complete — PR opened for review.`

- [ ] **Step 2: Review the PR**

Run: `gh pr view --web` (as `wolfazoid`)
Verify:
- `src/lib/sanitize.ts` now has a real allowlist + fail-closed implementation (emits only `public` fields; scans output against `meta.client`/`urls`/`secrets`; throws `SanitizationError` on a hit).
- The seeded tests in `src/lib/sanitize.test.ts` are **unchanged**.
- A `src/content/lab/*.md` entry exists with `type: experiment` and a truthful summary.

- [ ] **Step 3: Verify the PR is green locally**

Run (on the PR branch):
```bash
git fetch origin && git checkout lab/build-the-sanitization-filter-implement-src-lib-sanitiz
npm test && npm run check && npm run build
```
Expected: all sanitizer tests PASS, `astro check` 0 errors, build succeeds. If red, the cycle honestly logged `status: flagged` — coach via a review comment or fix, then re-run; DoD requires one green cycle.

- [ ] **Step 4: Merge**

Run: `gh pr merge --squash --delete-branch` (as `wolfazoid`)
Expected: merged to `main`; Cloudflare auto-deploys; the Lab entry goes live within ~1 minute with the pulse-dot (`live: true`).

- [ ] **Step 5: Confirm live + restore git account**

Run: `git checkout main && git pull && gh auth switch --user wolfhoward-pack`
Verify the new entry renders at `/lab` on the deployed site.

---

## Self-Review

**1. Spec coverage:**
- §2 `run-cycle.mjs` → Tasks 1, 2, 5. `CYCLE.md`/`BACKLOG.md` → Task 4. `sanitize.ts` + tests → Tasks 3, 6. Lab integration (existing schema) → Task 2 (`renderLabEntry`, `type: experiment`). ✓
- §3 sanitizer (allowlist + fail-closed, human-seeded tests) → Task 3 (seed) + Task 6 (machine builds). ✓
- §4 data flow / safety (PR-first, fail-closed, honest logging, `wolfazoid` auth, idempotency via `markItemDone`) → Tasks 4–6. ✓
- §5 Lab build-log frontmatter → Task 2 `renderLabEntry` test asserts every field. ✓
- §6 DoD (runner exists + manual run; one real cycle; allowlist+fail-closed with passing tests; `npm run check` green; `engine/README.md`) → Tasks 4–6. ✓
- §7 out-of-scope items (experiment-runner, real experiment, Gmail, auto-merge) → left as deferred backlog lines in Task 4; no tasks implement them. ✓
- §8 open decisions resolved in-plan: cron (Task 4 README), headless invocation (`claude -p ... --dangerously-skip-permissions`, Task 5), branch/PR hygiene (`--squash --delete-branch`, Task 6), `sanitize` types (Task 3). ✓

**2. Placeholder scan:** No TBD/TODO; every code step has complete code; the only intentional "stub" is the sanitizer body, which the spec explicitly assigns to the machine (Task 6). ✓

**3. Type consistency:** `parseBacklog`/`pickNextItem`/`markItemDone`/`slugify`/`renderLabEntry`/`parseCycleReport` names and signatures match across Tasks 1, 2, and 5. `PrivateReport`/`PublicSnapshot`/`SanitizationError`/`sanitize` match between Task 3's stub, its tests, and Task 6's review checklist. The backlog item text is identical in Task 4 and the runner's expected output in Task 5. ✓
