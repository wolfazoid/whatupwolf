#!/usr/bin/env node
// Runs ONE experiment: invoke headless Claude Code with an experiment prompt, then
// render a Lab entry and open a PR. This is the research loop, separate from the
// self-building coding loop (run-cycle.mjs); it shares the same kill-switch,
// main-sync, and publishBranch machinery. Unlike a cycle, an experiment is NOT a
// backlog item — nothing is checked off.
//
// Two `kind`s of experiment run through the same spine and differ only in the
// middle — how the report is produced and how it becomes a public entry:
//
//   digest  — the machine researches from sources and writes a flat report; the
//             whole report is public and renders directly.
//   monitor — a deterministic probe collects the facts first, the machine only
//             judges them, and it writes a PRIVATE two-block report. The private
//             half is archived to engine/reports/ (gitignored, never published)
//             and only the curated `public` block ships, through the fail-closed
//             sanitizer. Nothing renders unless sanitize() clears it.
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync, rmSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
  renderLabEntry, parseCycleReport, parsePrivateReport, publicEntryFromReport,
  draftForType, parseRemoteBranches, uniqueBranchName,
} from './lib.mjs';
import { sanitize } from '../src/lib/sanitize.core.mjs';
import { publishBranch } from './publish.mjs';

const ENGINE_DIR = dirname(fileURLToPath(import.meta.url));
const REPO_DIR = join(ENGINE_DIR, '..');
const EXPERIMENTS_DIR = join(ENGINE_DIR, 'experiments');
const REPORTS_DIR = join(ENGINE_DIR, 'reports');
const REPORT = join(ENGINE_DIR, '.experiment-report.json');
const PAUSED = join(ENGINE_DIR, 'PAUSED');
const GH_USER = 'wolfazoid';
const DRY = process.argv.includes('--dry-run');
const NAME = process.argv.slice(2).find((a) => !a.startsWith('--'));

// The experiment registry. Each experiment names a prompt file
// (engine/experiments/<name>.md), its `kind` (which pipeline runs it), the Lab
// entry `type` its report renders as, and the human-facing title prefix. A
// monitor also names the `target` its probe audits. Deliberately a small literal,
// not a framework — we extract a general runner only once 2–3 experiments exist
// to shape it (YAGNI).
//
// `cadence` is the optional word the run date is introduced by in the title
// ("Agent Weekly — week of 2026-07-20"). It exists because the title template
// used to hardcode "week of", which reads wrong for anything that isn't weekly:
// a one-shot sprint omits it and titles as "<prefix> — <date>".
const EXPERIMENTS = {
  'agent-weekly': { kind: 'digest', type: 'digest', titlePrefix: 'Agent Weekly', cadence: 'week of' },
  'site-health': {
    kind: 'monitor',
    type: 'monitor',
    titlePrefix: 'Site Health',
    cadence: 'week of',
    target: 'https://whatupwolf.com',
  },
  // One-shot: run by hand, not on cron. Renders as `type: briefing`, which
  // draftForType() gates behind draft:true — Wolf's review of the ranked
  // prototype shortlist IS the publishing gate.
  'interaction-landscape': { kind: 'digest', type: 'briefing', titlePrefix: 'Interaction Landscape' },
};

// "Agent Weekly — week of 2026-07-20" for a cadenced experiment;
// "Interaction Landscape — 2026-07-20" for a one-shot.
function experimentTitle(cfg, day) {
  return `${cfg.titlePrefix} — ${cfg.cadence ? `${cfg.cadence} ${day}` : day}`;
}

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

// Invokes headless Claude Code with an experiment prompt and returns the raw text
// of the report it wrote. `extra` is appended to the prompt — a monitor uses it to
// hand over the probe Findings, so the machine judges facts it did not collect.
// The stale report is removed first so a crashed run can't be read as a fresh one.
function runClaude(promptPath, extra = '') {
  if (existsSync(REPORT)) rmSync(REPORT);
  try {
    execFileSync('claude', ['-p', buildPrompt(promptPath) + extra, '--dangerously-skip-permissions'],
      { cwd: REPO_DIR, stdio: 'inherit' });
  } catch (err) {
    throw new Error(`claude exited with an error (${err.message})`);
  }
  if (!existsSync(REPORT)) {
    throw new Error(`no experiment report was written to ${REPORT}`);
  }
  return readFileSync(REPORT, 'utf8');
}

// A synthetic private report for --dry-run: exercises the real sanitizer against a
// registered secret it does not leak, so the preview proves the rail is wired up
// rather than bypassing it.
function dryRunPrivateReport(title) {
  return {
    status: 'done',
    meta: { urls: ['https://example.invalid'], secrets: ['/a-route'] },
    findings: '(dry-run) The private half — never published, archived to engine/reports/.',
    public: {
      title,
      summary: '(dry-run) An automated sweep of a monitored property completed with no issues flagged.',
      body: '## What ran\n\n(dry-run) An automated weekly sweep: availability, response time, SSL, links, security headers.\n\n## Result\n\n(dry-run) All key routes healthy, no broken links, SSL valid well beyond the threshold.\n\nFull detail lives in the private report.',
      tags: ['monitoring'],
    },
  };
}

async function main() {
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

  // 3. Fresh branch, dated so each run gets its own. `-B` recreates a leftover local
  // branch cleanly off main instead of crashing on "branch already exists".
  //
  // A *remote* branch of the same name is the harder case: a second run on the same
  // day would push a branch built fresh off main onto one that already has the first
  // run's commit, and git rejects the non-fast-forward — the cycle dies at publish
  // time, after the research has already been paid for. So we ask the remote which
  // names are taken and step to the next free one (`…-2`, `…-3`), rather than
  // force-pushing: the first run's branch may already have an open PR, and rewriting
  // it would change what a reviewer is mid-way through reading. The Lab entry
  // filename carries the same suffix, so two same-day runs don't collide on the
  // content path either. In --dry-run nothing shells out, so this resolves to the
  // plain dated name.
  const date = new Date();
  const day = date.toISOString().slice(0, 10);
  const base = `lab/${NAME}-${day}`;
  const branch = uniqueBranchName(base, parseRemoteBranches(sh('git', ['ls-remote', '--heads', 'origin', `${base}*`])));
  const suffix = branch.slice(base.length); // '' on a first run, '-2' on a same-day re-run
  console.log(`Experiment: ${NAME}\nBranch:     ${branch}`);
  if (suffix) console.log(`(${base} already exists on the remote — using ${branch} instead.)`);
  sh('git', ['checkout', '-B', branch]);

  // 4–6. Produce the report and render the entry. The two kinds diverge here and
  // rejoin at publish: each sets `entry` (the Lab markdown), `status`, and
  // `summary` (the PR body), plus whatever it needs to archive.
  const title = experimentTitle(cfg, day);
  const entryPath = join(REPO_DIR, 'src', 'content', 'lab', `${day}-${NAME}${suffix}.md`);
  let entry;
  let status;
  let summary;
  let archive = null; // [path, contents] for the private half, monitors only

  if (cfg.kind === 'monitor') {
    // 4m. Measure first. The probe collects hard facts and never interprets them;
    // the machine is the judgment layer and sees nothing but these Findings, which
    // is what keeps its numbers honest. In --dry-run we skip the probe entirely —
    // it makes real network requests, and the preview must have no side effects.
    let report;
    if (DRY) {
      console.log(`[dry-run] would probe ${cfg.target} and invoke: claude -p <prompt + Findings>`);
      report = dryRunPrivateReport(title);
    } else {
      const { probe } = await import(`./probes/${NAME}.mjs`);
      const findings = await probe(cfg.target);
      const extra = `\n\n## Findings\n\nTarget: ${cfg.target}\n\n\`\`\`json\n${JSON.stringify(findings, null, 2)}\n\`\`\`\n`;
      try {
        report = parsePrivateReport(runClaude(promptPath, extra));
      } catch (err) {
        throw new Error(`could not parse the private report (${err.message})`);
      }
      // 5m. Archive the private half beside the run. engine/reports/ is gitignored,
      // so the specifics stay on the machine and never reach a branch.
      archive = [join(REPORTS_DIR, `${day}${suffix}.json`), JSON.stringify(report, null, 2) + '\n'];
    }

    // 6m. Sanitize, then render. publicEntryFromReport emits ONLY the curated
    // `public` block and rescans it against every registered secret — a leak
    // throws SanitizationError here and nothing is written. Fail-closed: we
    // deliberately do not catch it.
    status = report.status;
    summary = report.public.summary;
    entry = publicEntryFromReport(report, { sanitize, date, status, type: cfg.type });
  } else {
    // 4d. Run the machine — it researches and writes engine/.experiment-report.json.
    let report;
    if (DRY) {
      console.log('[dry-run] would invoke: claude -p <prompt> --dangerously-skip-permissions');
      report = {
        status: 'done',
        summary: `(dry-run) ${cfg.titlePrefix} — synthetic ${cfg.type} preview.`,
        tags: [cfg.type],
        body: '(dry-run) One-line intro.\n\n**Example item** — what it is · why it matters · https://example.com',
      };
    } else {
      try {
        report = parseCycleReport(runClaude(promptPath));
      } catch (err) {
        throw new Error(`could not parse the experiment report (${err.message})`);
      }
    }

    // 6d. Render the Lab entry. draftForType decides the gate from the entry
    // `type`: a `digest` is a factual machine-log post and publishes direct,
    // while a `briefing` carries a point of view and lands as a draft for Wolf.
    status = report.status;
    summary = report.summary;
    entry = renderLabEntry({
      title,
      date,
      type: cfg.type,
      status,
      tags: report.tags.length ? report.tags : ['digest'],
      draft: draftForType(cfg.type),
      summary,
      body: report.body,
    });
  }

  if (DRY) {
    console.log(`[dry-run] would write ${entryPath}`);
    console.log('----- Lab entry preview -----\n' + entry);
    return;
  }

  writeFileSync(entryPath, entry);
  if (archive) {
    mkdirSync(REPORTS_DIR, { recursive: true });
    writeFileSync(archive[0], archive[1]);
    console.log(`Private report archived to ${archive[0]} (gitignored).`);
  }
  if (existsSync(REPORT)) rmSync(REPORT);

  // 7. Commit, push, PR — as wolfazoid, then restore (see engine/publish.mjs).
  // No backlog check-off: experiments are not backlog items.
  publishBranch({
    repoDir: REPO_DIR,
    branch,
    commitMsg: `lab: ${title}`,
    prTitle: `lab: ${title}`,
    prBody: summary,
    ghUser: GH_USER,
    dry: DRY,
  });
  console.log('Experiment complete — PR opened.');
}

try {
  await main();
} catch (err) {
  console.error(`Experiment failed: ${err.message}. Returning the working tree to a clean main so the loop can re-run.`);
  recoverToMain();
  process.exit(1);
}
