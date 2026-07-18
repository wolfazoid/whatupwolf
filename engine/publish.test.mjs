import { describe, it, expect, vi, afterEach } from 'vitest';
import { publishBranch } from './publish.mjs';

describe('publishBranch (dry mode)', () => {
  afterEach(() => vi.restoreAllMocks());

  it('logs the intended git/gh commands and has zero side effects', () => {
    const logs = [];
    const errs = [];
    vi.spyOn(console, 'log').mockImplementation((m) => logs.push(String(m)));
    vi.spyOn(console, 'error').mockImplementation((m) => errs.push(String(m)));

    publishBranch({
      repoDir: '/tmp/repo',
      branch: 'lab/example',
      commitMsg: 'lab: Example',
      prTitle: 'lab: Example',
      prBody: 'A one-line summary.',
      ghUser: 'wolfazoid',
      dry: true,
    });

    // Every shell-out is logged with the [dry-run] prefix, in order.
    expect(logs).toEqual([
      '[dry-run] gh auth switch --user wolfazoid',
      '[dry-run] git add -A',
      '[dry-run] git commit -m lab: Example',
      '[dry-run] git push -u origin lab/example',
      '[dry-run] gh pr create --title lab: Example --body A one-line summary. --head lab/example --base main',
    ]);
    // The account-restore / warning branch is bypassed entirely in dry mode:
    // nothing was switched, so there is nothing to restore and no warning to print.
    expect(errs).toEqual([]);
  });
});
