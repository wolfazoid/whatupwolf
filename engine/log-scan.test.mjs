import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, readFileSync, appendFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { scanCycleLog, readScanState } from './log-scan.mjs';
import { LOG_SCAN_MAX_BYTES } from './lib.mjs';

// The real lines the engine's best-effort paths emit. Copied verbatim from the
// modules that print them — if one of those messages is reworded, the pattern in
// lib.mjs and this fixture have to move together, and this suite is what says so.
const READ_FAIL = 'Could not read existing issues (spawnSync gh ENOBUFS) — skipping the idle notice.';
const POST_FAIL = 'Could not post the idle notice (HTTP 502) — continuing.';
const PR_FAIL = 'Could not check for an existing PR on lab/foo (gh not found) — assuming none.';

let dir;
let log;
let state;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'log-scan-'));
  log = join(dir, 'cycle.log');
  state = join(dir, '.log-scan.json');
});
afterEach(() => {
  vi.restoreAllMocks();
  rmSync(dir, { recursive: true, force: true });
});

const scan = (opts = {}) => scanCycleLog({ logPath: log, statePath: state, ...opts });

describe('scanCycleLog — defensive cases (must never throw)', () => {
  it('reports no data when the log is missing', () => {
    const r = scan();
    expect(r.status).toBe('no-data');
    expect(r.reason).toContain('cycle.log');
    expect(r.total).toBe(0);
  });

  it('does not write a state file when there is no log to scan', () => {
    scan();
    expect(readScanState(state)).toEqual({ offset: null, at: null });
  });

  it('reports no data when the log is a directory, not a file', () => {
    // EISDIR on read — the "unreadable path" branch, exercised without chmod
    // (which is a no-op for root in CI containers).
    expect(() => scanCycleLog({ logPath: dir, statePath: state })).not.toThrow();
    const r = scanCycleLog({ logPath: dir, statePath: state });
    expect(r.status).toBe('no-data');
    expect(r.total).toBe(0);
  });

  it('treats a corrupt state file as a first scan rather than failing', () => {
    writeFileSync(log, `${READ_FAIL}\n`);
    writeFileSync(state, 'not json at all');
    const r = scan();
    expect(r.status).toBe('ok');
    expect(r.first).toBe(true);
    expect(r.total).toBe(1);
  });

  it('treats a nonsense offset as a first scan', () => {
    writeFileSync(log, `${READ_FAIL}\n`);
    writeFileSync(state, JSON.stringify({ offset: -17, at: 'whenever' }));
    expect(scan().total).toBe(1);
  });

  it('never throws when the state file cannot be written', () => {
    writeFileSync(log, `${READ_FAIL}\n`);
    vi.spyOn(console, 'error').mockImplementation(() => {});
    // A state path inside a directory that does not exist — writeFileSync throws
    // ENOENT and the scan has to absorb it.
    const r = scanCycleLog({ logPath: log, statePath: join(dir, 'nope', 'state.json') });
    expect(r.status).toBe('ok');
    expect(r.total).toBe(1);
  });

  it('handles an empty log', () => {
    writeFileSync(log, '');
    const r = scan();
    expect(r.status).toBe('ok');
    expect(r.total).toBe(0);
    expect(r.bytes).toBe(0);
  });
});

describe('scanCycleLog — windowing', () => {
  it('counts only what was appended since the previous scan', () => {
    writeFileSync(log, `${READ_FAIL}\n${READ_FAIL}\n`);
    const first = scan({ now: new Date('2026-08-10T07:00:00Z') });
    expect(first.total).toBe(2);
    expect(first.first).toBe(true);

    const second = scan({ now: new Date('2026-08-17T07:00:00Z') });
    expect(second.total).toBe(0);
    expect(second.first).toBe(false);
    expect(second.since).toBe('2026-08-10T07:00:00.000Z');

    appendFileSync(log, `${POST_FAIL}\n`);
    const third = scan();
    expect(third.total).toBe(1);
    expect(third.byPattern).toEqual([{ id: 'idle-issue-post', label: expect.any(String), count: 1 }]);
    expect(third.since).toBe('2026-08-17T07:00:00.000Z');
  });

  it('commit:false leaves the window for the next real run', () => {
    writeFileSync(log, `${READ_FAIL}\n`);
    expect(scan({ commit: false }).total).toBe(1);
    expect(readScanState(state)).toEqual({ offset: null, at: null });
    expect(scan().total).toBe(1);
  });

  it('restarts from the top when the log was truncated under it', () => {
    writeFileSync(log, `${READ_FAIL}\n`.repeat(5));
    expect(scan().total).toBe(5);

    // Rotation: the log is replaced by a shorter one, so the recorded offset now
    // points past the end. Without the restart this reads nothing, forever.
    writeFileSync(log, `${PR_FAIL}\n`);
    const r = scan();
    expect(r.rotated).toBe(true);
    expect(r.total).toBe(1);
    expect(r.byPattern[0].id).toBe('pr-lookup');
  });

  it('clips an oversized window to its tail and drops the partial first line', () => {
    // A padded first line that would match if the fragment were scanned, then
    // enough filler to push the window past the cap.
    const filler = `${'x'.repeat(999)}\n`;
    const parts = [`${READ_FAIL}\n`];
    let size = parts[0].length;
    while (size <= LOG_SCAN_MAX_BYTES) { parts.push(filler); size += filler.length; }
    parts.push(`${POST_FAIL}\n`);
    writeFileSync(log, parts.join(''));

    const r = scan();
    expect(r.clipped).toBe(true);
    // The very first line (READ_FAIL) is outside the tail window entirely.
    expect(r.byPattern.map((c) => c.id)).toEqual(['idle-issue-post']);
    expect(r.total).toBe(1);
  });

  it('records the offset it consumed to', () => {
    writeFileSync(log, `${READ_FAIL}\n`);
    scan({ now: new Date('2026-08-17T07:00:00Z') });
    const saved = JSON.parse(readFileSync(state, 'utf8'));
    expect(saved.offset).toBe(Buffer.byteLength(`${READ_FAIL}\n`));
    expect(saved.at).toBe('2026-08-17T07:00:00.000Z');
  });

  it('reports the most recent matching line, not the first', () => {
    writeFileSync(log, `${READ_FAIL}\n${PR_FAIL}\n${POST_FAIL}\n`);
    expect(scan().latest.line).toBe(POST_FAIL);
  });
});
