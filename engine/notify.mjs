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
// Look up the standing issue, tolerating a failed lookup differently by mode.
// Live: a lookup we cannot trust must abort the notice — guessing "no issue"
// would open a duplicate on every tick. Dry: nothing can be written anyway, so
// degrade to previewing a fresh issue rather than showing the operator nothing.
// (CI runs `npm test` with no GH_TOKEN, so the lookup genuinely does fail there.)
function lookupOrNull(repoDir, dry) {
  try {
    return { ok: true, issue: findIdleIssue(repoDir) };
  } catch (err) {
    if (!dry) {
      console.error(`Could not read existing issues (${err.message}) — skipping the idle notice.`);
      return { ok: false, issue: null };
    }
    console.log(`[dry-run] could not read existing issues (${err.message}) — previewing a fresh issue.`);
    return { ok: true, issue: null };
  }
}

export function notifyIdle({ repoDir, sweepDate, ideas = [], skipped = [], dry = false }) {
  const { ok, issue } = lookupOrNull(repoDir, dry);
  if (!ok) return;
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
  try {
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
// issue is open, which is the common case. Dry mode always logs, so a preview
// never leaves the operator wondering whether the step ran.
export function notifyBuilding({ repoDir, nowBuilding, dry = false }) {
  const { ok, issue } = lookupOrNull(repoDir, dry);
  if (!ok) return;
  if (!issue) {
    if (dry) console.log('[dry-run] no open idle issue to close.');
    return;
  }
  const body = `Back to work — building: ${nowBuilding}`;
  if (dry) {
    console.log(`[dry-run] would comment on and close issue #${issue.number}: ${body}`);
    return;
  }
  try {
    gh(['issue', 'close', String(issue.number), '--comment', body], repoDir);
    console.log(`Idle notice: closed issue #${issue.number}.`);
  } catch (err) {
    console.error(`Could not close the idle notice (${err.message}) — continuing.`);
  }
}
