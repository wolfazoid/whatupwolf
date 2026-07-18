# Site Health Monitor — Implementation Plan

> **For agentic workers:** built by the self-building engine from the BACKLOG items below (Tier-B auto-merge), then the operator installs the cron and triggers the first run. Spec: `docs/superpowers/specs/2026-07-18-site-health-monitor-design.md`.

**Goal:** A weekly whatupwolf.com health audit that publishes a sanitized `type: monitor` Lab entry — the first real user of `sanitize()`/`publicEntryFromReport()`.

**Execution:** All five build tasks are auto-zone (`engine/**`, `src/lib/**`) → the engine builds them and they auto-merge on green. The operator then installs the Wednesday cron and runs the first audit. No gated paths (the private-report gitignore goes in `engine/.gitignore`, not root, to stay auto-zone).

## Global Constraints

- Engine code plain ESM `.mjs`; `sanitize` core must be `.mjs` so the runner can import it.
- Prober is deterministic (Node `fetch` + `node:tls`), unit-tested. Report is LLM-written from probe facts (no invented numbers).
- Public snapshot must contain **no specific route/URL/date** — `sanitize` fail-closed enforces it.
- `type: monitor` publishes direct (`draftForType('monitor') === false`, already true).

---

### Task 1 — Extract the sanitizer core to `.mjs`  · auto (`src/lib`)

**Files:** Create `src/lib/sanitize.core.mjs`; Modify `src/lib/sanitize.ts`; keep `src/lib/sanitize.test.ts` green.

Move the pure logic (`sanitize`, `SanitizationError`, the registered-secret scan) into
`src/lib/sanitize.core.mjs` (plain JS, no types). `src/lib/sanitize.ts` imports and re-exports
it, re-attaching the `PrivateReport`/`PublicSnapshot`/`SanitizationError`/`sanitize` types — so
the site and the existing sanitize tests are unchanged. Verify `npm test` + `npm run check`.

**Backlog item:**
> Extract the pure sanitizer logic from src/lib/sanitize.ts into a new plain-JS src/lib/sanitize.core.mjs (so engine .mjs code can import it), and make src/lib/sanitize.ts re-export it with the existing TypeScript types. The existing src/lib/sanitize.test.ts and `npm run check` must stay green — do not change behavior.

---

### Task 2 — The deterministic prober  · auto (`engine`)

**Files:** Create `engine/probes/site-health.mjs`, `engine/probes/site-health.test.mjs`.

`export async function probe(target): Promise<Findings>` where
`Findings = { routes: [{path, status, ttfbMs}], ssl: {daysToExpiry, validTo}, brokenLinks: [{url, status}], headers: {csp, hsts, xcto}, pageWeight: {htmlBytes, assetCount} }`.
Uses `fetch` (status/TTFB/headers/HTML) and `node:tls` (cert `valid_to`). Key routes: `/`,
`/lab`, `/work`, `/writing`, `/rss.xml`. Broken-link crawl: extract links from the homepage,
HEAD/GET each, record non-2xx. Unit-test the aggregation with mocked fetch/tls.

**Backlog item:**
> Build engine/probes/site-health.mjs exporting `async probe(target)` that deterministically audits a URL with Node fetch + node:tls and returns Findings {routes:[{path,status,ttfbMs}], ssl:{daysToExpiry,validTo}, brokenLinks:[{url,status}], headers:{csp,hsts,xcto}, pageWeight:{htmlBytes,assetCount}}. Check routes /, /lab, /work, /writing, /rss.xml; crawl homepage links and flag non-2xx; read SSL expiry via node:tls. Unit-test the aggregation with mocked fetch/tls in engine/probes/site-health.test.mjs.

---

### Task 3 — The monitor research prompt  · auto (`engine`)

**Files:** Create `engine/experiments/site-health.md`.

The operating manual: you are given deterministic `Findings` for whatupwolf.com; write a
`PrivateReport` = `{ meta: { urls: [audited URL + specific broken/slow routes], secrets: [] }, findings: "<full prose using ONLY the probe numbers>", public: { title, summary, body, tags:["monitoring"] } }` to `engine/.experiment-report.json`. Rules: never invent numbers; keep
all specific routes/URLs/dates in `meta`/`findings`, NEVER in `public`; `public` proves
"found and flagged issues" without the specifics; `status:"flagged"` if the probe failed.

**Backlog item:**
> Write engine/experiments/site-health.md — the monitor operating manual. Given deterministic Findings for whatupwolf.com, the machine writes a PrivateReport {meta:{urls,secrets}, findings, public:{title,summary,body,tags}} to engine/.experiment-report.json using ONLY the probe numbers (never invent). All specific routes/URLs/dates go in meta/findings and NEVER in public; the public block proves issues were found and flagged without the exploitable specifics; status:"flagged" if the probe failed.

---

### Task 4 — `monitor` kind in the runner  · auto (`engine`)

**Files:** Modify `engine/run-experiment.mjs`; Create/Modify `engine/.gitignore`.

Add a per-experiment `kind`. Registry gains
`'site-health': { kind:'monitor', type:'monitor', titlePrefix:'Site Health', target:'https://whatupwolf.com' }`.
For `kind:'monitor'`: `probe(target)` → invoke `claude -p` with the site-health prompt + the
`Findings` → parse the `PrivateReport` → write it to `engine/reports/<date>.json` → import
`sanitize` from `src/lib/sanitize.core.mjs` and call `publicEntryFromReport(report, { sanitize, date, type:'monitor' })` → render → `publishBranch`. `kind:'digest'` keeps today's flow.
Add `engine/reports/` and `engine/.experiment-report.json` to `engine/.gitignore`. Verify
`node engine/run-experiment.mjs site-health --dry-run` previews a `type: monitor` entry.

**Backlog item:**
> Add a per-experiment `kind` (digest|monitor) to engine/run-experiment.mjs with registry entry {'site-health':{kind:'monitor',type:'monitor',titlePrefix:'Site Health',target:'https://whatupwolf.com'}}. For kind monitor: run probe(target) from engine/probes/site-health.mjs, invoke claude -p with engine/experiments/site-health.md + the Findings, parse the PrivateReport, write it to engine/reports/<date>.json, then import sanitize from src/lib/sanitize.core.mjs and use publicEntryFromReport(report,{sanitize,date,type:'monitor'}) to render the Lab entry, and publishBranch. Keep kind digest as-is. Add engine/reports/ and engine/.experiment-report.json to engine/.gitignore. Verify `node engine/run-experiment.mjs site-health --dry-run` previews a valid type:monitor entry with no side effects.

---

### Task 5 — Wrapper + cron docs  · auto (`engine`)

**Files:** Create `engine/run-health.sh`; Modify `engine/README.md`.

`engine/run-health.sh` mirrors `run-weekly.sh` (source nvm, cd repo, run
`engine/run-experiment.mjs site-health`). README documents the canonical Wednesday line:
`0 7 * * 3 /home/wolf/whatupwolf/engine/run-health.sh`.

**Backlog item:**
> Create engine/run-health.sh (mirror engine/run-weekly.sh: source nvm, cd repo root, exec node engine/run-experiment.mjs site-health >> engine/experiment.log 2>&1), chmod-executable in spirit (document it). Update engine/README.md Cron section with the canonical Wednesday 07:00 line: `0 7 * * 3 /home/wolf/whatupwolf/engine/run-health.sh`, same "point cron at the wrapper" rule.

---

### Operator steps (not backlog — done by the operator after the above merge)

- [ ] `chmod +x engine/run-health.sh` (git may not preserve the bit through the machine's write).
- [ ] Install the Wednesday cron line (append to crontab, absolute path).
- [ ] Trigger the first run: `node engine/run-experiment.mjs site-health`.
- [ ] **Verify fail-closed:** the published entry contains no specific route/URL/date from `engine/reports/<date>.json`; it auto-merged; live on `/lab` + RSS.

## Self-Review

Spec coverage: §2 checks → T2; §3 split + contracts → T2/T3/T4; §4 architecture (prober, kind, sanitize bridge) → T1/T2/T4; §5 LLM report → T3; §6 schedule → T5 + operator; §8 DoD → all. Types consistent: `Findings` (T2→T4), `PrivateReport`/`publicEntryFromReport`/`sanitize` (T1→T4), `type:'monitor'` throughout. No gated paths (gitignore in `engine/.gitignore`). ✓
