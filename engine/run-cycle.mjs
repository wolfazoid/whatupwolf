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
const PAUSED = join(ENGINE_DIR, 'PAUSED');
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

  // 1b. Kill switch — a PAUSED sentinel halts the loop. It is honoured whether
  // created locally (`touch engine/PAUSED`) or committed to main (e.g. from the
  // GitHub web UI on a phone), since the pull above brings a committed one down.
  if (!DRY && existsSync(PAUSED)) {
    console.log('Paused: engine/PAUSED is present — exiting without running a cycle. Remove it to resume.');
    return;
  }

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
      console.error(`Cycle failed: claude exited with an error (${err.message}). The work is on branch ${branch} for inspection; run \`git checkout main\` to abandon it.`);
      process.exit(1);
    }

    // 5. Read the machine's report
    if (!existsSync(REPORT)) {
      console.error(`Cycle failed: no cycle report was written to ${REPORT}. The work is on branch ${branch} for inspection; run \`git checkout main\` to abandon it.`);
      process.exit(1);
    }
    try {
      report = parseCycleReport(readFileSync(REPORT, 'utf8'));
    } catch (err) {
      console.error(`Cycle failed: ${err.message}. The work is on branch ${branch} for inspection; run \`git checkout main\` to abandon it.`);
      process.exit(1);
    }
  }

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

main();
