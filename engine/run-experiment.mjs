#!/usr/bin/env node
// Runs ONE experiment: invoke headless Claude Code with an experiment prompt to
// research + write a digest report, then render a Lab entry and open a PR. This is
// the research loop, separate from the self-building coding loop (run-cycle.mjs);
// it shares the same kill-switch, main-sync, and publishBranch machinery. Unlike a
// cycle, an experiment is NOT a backlog item — nothing is checked off.
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { renderLabEntry, parseCycleReport, draftForType } from './lib.mjs';
import { publishBranch } from './publish.mjs';

const ENGINE_DIR = dirname(fileURLToPath(import.meta.url));
const REPO_DIR = join(ENGINE_DIR, '..');
const EXPERIMENTS_DIR = join(ENGINE_DIR, 'experiments');
const REPORT = join(ENGINE_DIR, '.experiment-report.json');
const PAUSED = join(ENGINE_DIR, 'PAUSED');
const GH_USER = 'wolfazoid';
const DRY = process.argv.includes('--dry-run');
const NAME = process.argv.slice(2).find((a) => !a.startsWith('--'));

// The experiment registry. Each experiment names a prompt file
// (engine/experiments/<name>.md), the Lab entry `type` its report renders as, and
// the human-facing title prefix. Deliberately a small literal, not a framework —
// we extract a general runner only once 2–3 experiments exist to shape it (YAGNI).
const EXPERIMENTS = {
  'agent-weekly': { type: 'digest', titlePrefix: 'Agent Weekly' },
};

function sh(cmd, args) {
  if (DRY) { console.log(`[dry-run] ${cmd} ${args.join(' ')}`); return ''; }
  return execFileSync(cmd, args, { cwd: REPO_DIR, encoding: 'utf8' }).trim();
}

// Returns the working tree to a clean main after a failed run, so a scheduled loop
// stays re-runnable from a known-good state instead of a half-finished branch. `-f`
// drops uncommitted edits (nothing is ever committed here, so nothing durable is
// lost) and `git clean -fd` removes stray files. Both respect .gitignore, so PAUSED,
// experiment.log, node_modules, and .env survive.
function recoverToMain() {
  if (DRY) return;
  try {
    sh('git', ['checkout', '-f', 'main']);
    sh('git', ['clean', '-fd']);
  } catch (err) {
    console.error(`Recovery: could not fully reset to main (${err.message}). Check the working tree by hand.`);
  }
}

function buildPrompt(promptPath) {
  return readFileSync(promptPath, 'utf8');
}

function main() {
  // 0. Resolve the experiment before touching git/network, so an unknown name fails
  // fast and cheap.
  if (!NAME) {
    throw new Error(`usage: node engine/run-experiment.mjs <name> [--dry-run] (known: ${Object.keys(EXPERIMENTS).join(', ')})`);
  }
  const cfg = EXPERIMENTS[NAME];
  if (!cfg) {
    throw new Error(`unknown experiment "${NAME}" (known: ${Object.keys(EXPERIMENTS).join(', ')})`);
  }
  const promptPath = join(EXPERIMENTS_DIR, `${NAME}.md`);
  if (!existsSync(promptPath)) {
    throw new Error(`no prompt file at ${promptPath}`);
  }

  // 1. Kill switch (local, instant) — checked before any git/network work, so a
  // `touch engine/PAUSED` (or `npm run pause`) stops the loop even if git is hung.
  if (!DRY && existsSync(PAUSED)) {
    console.log('Paused: engine/PAUSED is present — exiting immediately. `npm run resume` to resume.');
    return;
  }

  // 2. Sync main
  sh('git', ['checkout', 'main']);
  sh('git', ['pull', '--ff-only', 'origin', 'main']);

  // 2b. Re-check after pull — also catches a PAUSED committed to main (e.g. from the
  // GitHub web UI on a phone), which the pull above brings down.
  if (!DRY && existsSync(PAUSED)) {
    console.log('Paused: engine/PAUSED present on main — exiting without running the experiment. Remove it to resume.');
    return;
  }

  // 3. Fresh branch, dated so each run gets its own. `-B` recreates a leftover branch
  // cleanly off main instead of crashing on "branch already exists".
  const date = new Date();
  const day = date.toISOString().slice(0, 10);
  const branch = `lab/${NAME}-${day}`;
  console.log(`Experiment: ${NAME}\nBranch:     ${branch}`);
  sh('git', ['checkout', '-B', branch]);

  // 4. Run the machine — it researches and writes engine/.experiment-report.json.
  let report;
  if (DRY) {
    console.log('[dry-run] would invoke: claude -p <prompt> --dangerously-skip-permissions');
    report = {
      status: 'done',
      summary: '(dry-run) Agent Weekly — synthetic digest preview.',
      tags: ['agents', 'digest'],
      body: '(dry-run) One-line intro.\n\n**Example item** — what it is · why it matters · https://example.com',
    };
  } else {
    if (existsSync(REPORT)) rmSync(REPORT);
    try {
      execFileSync('claude', ['-p', buildPrompt(promptPath), '--dangerously-skip-permissions'],
        { cwd: REPO_DIR, stdio: 'inherit' });
    } catch (err) {
      throw new Error(`claude exited with an error (${err.message})`);
    }

    // 5. Read the machine's report
    if (!existsSync(REPORT)) {
      throw new Error(`no experiment report was written to ${REPORT}`);
    }
    try {
      report = parseCycleReport(readFileSync(REPORT, 'utf8'));
    } catch (err) {
      throw new Error(`could not parse the experiment report (${err.message})`);
    }
  }

  // 6. Render the Lab entry. Digests are factual machine-log posts, so draftForType
  // returns false and they publish direct (no human review gate).
  const title = `${cfg.titlePrefix} — week of ${day}`;
  const entry = renderLabEntry({
    title,
    date,
    type: cfg.type,
    status: report.status,
    tags: report.tags.length ? report.tags : ['digest'],
    draft: draftForType(cfg.type),
    summary: report.summary,
    body: report.body,
  });
  const entryPath = join(REPO_DIR, 'src', 'content', 'lab', `${day}-${NAME}.md`);

  if (DRY) {
    console.log(`[dry-run] would write ${entryPath}`);
    console.log('----- Lab entry preview -----\n' + entry);
    return;
  }

  writeFileSync(entryPath, entry);
  if (existsSync(REPORT)) rmSync(REPORT);

  // 7. Commit, push, PR — as wolfazoid, then restore (see engine/publish.mjs).
  // No backlog check-off: experiments are not backlog items.
  publishBranch({
    repoDir: REPO_DIR,
    branch,
    commitMsg: `lab: ${title}`,
    prTitle: `lab: ${title}`,
    prBody: report.summary,
    ghUser: GH_USER,
    dry: DRY,
  });
  console.log('Experiment complete — PR opened.');
}

try {
  main();
} catch (err) {
  console.error(`Experiment failed: ${err.message}. Returning the working tree to a clean main so the loop can re-run.`);
  recoverToMain();
  process.exit(1);
}
