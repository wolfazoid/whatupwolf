// Reads the tail of engine/cycle.log that has appeared since the previous scan
// and counts the best-effort failures the engine swallowed into it.
//
// WHY THIS EXISTS: notify.mjs, branchHasPr, recoverToMain and publish.mjs all
// catch their errors on purpose — GitHub being down must never fail a cycle — and
// log one line instead. cycle.log is gitignored and stays on the box, so those
// lines are the whole record. When the idle notifier began failing on 2026-08-11
// it printed one per hourly tick for seven days and nothing else changed
// anywhere. This module is how that count reaches a surface that leaves the
// machine (the Agent Weekly digest, see engine/run-experiment.mjs).
//
// NOTHING HERE THROWS. A missing log, a corrupt state file, an unreadable path, a
// file truncated mid-read: every one of them returns `status: 'no-data'` with a
// reason. A scanner added to end a silent failure must not be able to become one,
// and it must never be the thing that takes down a digest run.
import { openSync, readSync, closeSync, fstatSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, basename } from 'node:path';
import { scanSwallowedErrors, resolveLogWindow } from './lib.mjs';

const ENGINE_DIR = dirname(fileURLToPath(import.meta.url));
export const CYCLE_LOG = join(ENGINE_DIR, 'cycle.log');
// Machine-local, gitignored (engine/.gitignore) — it records a byte offset into a
// log that is itself machine-local, so it is meaningless on any other checkout.
export const SCAN_STATE = join(ENGINE_DIR, '.log-scan.json');

function noData(reason) {
  return {
    status: 'no-data', reason,
    total: 0, byPattern: [], latest: null,
    since: null, first: true, rotated: false, clipped: false, bytes: 0,
  };
}

// The previous scan's offset and timestamp. Any problem at all — no file yet, an
// unreadable one, malformed JSON, a negative or non-integer offset — degrades to
// "no previous scan", which resolveLogWindow reads as "scan the whole file". That
// over-reports once; a wrong offset would under-report forever.
export function readScanState(statePath = SCAN_STATE) {
  try {
    const s = JSON.parse(readFileSync(statePath, 'utf8'));
    return {
      offset: Number.isInteger(s?.offset) && s.offset >= 0 ? s.offset : null,
      at: typeof s?.at === 'string' && s.at ? s.at : null,
    };
  } catch {
    return { offset: null, at: null };
  }
}

// Record where this scan finished. Best effort like everything else it watches:
// if the write fails, the offset stays where it was and the next digest re-reads
// this window and double-counts it — visibly, in the digest, rather than silently.
function writeScanState(statePath, state) {
  try {
    writeFileSync(statePath, `${JSON.stringify(state, null, 2)}\n`);
  } catch (err) {
    console.error(`Log scan: could not record the scan offset (${err.message}) — the next digest re-reads this window.`);
  }
}

// Scan the log for swallowed errors since the previous scan.
//
// `commit: false` performs the scan without advancing the offset — what
// --dry-run wants, so previewing a digest never eats the window the next real
// run is supposed to report on.
export function scanCycleLog({
  logPath = CYCLE_LOG,
  statePath = SCAN_STATE,
  now = new Date(),
  commit = true,
} = {}) {
  const { offset, at } = readScanState(statePath);
  let fd = null;
  try {
    fd = openSync(logPath, 'r');
    const window = resolveLogWindow(fstatSync(fd).size, offset);
    const length = Math.max(0, window.end - window.start);
    let text = '';
    if (length > 0) {
      const buf = Buffer.allocUnsafe(length);
      let read = 0;
      // Positioned reads in a loop rather than readFileSync: we want only the new
      // slice, and a short read (or a log truncated by another process mid-scan)
      // must yield what we did get instead of throwing.
      while (read < length) {
        const n = readSync(fd, buf, read, length - read, window.start + read);
        if (n <= 0) break;
        read += n;
      }
      text = buf.subarray(0, read).toString('utf8');
      // A clipped window begins mid-line. That fragment is not a whole log line,
      // so it is dropped rather than matched against; if there is no newline at
      // all the entire window is one fragment and there is nothing to scan.
      if (window.clipped) {
        const nl = text.indexOf('\n');
        text = nl === -1 ? '' : text.slice(nl + 1);
      }
    }
    const scan = scanSwallowedErrors(text);
    if (commit) writeScanState(statePath, { offset: window.end, at: now.toISOString() });
    return {
      status: 'ok', reason: null,
      ...scan,
      since: at,
      first: window.first,
      rotated: window.rotated,
      clipped: window.clipped,
      bytes: length,
    };
  } catch (err) {
    return noData(err.code === 'ENOENT'
      ? `\`engine/${basename(logPath)}\` is not on this machine (nothing has run here, or the log was rotated away)`
      : `\`engine/${basename(logPath)}\` could not be read (${err.message})`);
  } finally {
    if (fd !== null) {
      try { closeSync(fd); } catch { /* already closed */ }
    }
  }
}
