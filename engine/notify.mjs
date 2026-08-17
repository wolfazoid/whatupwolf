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

// execFileSync's default maxBuffer is 1 MiB, and exceeding it throws ENOBUFS —
// which lookupOrNull below turns into a skipped notice, logged only to the
// gitignored cycle.log. That is exactly how the notifier went silent from
// 2026-08-11: the standing issue's comments reached 1,059,864 bytes, 11 KB past
// the default, and no signal left the box for a week. The read is windowed below
// so it stays small; this is the second line of defence, not the first.
const GH_MAX_BUFFER = 32 * 1024 * 1024;

const gh = (args, repoDir) =>
  execFileSync('gh', args, { cwd: repoDir, encoding: 'utf8', maxBuffer: GH_MAX_BUFFER }).trim();

// How far back to look for an already-posted marker. A notice is stamped with its
// sweep date and posted on the tick that sweep lands, so anything older than this
// window cannot be the sweep we are about to report — and bounding the lookback is
// what keeps this read from growing with the thread.
const MARKER_LOOKBACK_DAYS = 30;

// The open idle issue with its body and every comment body, or null if there isn't
// one. Read-only, so it runs for real even under --dry-run (nothing is mutated and
// the answer changes what dry-run reports) — same contract as run-cycle's
// branchHasPr. Throws on gh failure; the callers below turn that into a warning.
function findIdleIssue(repoDir, now = new Date()) {
  const out = gh(
    ['issue', 'list', '--state', 'open', '--limit', '100', '--json', 'number,title,body'],
    repoDir,
  );
  const issue = JSON.parse(out || '[]').find((i) => i.title === IDLE_ISSUE_TITLE);
  if (!issue) return null;
  // Bodies only, and only recent ones: `--jq` drops the author/reaction/URL
  // scaffolding GitHub returns per comment, and `since` drops the back catalogue.
  // Concatenated rather than split per comment — every caller only asks whether a
  // marker appears somewhere in the text, and joining can never split one.
  const since = new Date(now.getTime() - MARKER_LOOKBACK_DAYS * 86400000).toISOString();
  const recent = gh(
    ['api', `repos/{owner}/{repo}/issues/${issue.number}/comments?per_page=100&since=${since}`, '--jq', '.[].body'],
    repoDir,
  );
  return { number: issue.number, texts: [issue.body || '', recent || ''] };
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

// `sweepFailure` (`{ date, message }`) is set when the idle idea sweep threw. The
// notice still goes out — that is the whole point of reporting it — and the marker
// carries the failed day so it is not mistaken for the already-posted notice of the
// older sweep main still holds.
export function notifyIdle({ repoDir, sweepDate, ideas = [], skipped = [], sweepFailure = null, dry = false }) {
  const { ok, issue } = lookupOrNull(repoDir, dry);
  if (!ok) return;
  // Everything past this point — the idempotence check, the render, and the
  // write — is wrapped as one unit. `renderIdleNotice` is shared and has no
  // obligation to validate its inputs; the obligation to never throw belongs
  // to this module, for any caller, not just the one we happen to control.
  try {
    if (issue && sweepReported(issue.texts, sweepDate, sweepFailure?.date)) {
      const what = sweepFailure ? `the failed ${sweepFailure.date} sweep` : `sweep ${sweepDate || 'none'}`;
      console.log(`Idle notice: ${what} already reported on issue #${issue.number}.`);
      return;
    }
    const body = renderIdleNotice({ sweepDate, ideas, skipped, sweepFailure });
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
// issue is open, which is the common case. Dry mode always logs, so a preview
// never leaves the operator wondering whether the step ran.
export function notifyBuilding({ repoDir, nowBuilding, dry = false }) {
  const { ok, issue } = lookupOrNull(repoDir, dry);
  if (!ok) return;
  // Same reasoning as notifyIdle: everything past the lookup is one unit, so
  // this entry point can't throw regardless of what a future caller passes in.
  try {
    if (!issue) {
      if (dry) console.log('[dry-run] no open idle issue to close.');
      return;
    }
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
