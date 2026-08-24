import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

// The guard's allowlist is a shell `case` inside a workflow step — nothing else in
// the repo exercises it, and it is the only thing standing between a machine-authored
// PR and a self-merge. So rather than re-implementing the glob semantics in JS (which
// would test a copy, not the guard), these tests extract the real script out of
// guard.yml and run it under /bin/sh with a synthetic file list.
const GUARD_FILE = fileURLToPath(new URL('./guard.yml', import.meta.url));

/**
 * Pull the `run:` block belonging to a named workflow step out of the YAML.
 * Deliberately hand-rolled: the repo has no YAML parser dependency, and the shape
 * we need (one literal block scalar) is unambiguous.
 *
 * @param {string} source
 * @param {string} stepName
 * @returns {string}
 */
function extractRunBlock(source, stepName) {
  const lines = source.split('\n');
  const start = lines.findIndex((l) => l.trim() === `- name: ${stepName}`);
  expect(start, `no step named ${stepName}`).toBeGreaterThanOrEqual(0);

  const runAt = lines.findIndex((l, i) => i > start && l.trim() === 'run: |');
  expect(runAt, `step ${stepName} has no literal run block`).toBeGreaterThan(start);

  const indent = /^\s*/.exec(lines[runAt])[0].length;
  const body = [];
  for (const line of lines.slice(runAt + 1)) {
    if (line.trim() !== '' && /^\s*/.exec(line)[0].length <= indent) break;
    body.push(line.slice(indent + 2));
  }
  return body.join('\n');
}

const RUN_BLOCK = extractRunBlock(readFileSync(GUARD_FILE, 'utf8'), 'Evaluate against allowlist');

/**
 * Run the guard's real evaluation script over a list of changed paths.
 * The workflow passes the file list through the FILES env var (never spliced
 * into the script text), so the test feeds it the same way; everything else —
 * the `case`, the arm order, the `allowed` flag — is the workflow's own code.
 *
 * @param {string[]} files
 * @returns {{ allowed: boolean, log: string }}
 */
function evaluate(files) {
  const dir = mkdtempSync(join(tmpdir(), 'guard-'));
  const outputFile = join(dir, 'github_output');
  expect(RUN_BLOCK, 'expected the heredoc to read the changed-file list').toContain('"$FILES"');

  try {
    const log = execFileSync('/bin/bash', ['-c', RUN_BLOCK], {
      encoding: 'utf8',
      env: { ...process.env, FILES: files.join('\n'), GITHUB_OUTPUT: outputFile },
    });
    const output = readFileSync(outputFile, 'utf8');
    expect(output, 'guard wrote no allowed= flag').toMatch(/^allowed=[01]$/m);
    return { allowed: /^allowed=1$/m.test(output), log };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

describe('guard allowlist — the machine zone', () => {
  it('auto-merges a Lab-post-only PR', () => {
    expect(evaluate(['src/content/lab/idea-sweep-2026-08-17.md']).allowed).toBe(true);
  });

  it('auto-merges engine machinery and its tests', () => {
    expect(evaluate(['engine/run-cycle.mjs', 'engine/lib.mjs', 'engine/lib.test.mjs']).allowed).toBe(true);
  });

  it('keeps the pure src/lib helpers in-zone', () => {
    const files = ['src/lib/feed.ts', 'src/lib/lab-filter.ts', 'src/lib/tech-level.ts'];
    expect(evaluate(files).allowed).toBe(true);
    expect(evaluate([...files, 'src/lib/feed.test.ts', 'src/lib/tech-level.test.ts']).allowed).toBe(true);
  });
});

describe('guard allowlist — protected paths', () => {
  it('flags the engine constitution', () => {
    const { allowed, log } = evaluate(['engine/CYCLE.md']);
    expect(allowed).toBe(false);
    expect(log).toContain('protected (constitution): engine/CYCLE.md');
  });

  it('flags the core site, Wolf’s content, config and CI', () => {
    for (const f of [
      'src/pages/index.astro',
      'src/content/writing/a-post.md',
      'src/content/work/a-project.md',
      'astro.config.mjs',
      'public/_headers',
      '.github/workflows/guard.yml',
    ]) {
      expect(evaluate([f]).allowed, `${f} should be protected`).toBe(false);
    }
  });
});

// The reason this file exists. sanitize.core.mjs is the fail-closed secret scan every
// monitor report passes through on its way to publication; sanitize.test.ts is the only
// thing asserting it still fails closed. Both used to sit inside the bare `src/lib/*`
// allowlist arm, so under AUTONOMY_TIER=B a single machine PR could weaken the scan and
// relax its test, then merge itself on green CI.
describe('guard allowlist — the leak guard is carved out of src/lib/*', () => {
  const sanitizerFiles = [
    'src/lib/sanitize.core.mjs',
    'src/lib/sanitize.core.d.mts',
    'src/lib/sanitize.ts',
    'src/lib/sanitize.test.ts',
  ];

  for (const f of sanitizerFiles) {
    it(`flags ${f} as needs-human`, () => {
      const { allowed, log } = evaluate([f]);
      expect(allowed).toBe(false);
      expect(log).toContain(`protected (leak guard): ${f}`);
    });
  }

  it('flags a PR that weakens the scan and relaxes its test together', () => {
    expect(evaluate(['src/lib/sanitize.core.mjs', 'src/lib/sanitize.test.ts']).allowed).toBe(false);
  });

  it('poisons an otherwise-allowlisted PR that also touches the sanitizer', () => {
    const files = ['src/content/lab/a-post.md', 'engine/lib.mjs', 'src/lib/sanitize.core.mjs'];
    expect(evaluate(files).allowed).toBe(false);
  });

  it('places the sanitizer arm before the src/lib/* allowlist arm', () => {
    const sanitizeArm = RUN_BLOCK.indexOf('src/lib/sanitize*)');
    const allowArm = RUN_BLOCK.indexOf('src/lib/*)');
    expect(sanitizeArm, 'no src/lib/sanitize* arm').toBeGreaterThanOrEqual(0);
    expect(allowArm, 'no src/lib/* allowlist arm').toBeGreaterThanOrEqual(0);
    expect(sanitizeArm).toBeLessThan(allowArm);
  });
});
