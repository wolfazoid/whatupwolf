# Agent Weekly — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Ship the engine's first experiment — a weekly AI-agent digest that researches public sources, publishes a `type: digest` Lab entry, and auto-merges hands-off; scheduled Sundays 07:00.

**Architecture:** A dedicated `engine/run-experiment.mjs <name>` (separate from the self-building coding loop) invokes headless Claude Code with an experiment prompt to research + write a digest report, then renders a `digest` Lab entry and opens an auto-merging PR. Shared git/commit/push/PR machinery is factored out of `run-cycle.mjs` into `engine/publish.mjs` so both runners reuse it (DRY). No general experiment-runner framework yet (YAGNI — extract after 2–3 experiments).

**Tech Stack:** Node ESM (`.mjs`), Vitest, `claude -p` with WebSearch/WebFetch, `git`/`gh`, Astro content collections.

## Global Constraints

- Engine code is plain ESM `.mjs`; site code TypeScript. Tests `*.test.mjs` / `*.test.ts`.
- **Execution model:** auto-zone tasks (all `engine/**`, `src/lib/**`) are queued as engine BACKLOG items and built by the **Tier-B loop** (auto-merge on green). The **one gated task** (`src/content.config.ts`) is hand-merged by Wolf. The first digest run is operational.
- Digest is **public by construction** — no sanitizer, no private/public split.
- Digest **publishes direct** (`draft: false`) and the **first run is autonomous**.
- Voice: factual machine-log curation, never Wolf's editorial. Every digest item needs a real, fetched link.
- Reuse the existing cycle-report shape `{ status, summary, tags, body }` (`parseCycleReport`) for the experiment report — no new schema.

---

### Task 1: Add `digest` to the direct-publish policy  ·  *auto-zone (engine backlog)*

**Files:** Modify `engine/lib.mjs`; Test `engine/lib.test.mjs`

**Interfaces:**
- Consumes: existing `draftForType(type)` + `DIRECT_PUBLISH_TYPES`.
- Produces: `draftForType('digest') === false`.

- [ ] **Step 1 — failing test** (`engine/lib.test.mjs`, in the `draftForType` describe):
```js
it('publishes digest entries direct (not draft)', () => {
  expect(draftForType('digest')).toBe(false);
});
```
- [ ] **Step 2 — run, expect FAIL** (`digest` still gated). `npm test`
- [ ] **Step 3 — implement**: in `engine/lib.mjs` change
  `const DIRECT_PUBLISH_TYPES = new Set(['monitor', 'experiment']);` →
  `const DIRECT_PUBLISH_TYPES = new Set(['monitor', 'experiment', 'digest']);`
- [ ] **Step 4 — run, expect PASS.** `npm test`
- [ ] **Step 5 — commit.**

**Backlog item text:**
> Add `digest` to the direct-publish policy in engine/lib.mjs so `draftForType('digest')` returns false (digests publish direct, not draft). Add a unit test.

---

### Task 2: Add `digest` to the lab schema  ·  🔒 *GATED — Wolf hand-merges*

**Files:** Modify `src/content.config.ts`

**Interfaces:** Produces: `lab` entries may use `type: digest`.

- [ ] **Step 1 — edit the enum** in `src/content.config.ts`:
```ts
    type: z.enum(['experiment', 'briefing', 'monitor', 'note', 'digest']),
```
- [ ] **Step 2 — verify** with a throwaway digest entry (delete after):
  create `src/content/lab/_scratch-digest.md` with valid frontmatter `type: digest`, run
  `npm run check` (0 errors) and `npm run build` (succeeds), then delete the scratch file.
- [ ] **Step 3 — commit** (this lands on a `needs-human` PR or a direct push; it touches a gated path by design).

**Note:** This must be on `main` **before** Task 6 (the first run), or the digest entry fails the build.

---

### Task 3: Extract `publishBranch` into `engine/publish.mjs`  ·  *auto-zone (engine backlog)*

**Files:** Create `engine/publish.mjs`; Modify `engine/run-cycle.mjs`; Test `engine/publish.test.mjs`

**Interfaces:**
- Produces: `publishBranch({ repoDir, branch, commitMsg, prTitle, prBody, ghUser = 'wolfazoid', dry = false }): void`
  — switches gh to `ghUser`, `git add -A`, commit, `push -u origin <branch>`, `gh pr create`,
  then restores the previous gh account (printing the existing warning when it can't be
  determined). In `dry` mode prints the commands and performs no side effects.
- Consumes (moved in): the account-restore logic + `currentGhUser`/`parseActiveGhAccount`
  currently inline in `run-cycle.mjs` §7.

- [ ] **Step 1** — Create `engine/publish.mjs` with `publishBranch` (move §7's commit/push/PR/restore block verbatim in behavior; parameterize `repoDir`, `branch`, `commitMsg`, `prTitle`, `prBody`, `ghUser`, `dry`). Keep `currentGhUser` here (import `parseActiveGhAccount` from `./lib.mjs`).
- [ ] **Step 2** — In `engine/run-cycle.mjs`, replace the entire §7 block (`const prevUser = …` through the `finally { … }`) with a single call:
```js
  publishBranch({
    repoDir: REPO_DIR, branch, ghUser: GH_USER, dry: DRY,
    commitMsg: `lab: ${short}`,
    prTitle: `${gateFailed ? '[FLAGGED] ' : ''}lab: ${short}`,
    prBody: gateFailed
      ? `⚠️ The runner's independent verify gate failed (npm test / npm run check) — status overridden to \`flagged\` for review.\n\n${report.summary}`
      : report.summary,
  });
```
  and add `import { publishBranch } from './publish.mjs';`. Remove the now-unused local `currentGhUser` from `run-cycle.mjs`.
- [ ] **Step 3 — test** (`engine/publish.test.mjs`): assert `dry:true` returns without throwing and that a captured console shows the git/gh commands (behavioral dry-run check, mirroring the runner's approach).
- [ ] **Step 4 — verify no regression**: `node engine/run-cycle.mjs --dry-run` still prints the plan and does nothing; `npm test` passes; `git status` clean, still on `main`.
- [ ] **Step 5 — commit.**

**Backlog item text:**
> Extract the commit/push/PR/account-restore machinery from engine/run-cycle.mjs §7 into a reusable `publishBranch({repoDir, branch, commitMsg, prTitle, prBody, ghUser, dry})` in a new engine/publish.mjs, and rewire run-cycle.mjs to call it. Preserve dry-run (zero side effects) and the gh-account restore + warning. Verify `node engine/run-cycle.mjs --dry-run` is unchanged and tests pass.

---

### Task 4: Build the Agent Weekly experiment  ·  *auto-zone (engine backlog)*

**Files:** Create `engine/run-experiment.mjs`, `engine/experiments/agent-weekly.md`; Modify `engine/README.md`

**Interfaces:**
- CLI: `node engine/run-experiment.mjs <name> [--dry-run]`.
- Experiment registry (in `run-experiment.mjs`): `{ 'agent-weekly': { type: 'digest', titlePrefix: 'Agent Weekly' } }`.
- Report contract: the machine writes `engine/.experiment-report.json` = `{ status, summary, tags, body }` (reuse `parseCycleReport`).
- Consumes: `publishBranch` (Task 3), `renderLabEntry`, `draftForType`, `shortTitle`, `parseCycleReport` from `lib.mjs`; the `PAUSED` kill-switch + main-sync pattern from `run-cycle.mjs`.

- [ ] **Step 1 — `engine/experiments/agent-weekly.md`** (the operating manual). Must instruct the machine to:
  - Research the **past 7 days** of AI-agent tooling & model releases via WebSearch/WebFetch.
  - Sources: Anthropic/OpenAI/Google DeepMind/Meta AI blogs & changelogs, major agent-framework releases, trending agent repos on GitHub, key arXiv agent papers, top HN threads.
  - **Hard rule:** every item carries a real, fetched link; no unlinked/hallucinated items; a slow week → a shorter honest brief, never padding.
  - Format the `body` (markdown): one-line intro (week range + count); ~5–8 top items each `**Title** — what it is · why it matters · link`; a short "also noted" list.
  - Voice: factual, concise, no hype. Write `engine/.experiment-report.json` = `{status:"done", summary, tags:["agents","digest"], body}`.

- [ ] **Step 2 — `engine/run-experiment.mjs`.** One run:
  1. Kill-switch: exit if `engine/PAUSED` exists (reuse pattern).
  2. `git checkout main` + `git pull`.
  3. Resolve `<name>` in the registry (error if unknown). Read `engine/experiments/<name>.md`.
  4. Invoke `claude -p <prompt> --dangerously-skip-permissions` (WebSearch/WebFetch available); read + `parseCycleReport('engine/.experiment-report.json')`.
  5. `const date = new Date();` `const title = \`${cfg.titlePrefix} — week of ${date.toISOString().slice(0,10)}\`;`
  6. `renderLabEntry({ title, date, type: cfg.type, status: report.status, tags: report.tags.length ? report.tags : ['digest'], draft: draftForType(cfg.type), summary: report.summary, body: report.body })`.
  7. Write `src/content/lab/${date.toISOString().slice(0,10)}-${name}.md`. (**No** backlog check-off — experiments aren't backlog items.)
  8. `publishBranch({ repoDir: REPO_DIR, branch: \`lab/${name}-${date.toISOString().slice(0,10)}\`, commitMsg: \`lab: ${title}\`, prTitle: \`lab: ${title}\`, prBody: report.summary, ghUser: GH_USER, dry: DRY })`.
  - `--dry-run` uses a synthetic report and prints the entry preview with no side effects.

- [ ] **Step 3 — `engine/README.md`**: add a "Experiments" section documenting `node engine/run-experiment.mjs agent-weekly` and the cron:
```cron
# Agent Weekly — Sundays 07:00
0 7 * * 0 cd ~/whatupwolf && /usr/bin/node engine/run-experiment.mjs agent-weekly >> engine/experiment.log 2>&1
```
  and note `engine/PAUSED` halts it too.

- [ ] **Step 4 — verify**: `node engine/run-experiment.mjs agent-weekly --dry-run` prints a valid `type: digest` entry preview (`draft: false`) and creates no branch/commit; `npm test` + `npm run check` pass; add `engine/.experiment-report.json` and `engine/experiment.log` to `.gitignore`.
- [ ] **Step 5 — commit.**

**Backlog item text:**
> Build the Agent Weekly experiment: engine/experiments/agent-weekly.md (the research prompt — weekly AI-agent digest, the sources and format from the spec, real-link hard rule, writes engine/.experiment-report.json as {status,summary,tags,body}) and engine/run-experiment.mjs <name> (kill-switch + sync main, invoke claude -p with the prompt, render a `type: digest` lab entry via renderLabEntry with draft:false, write src/content/lab/<date>-<name>.md, and open a PR via publishBranch — no backlog check-off). Support --dry-run (no side effects), gitignore the report + log, document the Sunday-07:00 cron in engine/README.md. Verify the dry run previews a valid digest entry.

---

### Task 5: First autonomous digest run  ·  *operational*

**Preconditions:** Tasks 1–4 merged; Task 2 (`type: digest` schema) on `main`; `claude`/`gh` ready.

- [ ] **Step 1** — `node engine/run-experiment.mjs agent-weekly` → opens a PR with one `src/content/lab/<date>-agent-weekly.md` entry.
- [ ] **Step 2 — verify the digest** (the dogfood quality gate): links resolve, items are from the past week, machine-voice (no hype/opinion), `type: digest`, `draft: false`, ~5–8 items with why-it-matters.
- [ ] **Step 3 — confirm hands-off**: guard marks it allowlisted (no `needs-human`), CI `build` green, and it **auto-merges after CI** (Tier B).
- [ ] **Step 4 — confirm live**: entry renders on `/lab` and appears in the RSS feed.

---

## Self-Review

**Spec coverage:** §2 architecture → Tasks 3,4. §3 research/sources/link-rule → Task 4 Step 1. §4 format → Task 4 Step 1. §5 publishing (`type: digest` direct; schema gated; sanitizer not used) → Tasks 1,2 + Task 4 (renderLabEntry, no sanitize). §6 Sunday cron → Task 4 Step 3. §8 DoD → Tasks 1–5. §9 out-of-scope (framework/email/private split) → not built. §10 decisions (direct, autonomous) → Tasks 1, 5. ✓

**Placeholder scan:** none — the one intentional runtime unknown (exact `claude -p` research flags) is a concrete step in Task 4. ✓

**Type consistency:** `publishBranch(...)` signature identical across Tasks 3 & 4; report shape `{status,summary,tags,body}` matches `parseCycleReport`; `renderLabEntry` param names (incl. `draft`) match the current implementation; `type: digest` used consistently in Tasks 1, 2, 4. ✓
