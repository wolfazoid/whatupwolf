// Pure helpers for one lab-engine cycle. No I/O — unit-tested in lib.test.mjs.

export function parseBacklog(md) {
  const items = [];
  for (const line of md.split('\n')) {
    const m = line.match(/^\s*-\s*\[([ xX])\]\s+(.*\S)\s*$/);
    if (m) items.push({ title: m[2].trim(), done: m[1].toLowerCase() === 'x', raw: line });
  }
  return items;
}

export function pickNextItem(items) {
  return items.find((i) => !i.done) ?? null;
}

export function markItemDone(md, title) {
  return md
    .split('\n')
    .map((line) => {
      const m = line.match(/^(\s*-\s*)\[ \](\s+)(.*\S)\s*$/);
      if (m && m[3].trim() === title) return `${m[1]}[x]${m[2]}${m[3]}`;
      return line;
    })
    .join('\n');
}

export function slugify(text) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
    .replace(/-+$/g, '');
}

// Condenses a verbose backlog line into a short title for the PR / commit /
// branch / Lab entry. Takes the lead clause before the first ':' or spaced
// dash separator, then caps the length with an ellipsis. The full backlog line
// still goes to the machine as its task — only the human-facing labels shorten.
export function shortTitle(fullTitle, max = 72) {
  let t = String(fullTitle).split(/:\s|\s[—–-]\s/)[0].trim();
  if (t.length > max) {
    t = t.slice(0, max - 1);
    const sp = t.lastIndexOf(' ');
    if (sp > max * 0.6) t = t.slice(0, sp); // prefer a word boundary over a mid-word cut
    t = `${t.trimEnd()}…`;
  }
  return t;
}

// Pulls branch names out of `git ls-remote --heads origin <pattern>` output.
// Each line is "<sha>\trefs/heads/<branch>"; anything else (blank lines, stray
// warnings) is ignored.
export function parseRemoteBranches(lsRemoteOutput) {
  const names = [];
  for (const line of String(lsRemoteOutput).split('\n')) {
    const m = line.match(/\srefs\/heads\/(\S+)\s*$/);
    if (m) names.push(m[1]);
  }
  return names;
}

// Experiment branches are named by date (`lab/agent-weekly-2026-07-18`), so a
// second run on the same day would reuse a name that is already on the remote —
// `git push` then rejects the non-fast-forward and the whole run fails. Given the
// names already taken, return the first free one: the base itself, else `-2`,
// `-3`, … We pick a new name rather than force-pushing because the earlier
// branch may already have an open PR; overwriting it would silently rewrite what
// a reviewer is looking at. Pure — the caller does the git lookup.
export function uniqueBranchName(base, taken = []) {
  const used = new Set(taken);
  if (!used.has(base)) return base;
  for (let n = 2; n <= 99; n++) {
    const candidate = `${base}-${n}`;
    if (!used.has(candidate)) return candidate;
  }
  throw new Error(`no free branch name for ${base} (tried ${base}-2 … ${base}-99)`);
}

// The branch a backlog item builds on. Kept here (rather than inlined in the
// runner) so the "is this item already taken?" check and the checkout use the
// exact same name.
export function branchForItem(title) {
  return `lab/${slugify(shortTitle(title))}`;
}

// The `gh` argv for "does this branch have a PR?". `--state all` is deliberate
// and load-bearing: with `--state open` a CLOSED (superseded) PR reads as "no
// PR", so the loop re-picks the item and rebuilds work that was already turned
// into a PR once — exactly what happened with #27 -> #29. A branch that has ever
// carried a PR is done being built, whatever became of that PR.
export function prListArgs(branch) {
  return ['pr', 'list', '--head', branch, '--state', 'all', '--json', 'number'];
}

// Picks the next backlog item the loop can actually build. Unchecked items whose
// branch is already taken — one that already carries a PR, open, closed, or
// merged — are skipped rather than rebuilt: re-running them would hard-reset the
// branch under a reviewer and reopen work that is already done. Without this,
// one unmerged needs-human PR parks the whole loop on the same item forever.
//
// Pure: the caller decides what "taken" means (any PR on the branch) and
// feeds the names in, so the network lookup stays out of here. Returns
// `{ item, branch }` for the first buildable item, or null when every unchecked
// item is already in flight.
export function pickBuildableItem(items, takenBranches = []) {
  const taken = new Set(takenBranches);
  for (const item of items) {
    if (item.done) continue;
    const branch = branchForItem(item.title);
    if (taken.has(branch)) continue;
    return { item, branch };
  }
  return null;
}

const yamlStr = (s) => `"${String(s).replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;

// YAML reserved words that, left bare, parse as a boolean or null rather than a
// string. Matched case-insensitively (YAML also reads True/NULL/YES the same way).
const YAML_RESERVED = new Set(['true', 'false', 'null', 'yes', 'no', 'on', 'off', '~']);

// A tag is only safe to emit bare if it's a plain word/number-free token AND it
// wouldn't be parsed as a non-string: purely-numeric tokens become numbers and
// reserved words become booleans/null, either of which fails z.array(z.string())
// at build time. Anything else gets quoted so it stays a string scalar.
const yamlFlowScalar = (s) => {
  const str = String(s);
  const bareSafe =
    /^[A-Za-z0-9_-]+$/.test(str) && !/^[0-9]+$/.test(str) && !YAML_RESERVED.has(str.toLowerCase());
  return bareSafe ? str : yamlStr(str);
};

export function renderLabEntry({ title, date, type = 'experiment', status, tags = [], live = true, draft = false, summary, body }) {
  const iso = date.toISOString().slice(0, 16); // YYYY-MM-DDTHH:mm
  return [
    '---',
    `title: ${yamlStr(title)}`,
    `date: ${iso}`,
    `type: ${type}`,
    `status: ${status}`,
    `tags: [${tags.map(yamlFlowScalar).join(', ')}]`,
    `live: ${live}`,
    `draft: ${Boolean(draft)}`,
    `summary: ${yamlStr(summary)}`,
    '---',
    '',
    String(body).trim(),
    '',
  ].join('\n');
}

// The direct-vs-review gate, as a pure per-type policy. Monitor, experiment, and
// digest entries are factual machine-log posts — what ran, what changed, pass/fail —
// so they publish direct (draft:false). Briefing- and opinion-style entries carry a
// point of view, so they're gated behind draft:true for Wolf to review before they
// go public (see the Voice & publishing section of engine/CYCLE.md). Any unknown
// type fails safe to gated, so a new content type is never published unreviewed by
// accident. Returns the draft flag to stamp on the entry's frontmatter.
const DIRECT_PUBLISH_TYPES = new Set(['monitor', 'experiment', 'digest']);

export function draftForType(type) {
  return !DIRECT_PUBLISH_TYPES.has(String(type));
}

// Builds a PUBLIC lab entry from a PRIVATE client report: run the report through
// `sanitize` (allowlist + fail-closed secret scan) and render the surviving
// public snapshot as a lab entry. Fail-closed by construction — when a registered
// secret leaks, `sanitize` throws (SanitizationError) and we let it propagate
// unchanged, so no entry is ever produced from a report that failed sanitization.
//
// `sanitize` is injected rather than imported so this module stays loadable under
// plain `node` (run-cycle.mjs imports it directly): the sanitizer lives in
// TypeScript (src/lib/sanitize.ts), which Node can't parse, so importing it here
// at load time would break the runner. The caller (or a test) passes it in.
export function publicEntryFromReport(report, { sanitize, date, status = 'done', type, live } = {}) {
  if (typeof sanitize !== 'function') {
    throw new TypeError('publicEntryFromReport: a `sanitize` function must be injected');
  }
  const snapshot = sanitize(report); // throws on leak — do NOT catch (fail-closed)
  return renderLabEntry({
    title: snapshot.title,
    summary: snapshot.summary,
    body: snapshot.body ?? '',
    tags: snapshot.tags ?? [],
    date,
    status,
    ...(type !== undefined ? { type } : {}),
    ...(live !== undefined ? { live } : {}),
  });
}

// Independent verify gate: the machine reports its own status, but the runner
// re-runs `npm test` and `npm run check` and gets the final say. Any failing
// gate overrides the report to "flagged" so broken work never ships as "done".
export function resolveStatus(reportStatus, testsPassed, checkPassed) {
  return testsPassed && checkPassed ? reportStatus : 'flagged';
}

// The pure half of the single-instance lock. Given the raw contents of
// engine/.run.lock (or null when the file is missing) and a liveness probe
// `isAlive(pid) -> boolean`, decide whether the lock is free to take. Free when
// the file is missing, its contents aren't a positive pid, or the pid it names
// is no longer running — a stale lock left by a killed run must never wedge the
// loop. Held only when the file names a currently-live pid. The I/O — reading
// the file and probing with process.kill(pid, 0) — stays in the runner; this
// stays pure so the free / held-by-live / stale-pid cases are unit-testable.
export function lockIsFree(lockContents, isAlive) {
  if (lockContents == null) return true;
  const pid = Number.parseInt(String(lockContents).trim(), 10);
  if (!Number.isInteger(pid) || pid <= 0) return true;
  return !isAlive(pid);
}

// Parses the output of `gh auth status` and returns the username of the account
// marked active, or '' if none is found. gh 2.45 dropped the `--active` flag, so
// instead of asking gh to filter, we scan the full status text: each account
// block opens with a "Logged in to <host> account <name>" line and is followed
// by an "Active account: true|false" line. We track the most recently seen
// account name and return it when its block reports "Active account: true".
export function parseActiveGhAccount(statusOutput) {
  let current = '';
  for (const line of String(statusOutput).split('\n')) {
    const logged = line.match(/Logged in to \S+ account (\S+)/);
    if (logged) { current = logged[1]; continue; }
    if (/Active account:\s*true/i.test(line)) return current;
  }
  return '';
}

// Parses a PRIVATE report — the two-block shape a monitor experiment writes:
// `meta` (the secret registry), `findings` (the full private prose), and `public`
// (the only block that ships). Validated eagerly and strictly, because every field
// here feeds the fail-closed rail in sanitize(): a missing `meta.urls` would mean
// the audited hostname was never registered, and a leak in the public block would
// then sail through unnoticed. Better to reject a malformed report than to publish
// from one. Returns a normalized report safe to hand to publicEntryFromReport.
export function parsePrivateReport(jsonStr) {
  const r = JSON.parse(jsonStr);
  if (r.status !== 'done' && r.status !== 'flagged') {
    throw new Error(`private report: status must be "done" or "flagged", got ${JSON.stringify(r.status)}`);
  }
  if (!r.public || typeof r.public !== 'object') {
    throw new Error('private report: missing the `public` block');
  }
  for (const field of ['title', 'summary', 'body']) {
    if (typeof r.public[field] !== 'string' || !r.public[field].trim()) {
      throw new Error(`private report: public.${field} must be a non-empty string`);
    }
  }
  if (typeof r.findings !== 'string' || !r.findings.trim()) {
    throw new Error('private report: `findings` must be a non-empty string');
  }
  const meta = r.meta && typeof r.meta === 'object' ? r.meta : {};
  const strings = (v) => (Array.isArray(v) ? v.map(String) : []);
  return {
    status: r.status,
    meta: { urls: strings(meta.urls), secrets: strings(meta.secrets) },
    findings: r.findings,
    public: {
      title: r.public.title,
      summary: r.public.summary,
      body: r.public.body,
      tags: strings(r.public.tags),
    },
  };
}

export function parseCycleReport(jsonStr) {
  const r = JSON.parse(jsonStr);
  if (r.status !== 'done' && r.status !== 'flagged') {
    throw new Error(`cycle report: status must be "done" or "flagged", got ${JSON.stringify(r.status)}`);
  }
  return {
    status: r.status,
    summary: String(r.summary ?? ''),
    tags: Array.isArray(r.tags) ? r.tags.map(String) : [],
    body: String(r.body ?? ''),
  };
}

// Detects Lab entries the MACHINE authored itself during a cycle, from
// `git status --porcelain` run on the feature branch. Some tasks publish their
// own curated writeup — a tool/experiment post carrying a "try it" link — as
// part of the work. When they do, the runner must NOT also emit its generic
// build-log entry, or the same work is listed twice in the Lab feed (this bit us
// with Cook Mode, then again with the Generative UI Canvas). We count only NEWLY
// added files (porcelain status `??` untracked, or `A` added) under
// src/content/lab/ ending in .md; a plain edit to an existing entry doesn't count.
// Pure — the caller runs git and passes the output in.
export function newLabEntriesInStatus(porcelain) {
  const out = [];
  for (const raw of String(porcelain).split('\n')) {
    if (!raw.trim()) continue;
    const status = raw.slice(0, 2);
    let path = raw.slice(3).trim();
    // porcelain quotes paths with unusual chars; our slugs never need it, but strip defensively
    if (path.startsWith('"') && path.endsWith('"')) path = path.slice(1, -1);
    const isNewFile = status === '??' || status[0] === 'A';
    if (isNewFile && /^src\/content\/lab\/.+\.md$/.test(path)) out.push(path);
  }
  return out;
}
