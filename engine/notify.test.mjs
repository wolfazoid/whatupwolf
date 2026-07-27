import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const execFileSync = vi.hoisted(() => vi.fn());
vi.mock('node:child_process', () => ({ execFileSync }));

const { notifyIdle, notifyBuilding } = await import('./notify.mjs');
const { IDLE_ISSUE_TITLE, idleMarker } = await import('./lib.mjs');

describe('notify (dry mode)', () => {
  afterEach(() => vi.restoreAllMocks());

  it('previews the issue it would open and writes nothing', () => {
    const logs = [];
    vi.spyOn(console, 'log').mockImplementation((m) => logs.push(String(m)));

    notifyIdle({
      repoDir: '/tmp',
      sweepDate: '2026-07-25',
      ideas: [{ date: '2026-07-25', group: 'Ideas', text: 'alpha' }],
      skipped: [],
      dry: true,
    });

    const joined = logs.join('\n');
    expect(joined).toContain('[dry-run]');
    expect(joined).toContain('<!-- engine-idle: sweep=2026-07-25 -->');
    expect(joined).toContain('alpha');
  });

  it('previews the close it would perform and writes nothing', () => {
    const logs = [];
    vi.spyOn(console, 'log').mockImplementation((m) => logs.push(String(m)));
    vi.spyOn(console, 'error').mockImplementation(() => {});

    notifyBuilding({ repoDir: '/tmp', nowBuilding: 'Some task', dry: true });

    expect(logs.join('\n')).toContain('[dry-run]');
  });

  it('never throws when gh is unavailable', () => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => notifyIdle({
      repoDir: '/nonexistent-path-for-this-test',
      sweepDate: '2026-07-25',
      ideas: [],
      skipped: [],
      dry: false,
    })).not.toThrow();
  });
});

// Helper: build the JSON `gh issue list` would print for a single matching
// idle issue with the given comment/body texts (or no issue at all, when
// `texts` is null).
function issueListJson(texts) {
  if (texts === null) return JSON.stringify([]);
  const [body, ...comments] = texts;
  return JSON.stringify([
    {
      number: 42,
      title: IDLE_ISSUE_TITLE,
      body,
      comments: comments.map((c) => ({ body: c })),
    },
  ]);
}

describe('notify (live mode, gh mocked)', () => {
  beforeEach(() => {
    execFileSync.mockReset();
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterEach(() => vi.restoreAllMocks());

  it('a. no open idle issue found -> opens a new issue via gh issue create', () => {
    execFileSync.mockImplementation((cmd, args) => {
      if (args[0] === 'issue' && args[1] === 'list') return issueListJson(null);
      if (args[0] === 'issue' && args[1] === 'create') return 'https://github.com/x/y/issues/1';
      throw new Error(`unexpected call: ${cmd} ${args.join(' ')}`);
    });

    notifyIdle({
      repoDir: '/tmp',
      sweepDate: '2026-07-25',
      ideas: [{ date: '2026-07-25', group: 'Ideas', text: 'alpha' }],
      skipped: [],
      dry: false,
    });

    const createCall = execFileSync.mock.calls.find(([, args]) => args[0] === 'issue' && args[1] === 'create');
    expect(createCall).toBeTruthy();
    const [, createArgs] = createCall;
    expect(createArgs).toContain('--title');
    expect(createArgs[createArgs.indexOf('--title') + 1]).toBe(IDLE_ISSUE_TITLE);
    expect(createArgs).toContain('--body');
    expect(createArgs[createArgs.indexOf('--body') + 1]).toContain(idleMarker('2026-07-25'));

    // Never comments when there was no issue to comment on.
    expect(execFileSync.mock.calls.some(([, args]) => args[0] === 'issue' && args[1] === 'comment')).toBe(false);
  });

  it('b. open idle issue found, sweep not yet reported -> comments via gh issue comment, not create', () => {
    execFileSync.mockImplementation((cmd, args) => {
      if (args[0] === 'issue' && args[1] === 'list') {
        // Existing issue only carries an older sweep's marker.
        return issueListJson([`${idleMarker('2026-07-24')}\nold body`]);
      }
      if (args[0] === 'issue' && args[1] === 'comment') return '';
      throw new Error(`unexpected call: ${cmd} ${args.join(' ')}`);
    });

    notifyIdle({
      repoDir: '/tmp',
      sweepDate: '2026-07-25',
      ideas: [],
      skipped: [],
      dry: false,
    });

    const commentCall = execFileSync.mock.calls.find(([, args]) => args[0] === 'issue' && args[1] === 'comment');
    expect(commentCall).toBeTruthy();
    const [, commentArgs] = commentCall;
    expect(commentArgs[2]).toBe('42');
    expect(commentArgs).toContain('--body');
    expect(commentArgs[commentArgs.indexOf('--body') + 1]).toContain(idleMarker('2026-07-25'));

    expect(execFileSync.mock.calls.some(([, args]) => args[0] === 'issue' && args[1] === 'create')).toBe(false);
  });

  it('c. open idle issue found, sweep already reported -> neither create nor comment invoked', () => {
    execFileSync.mockImplementation((cmd, args) => {
      if (args[0] === 'issue' && args[1] === 'list') {
        // Existing issue already carries THIS sweep's marker.
        return issueListJson([`${idleMarker('2026-07-25')}\nbody`]);
      }
      throw new Error(`unexpected call: ${cmd} ${args.join(' ')}`);
    });

    notifyIdle({
      repoDir: '/tmp',
      sweepDate: '2026-07-25',
      ideas: [],
      skipped: [],
      dry: false,
    });

    expect(execFileSync.mock.calls.some(([, args]) => args[0] === 'issue' && args[1] === 'create')).toBe(false);
    expect(execFileSync.mock.calls.some(([, args]) => args[0] === 'issue' && args[1] === 'comment')).toBe(false);
  });

  it('d. notifyBuilding with an open idle issue found -> closes via gh issue close', () => {
    execFileSync.mockImplementation((cmd, args) => {
      if (args[0] === 'issue' && args[1] === 'list') return issueListJson(['some body']);
      if (args[0] === 'issue' && args[1] === 'close') return '';
      throw new Error(`unexpected call: ${cmd} ${args.join(' ')}`);
    });

    notifyBuilding({ repoDir: '/tmp', nowBuilding: 'Some task', dry: false });

    const closeCall = execFileSync.mock.calls.find(([, args]) => args[0] === 'issue' && args[1] === 'close');
    expect(closeCall).toBeTruthy();
    const [, closeArgs] = closeCall;
    expect(closeArgs[2]).toBe('42');
    expect(closeArgs).toContain('--comment');
    expect(closeArgs[closeArgs.indexOf('--comment') + 1]).toContain('Some task');
  });

  it('e. a write call that throws does not propagate', () => {
    execFileSync.mockImplementation((cmd, args) => {
      if (args[0] === 'issue' && args[1] === 'list') return issueListJson(null);
      if (args[0] === 'issue' && args[1] === 'create') throw new Error('gh: network error');
      throw new Error(`unexpected call: ${cmd} ${args.join(' ')}`);
    });

    expect(() => notifyIdle({
      repoDir: '/tmp',
      sweepDate: '2026-07-25',
      ideas: [],
      skipped: [],
      dry: false,
    })).not.toThrow();
  });
});
