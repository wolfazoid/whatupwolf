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

// The direct-vs-review gate, as a pure per-type policy. Monitor and experiment
// entries are factual machine-log posts — what ran, what changed, pass/fail — so
// they publish direct (draft:false). Briefing- and opinion-style entries carry a
// point of view, so they're gated behind draft:true for Wolf to review before they
// go public (see the Voice & publishing section of engine/CYCLE.md). Any unknown
// type fails safe to gated, so a new content type is never published unreviewed by
// accident. Returns the draft flag to stamp on the entry's frontmatter.
const DIRECT_PUBLISH_TYPES = new Set(['monitor', 'experiment']);

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
