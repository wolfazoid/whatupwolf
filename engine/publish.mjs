// Commit / push / PR machinery for one lab-engine cycle, extracted from
// run-cycle.mjs so it can be reused. The one side-effectful step of a cycle:
// stage the branch, commit, push, and open a PR as the push-capable gh account,
// then restore whatever account was active before.
import { execFileSync } from 'node:child_process';
import { parseActiveGhAccount } from './lib.mjs';

// Reads the currently-active gh account. gh 2.45 dropped `gh auth status --active`,
// so we run plain `gh auth status` and parse the active account out of the full
// listing (see parseActiveGhAccount). gh exits non-zero when logged out; some
// versions print the listing to stderr, so fall back to the captured stderr on error.
export function currentGhUser() {
  try {
    const out = execFileSync('gh', ['auth', 'status'],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
    return parseActiveGhAccount(out);
  } catch (err) {
    return parseActiveGhAccount(err?.stdout || err?.stderr || '');
  }
}

// Commit the working tree on `branch`, push it, and open a PR — all as `ghUser`
// (the default account here has no push access), then restore the previously
// active gh account. If the prior account can't be identified, we leave gh as
// `ghUser` and print a loud warning rather than switching silently.
//
// `dry: true` makes this a pure no-op: every shell-out is logged and skipped,
// gh auth is never read or switched, and the restore/warning branch is bypassed —
// so it has zero side effects, matching run-cycle.mjs's --dry-run contract.
export function publishBranch({ repoDir, branch, commitMsg, prTitle, prBody, ghUser, dry = false }) {
  const sh = (cmd, args) => {
    if (dry) { console.log(`[dry-run] ${cmd} ${args.join(' ')}`); return ''; }
    return execFileSync(cmd, args, { cwd: repoDir, encoding: 'utf8' }).trim();
  };

  const prevUser = dry ? '' : currentGhUser();
  sh('gh', ['auth', 'switch', '--user', ghUser]);
  try {
    sh('git', ['add', '-A']);
    sh('git', ['commit', '-m', commitMsg]);
    sh('git', ['push', '-u', 'origin', branch]);
    sh('gh', ['pr', 'create', '--title', prTitle, '--body', prBody, '--head', branch, '--base', 'main']);
  } finally {
    if (!dry) {
      if (prevUser && prevUser !== ghUser) {
        sh('gh', ['auth', 'switch', '--user', prevUser]);
      } else if (!prevUser) {
        console.error('');
        console.error('*'.repeat(70));
        console.error('WARNING: could not determine the previous gh account.');
        console.error(`The gh CLI is currently left authenticated as "${ghUser}".`);
        console.error(`To restore your account manually, run: gh auth switch --user <account>`);
        console.error('*'.repeat(70));
        console.error('');
      }
    }
  }
}
