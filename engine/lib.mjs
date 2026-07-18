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

const yamlStr = (s) => `"${String(s).replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;

const yamlFlowScalar = (s) => (/^[A-Za-z0-9_-]+$/.test(String(s)) ? String(s) : yamlStr(s));

export function renderLabEntry({ title, date, type = 'experiment', status, tags = [], live = true, summary, body }) {
  const iso = date.toISOString().slice(0, 16); // YYYY-MM-DDTHH:mm
  return [
    '---',
    `title: ${yamlStr(title)}`,
    `date: ${iso}`,
    `type: ${type}`,
    `status: ${status}`,
    `tags: [${tags.map(yamlFlowScalar).join(', ')}]`,
    `live: ${live}`,
    `summary: ${yamlStr(summary)}`,
    '---',
    '',
    String(body).trim(),
    '',
  ].join('\n');
}

// Independent verify gate: the machine reports its own status, but the runner
// re-runs `npm test` and `npm run check` and gets the final say. Any failing
// gate overrides the report to "flagged" so broken work never ships as "done".
export function resolveStatus(reportStatus, testsPassed, checkPassed) {
  return testsPassed && checkPassed ? reportStatus : 'flagged';
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
