import { describe, it, expect } from 'vitest';
import { readFileSync, writeFileSync, mkdtempSync, chmodSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// The guard is a trust boundary written in YAML and shell, so it has no unit
// under test in the usual sense. These tests do two things: assert the wiring
// that PR #77 was lost for (a second trigger, a concurrency group, a disarm),
// and run the guard's *actual* shell blocks — lifted out of the workflow file —
// against stubbed `gh` so the decisions they encode are exercised, not read.

const GUARD = readFileSync(new URL('../.github/workflows/guard.yml', import.meta.url), 'utf8');
const CI = readFileSync(new URL('../.github/workflows/ci.yml', import.meta.url), 'utf8');

/** Lift one named step's `run: |` block out of the workflow, dedented. */
function stepScript(name) {
  const i = GUARD.indexOf(`- name: ${name}`);
  expect(i, `step not found: ${name}`).toBeGreaterThan(-1);
  const after = GUARD.slice(GUARD.indexOf('run: |', i) + 'run: |'.length);
  const lines = after.split('\n').slice(1);
  const indent = lines[0].match(/^ */)[0].length;
  const body = [];
  for (const line of lines) {
    if (line.trim() !== '' && line.match(/^ */)[0].length < indent) break;
    body.push(line.slice(indent));
  }
  return body.join('\n');
}

/** Lift one named step's `if:` expression. */
function stepIf(name) {
  const i = GUARD.indexOf(`- name: ${name}`);
  expect(i, `step not found: ${name}`).toBeGreaterThan(-1);
  return GUARD.slice(i).match(/\n\s+if: (.*)/)[1];
}

/** Run a lifted script in a scratch dir with a stub `gh` first on PATH. */
function runStep(script, { env = {}, gh = 'exit 1' } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'guard-'));
  const bin = join(dir, 'gh');
  writeFileSync(bin, `#!/usr/bin/env bash\n${gh}\n`);
  chmodSync(bin, 0o755);
  const out = join(dir, 'output');
  writeFileSync(out, '');
  const log = execFileSync('bash', ['-eo', 'pipefail', '-c', script], {
    encoding: 'utf8',
    env: {
      PATH: `${dir}:${process.env.PATH}`,
      GITHUB_OUTPUT: out,
      GITHUB_REPOSITORY: 'wolfazoid/whatupwolf',
      ...env,
    },
  });
  const outputs = {};
  for (const [, k, v] of readFileSync(out, 'utf8').matchAll(/^([A-Za-z_]+)=(.*)$/gm)) outputs[k] = v;
  return { log, outputs };
}

describe('guard.yml wiring', () => {
  it('re-triggers on the CI workflow completing, by the name ci.yml actually declares', () => {
    const ciName = CI.match(/^name: (.*)$/m)[1].trim();
    const workflows = GUARD.match(/workflow_run:\n\s+workflows: \[(.*)\]/)[1];
    expect(workflows.split(',').map((s) => s.trim())).toContain(ciName);
    expect(GUARD).toMatch(/workflow_run:[\s\S]*?types: \[completed\]/);
  });

  it('serialises guard jobs per PR and only lets a push cancel one in flight', () => {
    const block = GUARD.match(/^concurrency:\n((?:  .*\n)+)/m)[1];
    expect(block).toMatch(/group: guard-/);
    expect(block).toMatch(/cancel-in-progress: \$\{\{ github\.event_name == 'pull_request' \}\}/);
  });

  it('re-arms only behind the same allowlist evaluation, never unconditionally', () => {
    const arm = stepIf('Enable auto-merge (allowlisted PRs, Tier B only)');
    expect(arm).toContain("steps.guard.outputs.allowed == '1'");
    expect(arm).toContain("vars.AUTONOMY_TIER == 'B'");
  });

  it('disarms auto-merge when a PR moves onto a protected path', () => {
    expect(stepScript('Disarm auto-merge on protected PRs')).toContain('--disable-auto');
    expect(stepIf('Disarm auto-merge on protected PRs')).toContain("steps.guard.outputs.allowed != '1'");
  });

  it('skips every acting step when no PR was resolved', () => {
    const acting = [
      'List changed files',
      'Evaluate against allowlist',
      'Enable auto-merge (allowlisted PRs, Tier B only)',
      'Tier A — allowlisted, auto-merge OFF',
      'Disarm auto-merge on protected PRs',
      'Flag protected PRs for human review',
    ];
    for (const name of acting) expect(stepIf(name), name).toContain("steps.pr.outputs.number != ''");
  });
});

describe('allowlist evaluation', () => {
  const script = stepScript('Evaluate against allowlist');
  const evaluate = (files) => runStep(script, { env: { FILES: files.join('\n') } }).outputs.allowed;

  it('allows the machine’s own zone', () => {
    expect(evaluate(['src/content/lab/a.md', 'engine/lib.mjs', 'src/lib/lab-filter.ts'])).toBe('1');
  });
  it('protects the leak guard carved out of src/lib/*', () => {
    expect(evaluate(['src/lib/sanitize.ts'])).toBe('0');
  });
  it('protects the constitution, the core site and CI config', () => {
    expect(evaluate(['engine/CYCLE.md'])).toBe('0');
    expect(evaluate(['src/components/Nav.astro'])).toBe('0');
    expect(evaluate(['.github/workflows/guard.yml'])).toBe('0');
    expect(evaluate(['package.json'])).toBe('0');
  });
  it('protects a mixed diff on the strength of its one bad path', () => {
    expect(evaluate(['src/content/lab/a.md', 'astro.config.mjs'])).toBe('0');
  });
  it('reads the file list from the environment, so a quote in a name cannot break out', () => {
    expect(evaluate(["src/content/lab/it's-fine.md"])).toBe('1');
    expect(evaluate(["'; allowed=1 #"])).toBe('0');
  });
});

describe('PR resolution', () => {
  const script = stepScript('Resolve the PR this event belongs to');
  const workflowRun = (over = {}) => ({
    GITHUB_EVENT_NAME: 'workflow_run',
    PR_FROM_EVENT: '',
    RUN_EVENT: 'pull_request',
    RUN_CONCLUSION: 'success',
    RUN_HEAD_SHA: 'abc123',
    ...over,
  });
  // Stub gh, emitting what the real `gh ... --jq` would print: the PR number
  // for that SHA (empty when there is none), then the PR's current head OID.
  const gh = (pulls, head) => `
    case "$1 $2" in
      "api repos/wolfazoid/whatupwolf/commits/abc123/pulls") echo '${pulls}' ;;
      "pr view"*) echo '${head}' ;;
      *) echo "unexpected gh call: $*" >&2; exit 1 ;;
    esac`;

  it('takes the number straight from a pull_request event', () => {
    const { outputs } = runStep(script, {
      env: { GITHUB_EVENT_NAME: 'pull_request', PR_FROM_EVENT: '91', RUN_EVENT: '', RUN_CONCLUSION: '', RUN_HEAD_SHA: '' },
    });
    expect(outputs.number).toBe('91');
  });

  it('resolves the open PR at that head SHA when CI went green', () => {
    const { outputs } = runStep(script, { env: workflowRun(), gh: gh('77', 'abc123') });
    expect(outputs.number).toBe('77');
  });

  it('ignores a CI run for a push to main', () => {
    const { outputs, log } = runStep(script, { env: workflowRun({ RUN_EVENT: 'push' }) });
    expect(outputs.number).toBe('');
    expect(log).toContain('nothing to re-arm');
  });

  it('does not re-arm behind a red CI run', () => {
    const { outputs } = runStep(script, { env: workflowRun({ RUN_CONCLUSION: 'failure' }) });
    expect(outputs.number).toBe('');
  });

  it('ignores a SHA with no open PR', () => {
    const { outputs } = runStep(script, { env: workflowRun(), gh: gh('', '') });
    expect(outputs.number).toBe('');
  });

  it('refuses a completion for a SHA the PR has already moved past', () => {
    const { outputs, log } = runStep(script, { env: workflowRun(), gh: gh('77', 'def456') });
    expect(outputs.number).toBe('');
    expect(log).toContain('Stale');
  });
});
