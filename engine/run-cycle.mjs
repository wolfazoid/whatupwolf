#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
  parseBacklog, pickBuildableItem, prListArgs, markItemDone, slugify, renderLabEntry, parseCycleReport,
  resolveStatus, shortTitle, draftForType, lockIsFree, newLabEntriesInStatus,
} from './lib.mjs';
import { publishBranch } from './publish.mjs';

const ENGINE_DIR = dirname(fileURLToPath(import.meta.url));
const REPO_DIR = join(ENGINE_DIR, '..');
const BACKLOG = join(ENGINE_DIR, 'BACKLOG.md');
const CYCLE = join(ENGINE_DIR, 'CYCLE.md');
const REPORT = join(ENGINE_DIR, '.cycle-report.json');
const PAUSED = join(ENGINE_DIR, 'PAUSED');
const LOCK = join(ENGINE_DIR, '.run.lock');
const GH_USER = 'wolfazoid';
const DRY = process.argv.includes('--dry-run');

// Liveness probe for the single-instance lock. process.kill(pid, 0) sends no
// signal — it only asks whether the pid is reachable. ESRCH means the process is
// gone (a stale lock); EPERM means it exists but we may not signal it (still
// alive). Any other outcome (no throw) means it's alive.
function pidAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    return err.code === 'EPERM';
  }
}

// Acquire the single-instance lock by exclusively creating engine/.run.lock
// (flag 'wx') with our pid, so two overlapping runs can't both go on to stomp
// each other's checkout/branch state. If the file already exists we read it and
// let lockIsFree judge it: a lock left by a killed run (dead pid, or garbage) is
// cleared and the create retried; a lock held by a live process makes us back
// off. Returns a release() to call on every exit path, or null when another run
// holds the lock. --dry-run takes no lock and has no side effects — it returns a
// no-op release so the preview neither blocks nor writes the lockfile.
function acquireLock() {
  if (DRY) return () => {};
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      writeFileSync(LOCK, `${process.pid}\n`, { flag: 'wx' });
      return releaseLock;
    } catch (err) {
      if (err.code !== 'EEXIST') throw err;
      let contents = null;
      try { contents = readFileSync(LOCK, 'utf8'); } catch { /* vanished between calls — retry */ }
      if (!lockIsFree(contents, pidAlive)) return null;
      try { rmSync(LOCK); } catch { /* another run cleared it first — retry */ }
    }
  }
  return null;
}

// Release the lock, but only if we still own it — compare the recorded pid to
// ours so we never delete a lock a newer run has since acquired. A missing file
// is fine (already released). Never throws, so it's safe in a finally.
function releaseLock() {
  try {
    if (Number.parseInt(readFileSync(LOCK, 'utf8').trim(), 10) === process.pid) rmSync(LOCK);
  } catch { /* already gone */ }
}

function sh(cmd, args) {
  if (DRY) { console.log(`[dry-run] ${cmd} ${args.join(' ')}`); return ''; }
  return execFileSync(cmd, args, { cwd: REPO_DIR, encoding: 'utf8' }).trim();
}

// Runs a verify command and reports pass/fail without throwing, so the runner
// can decide the outcome rather than crashing on the first red check.
function gate(cmd, args) {
  try {
    execFileSync(cmd, args, { cwd: REPO_DIR, stdio: 'inherit' });
    return true;
  } catch {
    return false;
  }
}

// Returns the working tree to a clean main after a failed cycle, so the always-on
// loop stays re-runnable: the next run starts from a known-good state instead of a
// half-finished feature branch. `-f` drops the machine's uncommitted edits (it never
// commits, so nothing durable is lost) and `git clean -fd` removes any stray files it
// created. Both respect .gitignore, so PAUSED, cron.log, node_modules, and .env survive.
function recoverToMain() {
  if (DRY) return;
  try {
    sh('git', ['checkout', '-f', 'main']);
    sh('git', ['clean', '-fd']);
  } catch (err) {
    console.error(`Recovery: could not fully reset to main (${err.message}). Check the working tree by hand.`);
  }
}

// True when `branch` already has a PR in ANY state — open, closed, or merged.
// Read-only, so it runs for real even under --dry-run (nothing is mutated and the
// answer changes what dry-run reports). Fail-soft: if gh is unavailable or errors,
// we say "no PR" and let the cycle proceed exactly as it did before this check
// existed — a broken gh should not wedge the loop.
function branchHasPr(branch) {
  try {
    const out = execFileSync('gh', prListArgs(branch), { cwd: REPO_DIR, encoding: 'utf8' });
    return JSON.parse(out.trim() || '[]').length > 0;
  } catch (err) {
    console.error(`Could not check for an existing PR on ${branch} (${err.message}) — assuming none.`);
    return false;
  }
}

// Walks the backlog for the first item the loop can actually build. An unchecked
// item whose branch already carries a PR — open, closed, or merged — is skipped,
// not rebuilt. An open one is a gated PR waiting on Wolf's review, and rebuilding
// it would hard-reset the branch under the reviewer (step 3's `checkout -B`); a
// closed or merged one means the item was already built once and superseded, so
// rebuilding it just redoes shipped work. Either way the loop would park on the
// same item forever. Selection is pure (pickBuildableItem); this
// function only supplies the answers to "is this branch taken?", one lookup at a
// time so a long backlog doesn't fan out a gh call per item.
function pickNextBuildable(items) {
  const taken = [];
  for (;;) {
    const next = pickBuildableItem(items, taken);
    if (!next) return null;
    if (!branchHasPr(next.branch)) return next;
    console.log(`Skipping "${shortTitle(next.item.title)}" — ${next.branch} has already been built into a PR.`);
    taken.push(next.branch);
  }
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
  // 0. Kill switch (local, instant) — checked before any git/network work, so a
  // `touch engine/PAUSED` (or `npm run pause`) stops the loop even if git is hung.
  if (!DRY && existsSync(PAUSED)) {
    console.log('Paused: engine/PAUSED is present — exiting immediately. `npm run resume` to resume.');
    return;
  }

  // 0b. Single-instance lock — acquired after the kill switch and before any
  // git/network work, so two overlapping runs can't corrupt each other's git
  // state. A live holder makes us exit 0 without touching git; the finally
  // releases on every exit path, including the outer catch/recover.
  const release = acquireLock();
  if (!release) {
    console.log('another run in progress — exiting');
    return;
  }
  try {
    runCycleLocked();
  } finally {
    release();
  }
}

function runCycleLocked() {
  // 1. Sync main
  sh('git', ['checkout', 'main']);
  sh('git', ['pull', '--ff-only', 'origin', 'main']);

  // 1b. Re-check after pull — also catches a PAUSED committed to main (e.g. created
  // from the GitHub web UI on a phone), which the pull above brings down.
  if (!DRY && existsSync(PAUSED)) {
    console.log('Paused: engine/PAUSED present on main — exiting without running a cycle. Remove it to resume.');
    return;
  }

  // 2. Pick the task, skipping anything already in flight.
  const backlogMd = readFileSync(BACKLOG, 'utf8');
  const items = parseBacklog(backlogMd);
  const picked = pickNextBuildable(items);
  if (!picked) { console.log('Nothing buildable — the backlog is empty or every unchecked item has already been built into a PR.'); return; }
  const { item, branch } = picked;
  const short = shortTitle(item.title);
  const slug = slugify(short);
  console.log(`Task:   ${item.title}\nTitle:  ${short}\nBranch: ${branch}`);

  // 3. Fresh branch. `-B` creates lab/<slug> when it's new and hard-resets it to
  //    the current HEAD (main) if an earlier run left it behind, so re-running the
  //    same task reuses the name cleanly instead of crashing on "branch exists".
  sh('git', ['checkout', '-B', branch]);

  // 4. Run the machine
  let report;
  if (DRY) {
    console.log('[dry-run] would invoke: claude -p <prompt> --dangerously-skip-permissions');
    report = { status: 'done', summary: '(dry-run)', tags: ['engine'], body: '(dry-run)' };
  } else {
    if (existsSync(REPORT)) rmSync(REPORT);
    try {
      execFileSync('claude', ['-p', buildPrompt(item.title), '--dangerously-skip-permissions'],
        { cwd: REPO_DIR, stdio: 'inherit' });
    } catch (err) {
      throw new Error(`claude exited with an error (${err.message})`);
    }

    // 5. Read the machine's report
    if (!existsSync(REPORT)) {
      throw new Error(`no cycle report was written to ${REPORT}`);
    }
    try {
      report = parseCycleReport(readFileSync(REPORT, 'utf8'));
    } catch (err) {
      throw new Error(`could not parse the cycle report (${err.message})`);
    }
  }

  // 5b. Independent verify gate — the runner re-runs the checks itself instead
  // of trusting the machine's self-report, so broken work can never ship as
  // "done". Any failing gate overrides the status to "flagged".
  let gateFailed = false;
  if (!DRY) {
    const testsPassed = gate('npm', ['test']);
    const checkPassed = gate('npm', ['run', 'check']);
    gateFailed = !testsPassed || !checkPassed;
    const resolved = resolveStatus(report.status, testsPassed, checkPassed);
    if (resolved !== report.status) {
      const failed = [!testsPassed && 'npm test', !checkPassed && 'npm run check'].filter(Boolean).join(' and ');
      console.error(`Verify gate failed (${failed}) — overriding cycle status "${report.status}" -> "flagged".`);
    }
    report.status = resolved;
  }

  // 6. Render the Lab entry + check off the backlog item. The runner's own cycles
  // are factual machine-log posts, so they render as the default 'experiment' type;
  // the direct-vs-review gate (draftForType) then decides whether the entry ships
  // live or waits for review. experiment/monitor publish direct; a briefing- or
  // opinion-typed entry would be stamped draft:true for Wolf to read first.
  //
  // EXCEPTION — no duplicate entries: some tasks publish their OWN curated Lab
  // writeup (a tool/experiment post with a "try it" link) as part of the work. If
  // the machine already added a src/content/lab/*.md this cycle, that entry is the
  // canonical one; adding the runner's generic build-log entry too would list the
  // same work twice in the feed (Cook Mode, then the Generative UI Canvas). Detect
  // any machine-authored entry and skip our render when present.
  const machineLabEntries = DRY
    ? []
    : newLabEntriesInStatus(sh('git', ['status', '--porcelain', '--', 'src/content/lab']));
  const date = new Date();
  const type = 'experiment';
  const entry = renderLabEntry({
    title: short,
    date,
    type,
    status: report.status,
    tags: report.tags.length ? report.tags : ['engine'],
    draft: draftForType(type),
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
  if (machineLabEntries.length) {
    console.log(`Machine published its own Lab entry (${machineLabEntries.join(', ')}) — skipping the generic build-log entry to avoid a duplicate.`);
  } else {
    writeFileSync(entryPath, entry);
  }
  if (existsSync(REPORT)) rmSync(REPORT);

  // 7. Commit, push, PR — as wolfazoid, then restore (see engine/publish.mjs).
  const prTitle = `${gateFailed ? '[FLAGGED] ' : ''}lab: ${short}`;
  const prBody = gateFailed
    ? `⚠️ The runner's independent verify gate failed (npm test / npm run check) — status overridden to \`flagged\` for review.\n\n${report.summary}`
    : report.summary;
  publishBranch({
    repoDir: REPO_DIR,
    branch,
    commitMsg: `lab: ${short}`,
    prTitle,
    prBody,
    ghUser: GH_USER,
    dry: DRY,
  });
  console.log('Cycle complete — PR opened for review.');
}

try {
  main();
} catch (err) {
  console.error(`Cycle failed: ${err.message}. Returning the working tree to a clean main so the loop can re-run.`);
  recoverToMain();
  process.exit(1);
}
