#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
  parseBacklog, pickNextItem, markItemDone, slugify, renderLabEntry, parseCycleReport,
  resolveStatus, parseActiveGhAccount, shortTitle,
} from './lib.mjs';

const ENGINE_DIR = dirname(fileURLToPath(import.meta.url));
const REPO_DIR = join(ENGINE_DIR, '..');
const BACKLOG = join(ENGINE_DIR, 'BACKLOG.md');
const CYCLE = join(ENGINE_DIR, 'CYCLE.md');
const REPORT = join(ENGINE_DIR, '.cycle-report.json');
const PAUSED = join(ENGINE_DIR, 'PAUSED');
const GH_USER = 'wolfazoid';
const DRY = process.argv.includes('--dry-run');

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

function currentGhUser() {
  // gh 2.45 dropped `gh auth status --active`, so we run plain `gh auth status`
  // and parse the active account out of the full listing (see parseActiveGhAccount).
  // gh exits non-zero when logged out; some versions print the listing to stderr,
  // so fall back to the captured stderr on error.
  try {
    const out = execFileSync('gh', ['auth', 'status'],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
    return parseActiveGhAccount(out);
  } catch (err) {
    return parseActiveGhAccount(err?.stdout || err?.stderr || '');
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

  // 1. Sync main
  sh('git', ['checkout', 'main']);
  sh('git', ['pull', '--ff-only', 'origin', 'main']);

  // 1b. Re-check after pull — also catches a PAUSED committed to main (e.g. created
  // from the GitHub web UI on a phone), which the pull above brings down.
  if (!DRY && existsSync(PAUSED)) {
    console.log('Paused: engine/PAUSED present on main — exiting without running a cycle. Remove it to resume.');
    return;
  }

  // 2. Pick the task
  const backlogMd = readFileSync(BACKLOG, 'utf8');
  const item = pickNextItem(parseBacklog(backlogMd));
  if (!item) { console.log('Backlog empty — nothing to do.'); return; }
  const short = shortTitle(item.title);
  const slug = slugify(short);
  const branch = `lab/${slug}`;
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

  // 6. Render the Lab entry + check off the backlog item
  const date = new Date();
  const entry = renderLabEntry({
    title: short,
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
    sh('git', ['commit', '-m', `lab: ${short}`]);
    sh('git', ['push', '-u', 'origin', branch]);
    const prTitle = `${gateFailed ? '[FLAGGED] ' : ''}lab: ${short}`;
    const prBody = gateFailed
      ? `⚠️ The runner's independent verify gate failed (npm test / npm run check) — status overridden to \`flagged\` for review.\n\n${report.summary}`
      : report.summary;
    sh('gh', ['pr', 'create', '--title', prTitle, '--body', prBody, '--head', branch, '--base', 'main']);
  } finally {
    if (prevUser && prevUser !== GH_USER) {
      sh('gh', ['auth', 'switch', '--user', prevUser]);
    } else if (!prevUser) {
      console.error('');
      console.error('*'.repeat(70));
      console.error('WARNING: could not determine the previous gh account.');
      console.error(`The gh CLI is currently left authenticated as "${GH_USER}".`);
      console.error(`To restore your account manually, run: gh auth switch --user <account>`);
      console.error('*'.repeat(70));
      console.error('');
    }
  }
  console.log('Cycle complete — PR opened for review.');
}

try {
  main();
} catch (err) {
  console.error(`Cycle failed: ${err.message}. Returning the working tree to a clean main so the loop can re-run.`);
  recoverToMain();
  process.exit(1);
}
