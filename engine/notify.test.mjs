import { describe, it, expect, vi, afterEach } from 'vitest';
import { notifyIdle, notifyBuilding } from './notify.mjs';

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
