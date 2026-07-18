# Spec — "Site Health" (the engine's second experiment; first monitor)

**Status:** Approved design (brainstorm complete 2026-07-18). Ready for planning.
**Repo:** `~/whatupwolf`
**Owner:** wolf@wearefeasting.com
**Parent:** [`self-building-lab-engine`](2026-07-17-self-building-lab-engine-design.md). Sibling of [`agent-weekly`](2026-07-17-agent-weekly-experiment-design.md).

---

## 1. What this is

A **weekly health audit of whatupwolf.com**. The engine probes the site, writes a **full
private report**, and publishes a **sanitized public snapshot** to the Lab as a
`type: monitor` entry. It is the **first real user of the `sanitize()` + `publicEntryFromReport()`
pipeline** (built in Tier-2, never exercised — Agent Weekly is all-public).

- **Purpose:** dogfood (Wolf wants to know if his site degrades) + proof of the *sellable*
  capability (monitoring with a public/private discipline a client can trust).
- **Target:** whatupwolf.com only (single site — nicely self-referential; the Lab watches its own house).
- **Cadence:** weekly, **Wednesdays 07:00** (offset from Agent Weekly's Sunday so they never collide).
- **Voice:** factual machine-log; `type: monitor` → publishes direct (`draftForType('monitor') === false`).

Why monitoring makes sense now (it was rejected as the *first* experiment): its whole point
here is to exercise the safety rail, and the private→public split turns the old objections
into features — the public snapshot proves "I find and flag real issues" **without publicly
cataloguing the site's specific weak spots** (exactly what a client needs).

---

## 2. The checks (deterministic)

All doable with Node `fetch` + `node:tls` + a small crawl — no browser:

- **Key-route HTTP status + TTFB:** `/`, `/lab`, `/work`, `/writing`, `/rss.xml`.
- **SSL cert:** days to expiry (via `node:tls` `getPeerCertificate().valid_to`).
- **Broken-link crawl:** fetch the homepage (and key routes), extract links, HEAD/GET each,
  record non-2xx (internal + external).
- **Security headers:** presence of CSP, HSTS, X-Content-Type-Options on the homepage response.
- **Page weight:** homepage HTML bytes + asset count/total bytes.

---

## 3. The private→public split (the point)

| | |
|---|---|
| **Private report** — `engine/reports/<date>.json` (gitignored). Wolf reads full detail. | full: the URL, per-route timings, the **specific** broken links, exact SSL date, which headers are missing. |
| **Public snapshot** — the Lab entry, via `sanitize()`. | findings *without* exploitable specifics: *"Weekly audit of a monitored property: all routes healthy (TTFB < 300ms), SSL valid 40+ days, 1 broken external link flagged, security headers clean."* |
| **Fail-closed** | if a specific route/URL leaks into the public block, `sanitize` **throws** → nothing publishes. |

### Report contracts

The prober emits **`Findings`** (structured facts). The machine turns `Findings` into a
**`PrivateReport`** (the existing `sanitize.ts` shape): `{ meta: { client?, urls, secrets }, findings, public: PublicSnapshot }`.
For this target, `meta.urls` holds the audited URL + the specific broken/slow routes (the
things kept out of public); `public` is the curated safe summary. The runner then:
`sanitize(privateReport)` → `PublicSnapshot` → `publicEntryFromReport(...)` → `type: monitor` entry.

---

## 4. Architecture

Reuses the experiment infra; three pieces:

1. **`engine/probes/site-health.mjs`** — deterministic `probe(target): Promise<Findings>`.
   Pure Node (`fetch`, `node:tls`), unit-testable (mock fetch/tls; test the aggregation).
2. **`run-experiment.mjs` gains a per-experiment `kind`** (`digest` | `monitor`). Registry:
   `'site-health': { kind: 'monitor', type: 'monitor', titlePrefix: 'Site Health', target: 'https://whatupwolf.com' }`.
   The `monitor` branch: `probe(target)` → pass `Findings` to `claude -p` (LLM-written report,
   §5) → parse the `PrivateReport` → write it to `engine/reports/<date>.json` → `sanitize` →
   `publicEntryFromReport` → render → `publishBranch`. The `digest` branch is today's flow.
3. **Bridge the sanitizer to the runner (`.mjs` can't import `.ts`).** `publicEntryFromReport`
   already takes `sanitize` **injected** for this reason. Resolve DRY by extracting the pure
   sanitize logic into **`src/lib/sanitize.core.mjs`** (plain JS); `src/lib/sanitize.ts`
   imports + re-exports it with types (site + tests unchanged), and the engine runner imports
   `sanitize.core.mjs` directly. One implementation, both worlds.

---

## 5. Report writing (LLM from probe data)

The prober collects hard facts; `claude -p` turns them into a readable `PrivateReport` — nice
prose, a curated `public` block, and **light judgment** ("TTFB on /work up ~40% w/w, worth a
look"). The prompt (`engine/experiments/site-health.md`) gets the `Findings` and must:
- Never invent numbers — use only the probe data given.
- Put specifics (exact URLs/routes/dates) in `meta`/`findings`; keep `public` free of them.
- `status: "flagged"` if the probe itself failed (site unreachable, etc.).

---

## 6. Publishing & scheduling

- `type: monitor` → publishes direct (hands-off, auto-merges; the PR touches only the Lab entry → allowlisted).
- Weekly cron via its own wrapper `engine/run-health.sh` (same nvm-sourcing pattern as
  `run-weekly.sh`): `0 7 * * 3 …/engine/run-health.sh` (Wednesdays 07:00). Documented in README.
- Covered by `engine/PAUSED`.

---

## 7. What it exercises / why it matters

- **First real use of `sanitize()` and `publicEntryFromReport()`** — the safety rail, proven live.
- Demonstrates the **sellable** monitoring capability with the trust discipline clients need.
- Second experiment → moves us toward the **rule-of-three** for extracting a general
  experiment-runner framework (still deferred until 3 exist).

---

## 8. Definition of done

- [ ] `engine/probes/site-health.mjs` `probe()` returns real `Findings` for whatupwolf.com; unit-tested.
- [ ] `sanitize` core extracted to `.mjs`; `sanitize.ts` re-exports it; site + existing sanitize tests still pass.
- [ ] `run-experiment.mjs` `monitor` kind: probe → LLM report → private file → sanitize → `type: monitor` entry → PR.
- [ ] A real run publishes a sanitized monitor entry that **contains no specific route/URL/date**
      from the private report (verify the fail-closed scan holds), auto-merges, live on `/lab` + RSS.
- [ ] Private report written to `engine/reports/<date>.json` (gitignored) with full detail.
- [ ] Wednesday-07:00 cron via `engine/run-health.sh` documented; `PAUSED` halts it.

## 9. Out of scope

- Client/third-party targets (this is Wolf's own site; client targets come once proven).
- Deep perf (Lighthouse / Core Web Vitals — needs a browser).
- On-flag/event-driven publishing and email delivery of the private report (later).
- The general experiment-runner framework (extract after a 3rd experiment).

## 10. Decisions (settled) / open

**Settled:** target whatupwolf.com; fuller audit checks; weekly (Wed 07:00); `type: monitor`
direct; LLM-written report from deterministic probe; private report local + gitignored.

**Open (settle in plan):** exact broken-link crawl depth (homepage-only vs key-routes); how
`Findings` reach the prompt (embed in prompt text vs a file the machine reads); whether the
`kind` branch lives in `run-experiment.mjs` or a thin `run-monitor.mjs` sibling (lean: `kind`
in `run-experiment.mjs` for reuse).
