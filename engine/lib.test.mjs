import { describe, it, expect } from 'vitest';
import { parseBacklog, pickNextItem, markItemDone } from './lib.mjs';
import { slugify, renderLabEntry, parseCycleReport, parsePrivateReport, resolveStatus, draftForType } from './lib.mjs';
import { newLabEntriesInStatus } from './lib.mjs';
import { parseActiveGhAccount, shortTitle, publicEntryFromReport } from './lib.mjs';
import { parseRemoteBranches, uniqueBranchName } from './lib.mjs';
import { branchForItem, pickBuildableItem, prListArgs, partitionBuildable } from './lib.mjs';
import { lockIsFree, runLocked } from './lib.mjs';
import { latestIdeaDate, ideasBranch, parseIdeas, idleMarker, sweepReported, IDLE_ISSUE_TITLE, renderIdleNotice } from './lib.mjs';
import { localDay, localStamp, boxTimeZone } from './lib.mjs';
import { sanitize, SanitizationError } from '../src/lib/sanitize';

describe('shortTitle', () => {
  it('takes the lead clause before a colon separator', () => {
    expect(shortTitle('Fix currentGhUser() in run-cycle for gh 2.45: do not use --active'))
      .toBe('Fix currentGhUser() in run-cycle for gh 2.45');
  });
  it('takes the lead clause before a spaced em-dash', () => {
    expect(shortTitle('Build the sanitization filter — implement src/lib/sanitize.ts'))
      .toBe('Build the sanitization filter');
  });
  it('caps length with an ellipsis', () => {
    const out = shortTitle('a'.repeat(100));
    expect(out.length).toBeLessThanOrEqual(72);
    expect(out.endsWith('…')).toBe(true);
  });
  it('leaves an already-short title unchanged', () => {
    expect(shortTitle('Quote unsafe tags in renderLabEntry')).toBe('Quote unsafe tags in renderLabEntry');
  });
});

const SAMPLE = `# Engine Backlog

- [ ] Build the sanitization filter
- [ ] Build the experiment-runner framework
- [x] Bootstrap the loop
`;

describe('parseBacklog', () => {
  it('parses checkbox items with their done state', () => {
    const items = parseBacklog(SAMPLE);
    expect(items).toHaveLength(3);
    expect(items[0]).toMatchObject({ title: 'Build the sanitization filter', done: false });
    expect(items[2]).toMatchObject({ title: 'Bootstrap the loop', done: true });
  });
  it('ignores non-item lines', () => {
    expect(parseBacklog('# Heading\n\nsome prose')).toEqual([]);
  });
});

describe('pickNextItem', () => {
  it('returns the first unchecked item', () => {
    expect(pickNextItem(parseBacklog(SAMPLE)).title).toBe('Build the sanitization filter');
  });
  it('returns null when everything is done', () => {
    expect(pickNextItem(parseBacklog('- [x] done'))).toBeNull();
  });
});

describe('markItemDone', () => {
  it('flips the matching unchecked item to checked', () => {
    const out = markItemDone(SAMPLE, 'Build the sanitization filter');
    expect(out).toContain('- [x] Build the sanitization filter');
    // leaves the other unchecked item alone
    expect(out).toContain('- [ ] Build the experiment-runner framework');
  });
});

describe('slugify', () => {
  it('lowercases and hyphenates', () => {
    expect(slugify('Build the sanitization filter')).toBe('build-the-sanitization-filter');
  });
  it('trims stray hyphens and caps length', () => {
    expect(slugify('  Hello, World!  ')).toBe('hello-world');
    expect(slugify('x'.repeat(80)).length).toBeLessThanOrEqual(60);
  });
});

// The box runs America/Chicago, so a UTC day rolls over at 19:00 local: every cycle
// after that stamped tomorrow's date. Confirmed live — at 21:00 CDT on 2026-07-28 the
// loop opened `lab/ideas-2026-07-29` and PR #59 "idea sweep — 2026-07-29". Both sides
// of that boundary are pinned here against fixed instants.
describe('localDay', () => {
  const CHICAGO = 'America/Chicago';

  it('returns the local day, not the UTC day, after the 19:00 CDT rollover', () => {
    // 21:00 CDT on the 28th — UTC has already ticked over to the 29th.
    expect(localDay(new Date('2026-07-29T02:00:00Z'), CHICAGO)).toBe('2026-07-28');
  });
  it('agrees with UTC before the rollover', () => {
    expect(localDay(new Date('2026-07-28T18:00:00Z'), CHICAGO)).toBe('2026-07-28'); // 13:00 CDT
  });
  it('is exact at the boundary instants', () => {
    // 23:59:59 local on the 28th is still the 28th; one second later is the 29th.
    expect(localDay(new Date('2026-07-29T04:59:59Z'), CHICAGO)).toBe('2026-07-28');
    expect(localDay(new Date('2026-07-29T05:00:00Z'), CHICAGO)).toBe('2026-07-29');
  });
  it('honours a standard-time (UTC−6) offset outside DST', () => {
    // 18:30 CST on 2026-01-15; UTC is already on the 16th.
    expect(localDay(new Date('2026-01-16T00:30:00Z'), CHICAGO)).toBe('2026-01-15');
  });
  it('handles zones east of UTC, where local runs ahead', () => {
    expect(localDay(new Date('2026-07-28T23:00:00Z'), 'Asia/Tokyo')).toBe('2026-07-29');
  });
  it('is the UTC day when asked for UTC', () => {
    expect(localDay(new Date('2026-07-29T02:00:00Z'), 'UTC')).toBe('2026-07-29');
  });
  it('zero-pads single-digit months and days', () => {
    expect(localDay(new Date('2026-03-05T18:00:00Z'), CHICAGO)).toBe('2026-03-05');
  });
  it('defaults to the box zone', () => {
    const d = new Date('2026-07-29T02:00:00Z');
    expect(localDay(d)).toBe(localDay(d, boxTimeZone()));
  });
});

describe('localStamp', () => {
  it('keeps the frontmatter shape but in local wall-clock time', () => {
    expect(localStamp(new Date('2026-07-29T02:00:00Z'), 'America/Chicago')).toBe('2026-07-28T21:00');
  });
  it('renders local midnight as 00:00 on the new day, never 24:00', () => {
    const midnight = localStamp(new Date('2026-07-29T05:00:00Z'), 'America/Chicago');
    expect(midnight).toBe('2026-07-29T00:00');
  });
  it('shares its day with localDay', () => {
    const d = new Date('2026-07-29T02:00:00Z');
    expect(localStamp(d, 'America/Chicago').slice(0, 10)).toBe(localDay(d, 'America/Chicago'));
  });
});

describe('renderLabEntry', () => {
  // timeZone is pinned so the assertions mean the same thing on the box (CDT) and in
  // CI (UTC); the runner leaves it unset and gets the box's zone.
  const entry = renderLabEntry({
    title: 'Build the sanitization filter',
    date: new Date('2026-07-18T14:30:00Z'),
    timeZone: 'UTC',
    status: 'done',
    tags: ['engine', 'sanitizer'],
    summary: 'The machine built the sanitizer.',
    body: 'Implemented allowlist + fail-closed scan.\n',
  });
  it('emits valid frontmatter with the existing schema fields', () => {
    expect(entry).toContain('type: experiment');
    expect(entry).toContain('date: 2026-07-18T14:30');
    expect(entry).toContain('status: done');
    expect(entry).toContain('tags: [engine, sanitizer]');
    expect(entry).toContain('live: true');
    expect(entry).toContain('draft: false');
    expect(entry).toContain('title: "Build the sanitization filter"');
  });
  it('stamps draft:true when the entry is gated for review', () => {
    const gated = renderLabEntry({
      title: 'Weekly briefing',
      date: new Date('2026-07-18T14:30:00Z'),
      type: 'briefing',
      status: 'done',
      draft: true,
      summary: 'A point-of-view briefing.',
      body: 'Prose.\n',
    });
    expect(gated).toContain('draft: true');
  });
  it('includes the body after the frontmatter', () => {
    expect(entry.trim().endsWith('Implemented allowlist + fail-closed scan.')).toBe(true);
  });

  // The `date:` field is the Lab feed's sort key. Stamped in UTC it read as tomorrow
  // for every entry written after 19:00 local, which sorted the entry above genuinely
  // newer ones. It now carries local wall-clock time for the given zone.
  it('stamps the date in the given zone, not UTC', () => {
    const evening = renderLabEntry({
      title: 'An entry written after 19:00 local',
      date: new Date('2026-07-29T02:00:00Z'), // 21:00 CDT on the 28th
      timeZone: 'America/Chicago',
      status: 'done',
      summary: 's',
      body: 'b',
    });
    expect(evening).toContain('date: 2026-07-28T21:00');
    expect(evening).not.toContain('2026-07-29');
  });

  it('YAML-escapes unsafe tag values while keeping safe tags bare', () => {
    const unsafeEntry = renderLabEntry({
      title: 'Build the sanitization filter',
      date: new Date('2026-07-18T14:30:00Z'),
      status: 'done',
      tags: ['engine', 'a,b', 'c: d'],
      summary: 'The machine built the sanitizer.',
      body: 'Implemented allowlist + fail-closed scan.\n',
    });
    const tagsLine = unsafeEntry.split('\n').find((l) => l.startsWith('tags:'));
    expect(tagsLine).toBe('tags: [engine, "a,b", "c: d"]');
    // Simple safe tag stays bare and unescaped.
    expect(tagsLine).toMatch(/\[engine, /);
    // Unsafe tags are quoted so they round-trip as single YAML string scalars
    // rather than splitting on the comma or parsing as a nested mapping.
    expect(tagsLine).toContain('"a,b"');
    expect(tagsLine).toContain('"c: d"');
    // The unescaped/bare forms — which would corrupt the YAML — must not appear.
    expect(unsafeEntry).not.toContain('[engine, a,b, c: d]');
    expect(unsafeEntry).not.toMatch(/tags: \[[^\]]*[^"]a,b[^"][^\]]*\]/);
  });

  it('quotes numeric and YAML-reserved-word tags so they stay strings', () => {
    const entry2 = renderLabEntry({
      title: 'Build the sanitization filter',
      date: new Date('2026-07-18T14:30:00Z'),
      status: 'done',
      tags: ['engine', '2026', 'true', 'False', 'null', 'yes', 'no', '~'],
      summary: 'The machine built the sanitizer.',
      body: 'Implemented allowlist + fail-closed scan.\n',
    });
    const tagsLine = entry2.split('\n').find((l) => l.startsWith('tags:'));
    // A purely-numeric tag would parse as a number if left bare — must be quoted.
    expect(tagsLine).toContain('"2026"');
    // Reserved words parse as booleans/null if bare — quote them (any case).
    expect(tagsLine).toContain('"true"');
    expect(tagsLine).toContain('"False"');
    expect(tagsLine).toContain('"null"');
    expect(tagsLine).toContain('"yes"');
    expect(tagsLine).toContain('"no"');
    expect(tagsLine).toContain('"~"');
    // An ordinary word stays bare.
    expect(tagsLine).toMatch(/^tags: \[engine, /);
    expect(tagsLine).toBe('tags: [engine, "2026", "true", "False", "null", "yes", "no", "~"]');
  });
});

describe('parseActiveGhAccount', () => {
  // gh 2.45 no longer supports `gh auth status --active`; we parse the full
  // status text instead. These samples mirror real gh 2.45 output.
  const SINGLE = `github.com
  ✓ Logged in to github.com account wolfazoid (keyring)
  - Active account: true
  - Git operations protocol: https
  - Token: gho_************************************
  - Token scopes: 'gist', 'read:org', 'repo', 'workflow'
`;

  const MULTI = `github.com
  ✓ Logged in to github.com account wolf-personal (keyring)
  - Active account: false
  - Git operations protocol: https
  - Token: gho_************************************
  - Token scopes: 'gist', 'read:org', 'repo', 'workflow'

  ✓ Logged in to github.com account wolfazoid (keyring)
  - Active account: true
  - Git operations protocol: https
  - Token: gho_************************************
  - Token scopes: 'gist', 'read:org', 'repo', 'workflow'
`;

  it('returns the single logged-in account marked active', () => {
    expect(parseActiveGhAccount(SINGLE)).toBe('wolfazoid');
  });
  it('returns the active account when several are logged in', () => {
    expect(parseActiveGhAccount(MULTI)).toBe('wolfazoid');
  });
  it('does not return a non-active account listed first', () => {
    expect(parseActiveGhAccount(MULTI)).not.toBe('wolf-personal');
  });
  it('returns "" when no account is marked active', () => {
    const none = `github.com
  ✓ Logged in to github.com account wolfazoid (keyring)
  - Active account: false
`;
    expect(parseActiveGhAccount(none)).toBe('');
  });
  it('returns "" for empty / logged-out output', () => {
    expect(parseActiveGhAccount('')).toBe('');
    expect(parseActiveGhAccount('You are not logged into any GitHub hosts.')).toBe('');
  });
  it('coerces non-string input to "" without throwing', () => {
    expect(parseActiveGhAccount(undefined)).toBe('');
  });
});

describe('publicEntryFromReport', () => {
  // A report whose curated public block is genuinely clean.
  const clean = {
    meta: { client: 'Acme Corp', urls: ['https://acme.example'], secrets: ['sk-live-123'] },
    findings: 'internal: regression on acme.example, traced with token sk-live-123',
    public: { title: 'Audit complete', summary: 'Improved LCP on a key template', tags: ['perf'] },
  };
  // A report that smuggles a registered secret (the client name) into a public field.
  const leaky = {
    meta: { client: 'Acme Corp', urls: ['https://acme.example'], secrets: ['sk-live-123'] },
    findings: 'internal detail',
    public: { title: 'Audit complete', summary: 'Improved LCP for Acme Corp', tags: ['perf'] },
  };
  const date = new Date('2026-07-18T14:30:00Z');

  it('sanitizes then renders a public lab entry for a clean report', () => {
    const entry = publicEntryFromReport(clean, { sanitize, date, timeZone: 'UTC', status: 'done' });
    expect(entry).toContain('title: "Audit complete"');
    expect(entry).toContain('summary: "Improved LCP on a key template"');
    expect(entry).toContain('status: done');
    expect(entry).toContain('tags: [perf]');
    expect(entry).toContain('date: 2026-07-18T14:30');
    // Fail-closed guarantee: no registered secret survives into the rendered entry.
    for (const secret of ['Acme Corp', 'acme.example', 'sk-live-123']) {
      expect(entry).not.toContain(secret);
    }
  });

  it('throws (fail-closed) when a registered secret leaks, emitting no entry', () => {
    expect(() => publicEntryFromReport(leaky, { sanitize, date })).toThrow(SanitizationError);
  });

  it('requires a sanitize function to be injected', () => {
    expect(() => publicEntryFromReport(clean, { date })).toThrow(TypeError);
  });
});

describe('parseCycleReport', () => {
  it('parses a well-formed report', () => {
    const r = parseCycleReport('{"status":"flagged","summary":"s","tags":["a"],"body":"b"}');
    expect(r).toEqual({ status: 'flagged', summary: 's', tags: ['a'], body: 'b' });
  });
  it('throws on a bad status', () => {
    expect(() => parseCycleReport('{"status":"weird"}')).toThrow();
  });
});

describe('parsePrivateReport', () => {
  const wellFormed = {
    status: 'flagged',
    meta: { urls: ['https://example.invalid/a'], secrets: ['/a-route'] },
    findings: 'the full private account',
    public: { title: 't', summary: 's', body: 'b', tags: ['monitoring'] },
  };
  const report = (over = {}) => JSON.stringify({ ...wellFormed, ...over });

  it('parses a well-formed private report', () => {
    expect(parsePrivateReport(report())).toEqual(wellFormed);
  });

  it('defaults meta and tags to empty arrays when absent', () => {
    const r = parsePrivateReport(report({ meta: undefined, public: { title: 't', summary: 's', body: 'b' } }));
    expect(r.meta).toEqual({ urls: [], secrets: [] });
    expect(r.public.tags).toEqual([]);
  });

  it('throws on a bad status', () => {
    expect(() => parsePrivateReport(report({ status: 'weird' }))).toThrow();
  });

  it('throws when the public block is missing', () => {
    expect(() => parsePrivateReport(report({ public: undefined }))).toThrow(/public/);
  });

  // A blank public field would render an empty entry rather than fail loudly.
  it('throws on an empty public field', () => {
    expect(() => parsePrivateReport(report({ public: { title: 't', summary: '  ', body: 'b' } })))
      .toThrow(/public.summary/);
  });

  // No findings means the private half is empty — the split the experiment exists
  // to prove never happened, so reject rather than publish half a report.
  it('throws when findings are missing', () => {
    expect(() => parsePrivateReport(report({ findings: '' }))).toThrow(/findings/);
  });
});

describe('resolveStatus', () => {
  it('keeps the machine-reported status when both gates pass', () => {
    expect(resolveStatus('done', true, true)).toBe('done');
    expect(resolveStatus('flagged', true, true)).toBe('flagged');
  });
  it('overrides to flagged when tests fail', () => {
    expect(resolveStatus('done', false, true)).toBe('flagged');
  });
  it('overrides to flagged when the check fails', () => {
    expect(resolveStatus('done', true, false)).toBe('flagged');
  });
  it('flags when both gates fail', () => {
    expect(resolveStatus('done', false, false)).toBe('flagged');
  });
});

describe('lockIsFree', () => {
  const alive = () => true; // probe: pid is running
  const dead = () => false; // probe: pid is gone (ESRCH)
  it('is free when the lockfile is missing (contents null)', () => {
    // The probe must not even be consulted — a missing file is unconditionally free.
    expect(lockIsFree(null, () => { throw new Error('probe should not run'); })).toBe(true);
  });
  it('is held when the recorded pid is a live process', () => {
    expect(lockIsFree('4321', alive)).toBe(false);
    expect(lockIsFree('4321\n', alive)).toBe(false); // trailing newline tolerated
  });
  it('is free when the recorded pid is stale (no longer running)', () => {
    expect(lockIsFree('4321', dead)).toBe(true);
  });
  it('is free when the contents are not a positive pid', () => {
    // A truncated / garbage lockfile must not wedge the loop forever.
    expect(lockIsFree('', alive)).toBe(true);
    expect(lockIsFree('   ', alive)).toBe(true);
    expect(lockIsFree('not-a-pid', alive)).toBe(true);
    expect(lockIsFree('0', alive)).toBe(true);
    expect(lockIsFree('-7', alive)).toBe(true);
  });
});

describe('runLocked', () => {
  // A fake lock + git pair that records the order things happened in. Recovery is
  // `git checkout -f main` + `git clean -fd`; if it runs after release(), another
  // tick can take the freed lock and have its untracked files cleaned out from
  // under it. So the assertion under test is an ORDER, not a set of calls.
  function harness({ acquired = true, run, recover } = {}) {
    const calls = [];
    return {
      calls,
      acquire: () => {
        calls.push('acquire');
        return acquired ? () => calls.push('release') : null;
      },
      run: run || (() => { calls.push('run'); }),
      recover: recover || (() => { calls.push('recover'); }),
      onBusy: () => calls.push('busy'),
      onFail: (err) => calls.push(`fail:${err.message}`),
    };
  }

  it('recovers BEFORE releasing the lock when the run throws', async () => {
    const h = harness({ run: () => { throw new Error('boom'); } });
    const outcome = await runLocked(h);
    expect(h.calls).toEqual(['acquire', 'fail:boom', 'recover', 'release']);
    expect(h.calls.indexOf('recover')).toBeLessThan(h.calls.indexOf('release'));
    expect(outcome.status).toBe('failed');
    expect(outcome.error.message).toBe('boom');
  });

  it('holds the lock across an async failure too', async () => {
    const h = harness({ run: async () => { await Promise.resolve(); throw new Error('late'); } });
    const outcome = await runLocked(h);
    expect(h.calls).toEqual(['acquire', 'fail:late', 'recover', 'release']);
    expect(outcome.status).toBe('failed');
  });

  it('releases without recovering on a clean run', async () => {
    const h = harness();
    const outcome = await runLocked(h);
    expect(h.calls).toEqual(['acquire', 'run', 'release']);
    expect(outcome).toEqual({ status: 'ok' });
  });

  it('does nothing but log when another run holds the lock', async () => {
    const h = harness({ acquired: false, run: () => { throw new Error('must not run'); } });
    const outcome = await runLocked(h);
    expect(h.calls).toEqual(['acquire', 'busy']);
    expect(outcome).toEqual({ status: 'busy' });
  });

  it('still releases the lock if recovery itself blows up', async () => {
    // recoverToMain swallows git errors, but the lock must not leak even if it stops.
    const h = harness({
      run: () => { throw new Error('boom'); },
      recover: () => { throw new Error('git is wedged'); },
    });
    await expect(runLocked(h)).rejects.toThrow('git is wedged');
    expect(h.calls).toEqual(['acquire', 'fail:boom', 'release']);
  });
});

describe('draftForType', () => {
  it('publishes monitor and experiment entries direct (draft:false)', () => {
    // Factual machine-log types — what ran, what changed, pass/fail — ship live.
    expect(draftForType('monitor')).toBe(false);
    expect(draftForType('experiment')).toBe(false);
  });
  it('publishes digest entries direct (draft:false)', () => {
    // Digests are factual roll-ups of what ran, so they ship live like other logs.
    expect(draftForType('digest')).toBe(false);
  });
  it('gates briefing- and opinion-style entries behind draft:true', () => {
    // These carry a point of view, so a human reviews before they go public.
    // The Interaction Landscape sprint renders as `briefing` precisely for this:
    // Wolf's review of its ranked prototype shortlist IS the publishing gate.
    expect(draftForType('briefing')).toBe(true);
    expect(draftForType('note')).toBe(true);
  });
  it('fails safe: an unknown type is gated, never published unreviewed', () => {
    expect(draftForType('essay')).toBe(true);
    expect(draftForType('')).toBe(true);
    expect(draftForType(undefined)).toBe(true);
  });
});

describe('parseRemoteBranches', () => {
  it('pulls branch names out of git ls-remote --heads output', () => {
    const out = [
      'a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0\trefs/heads/lab/agent-weekly-2026-07-18',
      'b1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0\trefs/heads/lab/agent-weekly-2026-07-18-2',
    ].join('\n');
    expect(parseRemoteBranches(out)).toEqual([
      'lab/agent-weekly-2026-07-18',
      'lab/agent-weekly-2026-07-18-2',
    ]);
  });
  it('returns [] for empty output — the no-remote-branch case', () => {
    // --dry-run's sh() returns '' without shelling out; that must read as "nothing taken".
    expect(parseRemoteBranches('')).toEqual([]);
  });
  it('ignores lines that are not refs/heads entries', () => {
    const out = 'warning: something\nc0ffee00\trefs/tags/v1\nc0ffee11\trefs/heads/main';
    expect(parseRemoteBranches(out)).toEqual(['main']);
  });
});

describe('branchForItem', () => {
  it('shortens then slugifies the backlog line into a lab/ branch', () => {
    expect(branchForItem('Build the sanitization filter — implement src/lib/sanitize.ts'))
      .toBe('lab/build-the-sanitization-filter');
  });
  it('matches the name the runner checks out for the same item', () => {
    const title = 'Close the Site Health security-header finding: gated public/_headers';
    expect(branchForItem(title)).toBe(`lab/${slugify(shortTitle(title))}`);
  });
});

describe('pickBuildableItem', () => {
  const items = parseBacklog(`
- [x] Bootstrap the loop
- [ ] Build the sanitization filter
- [ ] Build the experiment-runner framework
`);

  it('returns the first unchecked item and its branch when nothing is taken', () => {
    const next = pickBuildableItem(items, []);
    expect(next.item.title).toBe('Build the sanitization filter');
    expect(next.branch).toBe('lab/build-the-sanitization-filter');
  });

  it('skips an item whose branch already has a PR', () => {
    // The bug this fixes: a gated PR waiting on Wolf parked the loop on the same
    // item every cycle, rebuilding it and colliding on the branch name. "Taken"
    // now covers closed and merged PRs too — see the prListArgs tests below.
    const next = pickBuildableItem(items, ['lab/build-the-sanitization-filter']);
    expect(next.item.title).toBe('Build the experiment-runner framework');
    expect(next.branch).toBe('lab/build-the-experiment-runner-framework');
  });

  it('keeps skipping past several in-flight items', () => {
    const taken = ['lab/build-the-sanitization-filter', 'lab/build-the-experiment-runner-framework'];
    expect(pickBuildableItem(items, taken)).toBeNull();
  });

  it('never returns a done item, even when its branch is free', () => {
    expect(pickBuildableItem(parseBacklog('- [x] Bootstrap the loop'), [])).toBeNull();
  });

  it('returns null for an empty backlog', () => {
    expect(pickBuildableItem([], [])).toBeNull();
  });

  it('defaults to "nothing taken" when no branch list is supplied', () => {
    // --dry-run and the no-gh path pass nothing; that must read as fully buildable.
    expect(pickBuildableItem(items).item.title).toBe('Build the sanitization filter');
  });

  it('ignores taken branches that match no backlog item', () => {
    expect(pickBuildableItem(items, ['main', 'lab/something-else']).item.title)
      .toBe('Build the sanitization filter');
  });
});

describe('prListArgs', () => {
  it('queries gh for PRs on the given head branch', () => {
    expect(prListArgs('lab/build-the-sanitization-filter'))
      .toEqual(['pr', 'list', '--head', 'lab/build-the-sanitization-filter', '--state', 'all', '--json', 'number']);
  });

  it('asks for every PR state, not just open ones', () => {
    // The #27 -> #29 regression: with `--state open`, a superseded CLOSED PR read
    // as "no PR", so the loop re-picked the item and rebuilt shipped work. Once a
    // branch has carried any PR the item must never be rebuilt.
    const args = prListArgs('lab/anything');
    expect(args[args.indexOf('--state') + 1]).toBe('all');
    expect(args).not.toContain('open');
  });

  it('passes the branch through verbatim, however it is spelled', () => {
    expect(prListArgs('lab/tools-listing-page')).toContain('lab/tools-listing-page');
  });
});

describe('uniqueBranchName', () => {
  it('uses the plain dated name when the remote has no such branch', () => {
    expect(uniqueBranchName('lab/agent-weekly-2026-07-18', [])).toBe('lab/agent-weekly-2026-07-18');
  });
  it('steps to -2 when a same-day run already pushed the dated branch', () => {
    // Without this, `git push` hits a non-fast-forward and the whole run fails.
    expect(uniqueBranchName('lab/x-2026-07-18', ['lab/x-2026-07-18'])).toBe('lab/x-2026-07-18-2');
  });
  it('keeps stepping past every taken suffix', () => {
    const taken = ['lab/x-2026-07-18', 'lab/x-2026-07-18-2', 'lab/x-2026-07-18-3'];
    expect(uniqueBranchName('lab/x-2026-07-18', taken)).toBe('lab/x-2026-07-18-4');
  });
  it('ignores unrelated branches', () => {
    expect(uniqueBranchName('lab/x-2026-07-18', ['main', 'lab/y-2026-07-18'])).toBe('lab/x-2026-07-18');
  });
  it('throws rather than looping forever if every name is somehow taken', () => {
    const taken = ['lab/x', ...Array.from({ length: 98 }, (_, i) => `lab/x-${i + 2}`)];
    expect(() => uniqueBranchName('lab/x', taken)).toThrow(/no free branch name/);
  });
});

describe('newLabEntriesInStatus', () => {
  it('finds an untracked (??) Lab entry the machine authored', () => {
    const status = '?? src/content/lab/2026-07-21-build-the-generative-ui-canvas.md';
    expect(newLabEntriesInStatus(status)).toEqual(['src/content/lab/2026-07-21-build-the-generative-ui-canvas.md']);
  });
  it('finds a staged (A) Lab entry too', () => {
    expect(newLabEntriesInStatus('A  src/content/lab/foo.md')).toEqual(['src/content/lab/foo.md']);
  });
  it('returns [] for a pure-engine cycle that added no Lab entry', () => {
    const status = ' M engine/lib.mjs\n M engine/run-cycle.mjs\n?? engine/.run.lock';
    expect(newLabEntriesInStatus(status)).toEqual([]);
  });
  it('ignores a mere EDIT to an existing Lab entry (only new files count)', () => {
    expect(newLabEntriesInStatus(' M src/content/lab/hello-lab.md')).toEqual([]);
  });
  it('ignores new files outside src/content/lab and non-markdown files', () => {
    const status = '?? src/content/tools/generative-ui.md\n?? src/content/lab/notes.txt\n?? public/tools/x.html';
    expect(newLabEntriesInStatus(status)).toEqual([]);
  });
  it('collects multiple new entries and tolerates blank lines', () => {
    const status = '?? src/content/lab/a.md\n\n?? src/content/lab/b.md\n';
    expect(newLabEntriesInStatus(status)).toEqual(['src/content/lab/a.md', 'src/content/lab/b.md']);
  });
  it('strips the quotes porcelain adds around unusual paths', () => {
    expect(newLabEntriesInStatus('?? "src/content/lab/a b.md"')).toEqual(['src/content/lab/a b.md']);
  });
  it('handles empty input', () => {
    expect(newLabEntriesInStatus('')).toEqual([]);
  });
});

describe('latestIdeaDate', () => {
  it('returns null when there are no dated sections', () => {
    expect(latestIdeaDate('# Idea Inbox\n\nsome preamble, no dates yet')).toBeNull();
  });
  it('returns the only dated section', () => {
    expect(latestIdeaDate('## 2026-07-21\n\n### Ideas\n- a thing')).toBe('2026-07-21');
  });
  it('returns the NEWEST date regardless of file order', () => {
    const md = '## 2026-07-19\n- old\n\n## 2026-07-21\n- new\n\n## 2026-07-20\n- mid';
    expect(latestIdeaDate(md)).toBe('2026-07-21');
  });
  it('ignores headings that are not a bare ## date', () => {
    const md = '## Triaged\n## 2026-07-18 (notes)\n### 2026-99-99\n## 2026-07-18';
    expect(latestIdeaDate(md)).toBe('2026-07-18');
  });
  it('handles empty input', () => {
    expect(latestIdeaDate('')).toBeNull();
  });
});

describe('ideasBranch', () => {
  it('builds the dated idea-sweep branch', () => {
    expect(ideasBranch('2026-07-21')).toBe('lab/ideas-2026-07-21');
  });
});

describe('parseIdeas', () => {
  const HEADER = [
    '# Idea Inbox',
    '',
    '**Triage (Wolf, by hand):**',
    '- **Queue it** → copy the bullet into `engine/BACKLOG.md` as a `- [ ]` task.',
    '- **Reject it** → move the bullet to `engine/IDEAS-rejected.md`.',
    '',
  ].join('\n');

  it('ignores bullets before the first dated section', () => {
    expect(parseIdeas(HEADER)).toEqual([]);
  });

  it('collects bullets under a dated section, tagged with date and group', () => {
    const md = `${HEADER}## 2026-07-25\n\n### Ideas (dreamed up)\n- **Cycle cost ledger** — price each run.\n`;
    expect(parseIdeas(md)).toEqual([
      { date: '2026-07-25', group: 'Ideas', text: '**Cycle cost ledger** — price each run.' },
    ]);
  });

  it('strips the parenthetical gloss from a group heading', () => {
    const md = '## 2026-07-25\n### Opportunities (grounded in a repo read)\n- There is no 404 page.';
    expect(parseIdeas(md)[0].group).toBe('Opportunities');
  });

  it('keeps bullets from every dated section and both groups', () => {
    const md = [
      '## 2026-07-24',
      '### Ideas (dreamed up)',
      '- alpha',
      '### Opportunities (grounded in a repo read)',
      '- beta',
      '## 2026-07-25',
      '### Ideas (dreamed up)',
      '- gamma',
    ].join('\n');
    expect(parseIdeas(md).map((i) => `${i.date}/${i.group}/${i.text}`)).toEqual([
      '2026-07-24/Ideas/alpha',
      '2026-07-24/Opportunities/beta',
      '2026-07-25/Ideas/gamma',
    ]);
  });

  it('stops collecting when a non-date h2 opens a new section', () => {
    const md = '## 2026-07-25\n### Ideas (dreamed up)\n- kept\n\n## Archive\n- dropped';
    expect(parseIdeas(md)).toEqual([
      { date: '2026-07-25', group: 'Ideas', text: 'kept' },
    ]);
  });

  it('handles a bullet with no enclosing group heading', () => {
    expect(parseIdeas('## 2026-07-25\n- loose')).toEqual([
      { date: '2026-07-25', group: null, text: 'loose' },
    ]);
  });

  it('handles empty input', () => {
    expect(parseIdeas('')).toEqual([]);
  });
});

describe('idleMarker / sweepReported', () => {
  it('renders a marker for a sweep date', () => {
    expect(idleMarker('2026-07-25')).toBe('<!-- engine-idle: sweep=2026-07-25 -->');
  });

  it('renders a "none" marker when no sweep has run yet', () => {
    expect(idleMarker(null)).toBe('<!-- engine-idle: sweep=none -->');
  });

  it('is false when nothing carries the marker', () => {
    expect(sweepReported(['a body', 'a comment'], '2026-07-25')).toBe(false);
  });

  it('is true when the issue body carries the marker', () => {
    const body = '<!-- engine-idle: sweep=2026-07-25 -->\nEngine is idle.';
    expect(sweepReported([body], '2026-07-25')).toBe(true);
  });

  it('is true when a later comment carries the marker', () => {
    const texts = ['<!-- engine-idle: sweep=2026-07-24 -->', '<!-- engine-idle: sweep=2026-07-25 -->'];
    expect(sweepReported(texts, '2026-07-25')).toBe(true);
  });

  it('does not match a different sweep date', () => {
    expect(sweepReported(['<!-- engine-idle: sweep=2026-07-24 -->'], '2026-07-25')).toBe(false);
  });

  it('does not match a date that merely shares a prefix', () => {
    expect(sweepReported(['<!-- engine-idle: sweep=2026-07-2 -->'], '2026-07-25')).toBe(false);
  });

  it('does not match when the checked date is a prefix of a reported one', () => {
    expect(sweepReported(['<!-- engine-idle: sweep=2026-07-25 -->'], '2026-07-2')).toBe(false);
  });

  it('uses an em-dash in the issue title, not a hyphen', () => {
    expect(IDLE_ISSUE_TITLE).toBe(`Engine idle ${String.fromCharCode(0x2014)} backlog empty`);
  });

  it('treats the no-sweep-yet case like any other marker', () => {
    expect(sweepReported(['<!-- engine-idle: sweep=none -->'], null)).toBe(true);
    expect(sweepReported([], null)).toBe(false);
  });

  it('tolerates a missing texts argument', () => {
    expect(sweepReported(undefined, '2026-07-25')).toBe(false);
  });
});

describe('renderIdleNotice', () => {
  const ideas = [
    { date: '2026-07-24', group: 'Ideas', text: 'alpha' },
    { date: '2026-07-25', group: 'Ideas', text: 'beta' },
    { date: '2026-07-25', group: 'Opportunities', text: 'gamma' },
  ];

  it('leads with the marker so the post is self-identifying', () => {
    const out = renderIdleNotice({ sweepDate: '2026-07-25', ideas: [] });
    expect(out.split('\n')[0]).toBe('<!-- engine-idle: sweep=2026-07-25 -->');
  });

  it('says the backlog is empty when nothing was skipped', () => {
    const out = renderIdleNotice({ sweepDate: '2026-07-25', ideas: [] });
    expect(out).toContain('no unchecked items');
    expect(out).not.toContain('parked behind');
  });

  it('names each skipped item and its branch when the backlog is blocked', () => {
    const out = renderIdleNotice({
      sweepDate: '2026-07-25',
      ideas: [],
      skipped: [{ title: 'Give writing posts their own pages', branch: 'lab/give-writing-posts' }],
    });
    expect(out).toContain('not** empty');
    expect(out).toContain('Give writing posts their own pages');
    expect(out).toContain('lab/give-writing-posts');
  });

  it('reports the sweep date and the untriaged count', () => {
    const out = renderIdleNotice({ sweepDate: '2026-07-25', ideas });
    expect(out).toContain('Last idea sweep: **2026-07-25**');
    expect(out).toContain('**3**');
  });

  it('groups ideas by sweep date, newest first', () => {
    const out = renderIdleNotice({ sweepDate: '2026-07-25', ideas });
    expect(out.indexOf('### 2026-07-25')).toBeLessThan(out.indexOf('### 2026-07-24'));
    expect(out).toContain('- _Ideas_ — beta');
    expect(out).toContain('- _Opportunities_ — gamma');
  });

  it('omits the idea list entirely when there is nothing untriaged', () => {
    const out = renderIdleNotice({ sweepDate: '2026-07-25', ideas: [] });
    expect(out).not.toContain('###');
    expect(out).toContain('**0**');
  });

  it('says "none yet" when no sweep has ever run', () => {
    expect(renderIdleNotice({ sweepDate: null, ideas: [] })).toContain('none yet');
  });

  it('always carries the triage crib and both file links', () => {
    const out = renderIdleNotice({ sweepDate: '2026-07-25', ideas: [] });
    expect(out).toContain('engine/IDEAS-rejected.md');
    expect(out).toContain('/blob/main/engine/IDEAS.md');
    expect(out).toContain('/blob/main/engine/BACKLOG.md');
  });
});

describe('partitionBuildable', () => {
  const items = [
    { title: 'Alpha task', done: true },
    { title: 'Beta task', done: false },
    { title: 'Gamma task', done: false },
  ];

  it('returns the first unchecked item and no skips when nothing has a PR', () => {
    const { next, skipped } = partitionBuildable(items, () => false);
    expect(next.item.title).toBe('Beta task');
    expect(skipped).toEqual([]);
  });

  it('skips items whose branch already has a PR and records them', () => {
    const betaBranch = branchForItem('Beta task');
    const { next, skipped } = partitionBuildable(items, (b) => b === betaBranch);
    expect(next.item.title).toBe('Gamma task');
    expect(skipped).toEqual([{ title: shortTitle('Beta task'), branch: betaBranch }]);
  });

  it('returns next=null and every skipped item when all are blocked', () => {
    const { next, skipped } = partitionBuildable(items, () => true);
    expect(next).toBeNull();
    expect(skipped.map((s) => s.title)).toEqual([shortTitle('Beta task'), shortTitle('Gamma task')]);
  });

  it('returns next=null and no skips when the backlog is genuinely empty', () => {
    const { next, skipped } = partitionBuildable([{ title: 'Done', done: true }], () => false);
    expect(next).toBeNull();
    expect(skipped).toEqual([]);
  });
});

describe('renderIdleNotice — bounded size', () => {
  // 30 sweeps of 8 long bullets: the shape the real inbox reached before the
  // notice grew past what the next cycle could read back.
  const many = [];
  for (let d = 1; d <= 30; d += 1) {
    const date = `2026-07-${String(d).padStart(2, '0')}`;
    for (let b = 0; b < 8; b += 1) {
      many.push({ date, group: b % 2 ? 'Opportunities' : 'Ideas', text: `sweep ${date} bullet ${b} ` + 'x'.repeat(2000) });
    }
  }

  it('inlines only the newest few sweeps', () => {
    const out = renderIdleNotice({ sweepDate: '2026-07-30', ideas: many });
    const sections = out.match(/^### \d{4}-\d{2}-\d{2}$/gm) || [];
    expect(sections.length).toBeLessThanOrEqual(3);
    expect(out).toContain('### 2026-07-30');
    expect(out).not.toContain('### 2026-07-01');
  });

  it('accounts for the sweeps it elided instead of dropping them silently', () => {
    const out = renderIdleNotice({ sweepDate: '2026-07-30', ideas: many });
    expect(out).toMatch(/216 older/);
    expect(out).toContain('27 earlier sweep');
  });

  it('stays well inside a GitHub comment regardless of inbox size', () => {
    const out = renderIdleNotice({ sweepDate: '2026-07-30', ideas: many });
    expect(out.length).toBeLessThan(65536);
  });

  it('still reports the full untriaged count', () => {
    const out = renderIdleNotice({ sweepDate: '2026-07-30', ideas: many });
    expect(out).toContain('**240**');
  });

  it('leaves a small inbox untouched', () => {
    const few = [
      { date: '2026-07-24', group: 'Ideas', text: 'alpha' },
      { date: '2026-07-25', group: 'Ideas', text: 'beta' },
    ];
    const out = renderIdleNotice({ sweepDate: '2026-07-25', ideas: few });
    expect(out).toContain('alpha');
    expect(out).toContain('beta');
    expect(out).not.toMatch(/older idea/);
  });
});
