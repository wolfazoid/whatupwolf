# Engine Backlog

The runner picks the **first unchecked `- [ ]` item** each cycle. Human-editable between cycles.

**Convention:** only `- [ ]` / `- [x]` lines are tasks. Anything under **Later** is a plain
bullet (no checkbox) so the runner will NOT pick it — promote it to `- [ ]` when it's ready.

## Done

- [x] Build the sanitization filter — implement `src/lib/sanitize.ts` so `npm test` passes (allowlist + fail-closed; do not weaken the seeded tests)

## Tier 1 — Harden the loop (do these first; make every later cycle trustworthy)

- [x] Add an independent verify gate to engine/run-cycle.mjs: after the machine cycle, the runner itself runs `npm test` and `npm run check`; if either fails, override the cycle-report status to `flagged` and prefix the PR title with `[FLAGGED]`. Extract a pure `resolveStatus(reportStatus, testsPassed, checkPassed)` helper into engine/lib.mjs and unit-test it in engine/lib.test.mjs.
- [x] Fix currentGhUser() in engine/run-cycle.mjs for gh 2.45: do not use the unsupported `gh auth status --active` flag; instead parse `gh auth status` output for the account marked active. Extract the parsing into a pure helper in engine/lib.mjs and unit-test it against sample gh output.
- [x] Harden the sanitizer secret-scan in src/lib/sanitize.ts against JSON-escaping: scan each allowlisted field's raw string value for registered secrets rather than only JSON.stringify(out), so a secret containing quotes or backslashes cannot evade. Add tests with secrets containing `"` and `\`. Do not weaken the existing seeded tests.
- [x] Quote unsafe tags in renderLabEntry (engine/lib.mjs): a tag that is purely numeric or a YAML reserved word (true/false/null/yes/no/~) must be quoted so it stays a string and satisfies z.array(z.string()) at build time. Add a unit test.
- [x] Make engine/run-cycle.mjs re-runnable: if branch lab/<slug> already exists, reuse or recreate it cleanly instead of crashing; on any cycle failure, check the working tree back out to main. Update engine/README.md to note the behavior.

## Tier 2 — Wire the public/private pipeline (bridge the sanitizer to real experiments)

- [x] Add engine/lib.mjs helper publicEntryFromReport(privateReport) that runs sanitize() then renderLabEntry() to produce a public lab entry, throwing (fail-closed) if sanitization fails. Unit-test with a clean report and a leaky report.
- [x] Encode the direct-vs-review gate: add a pure per-type policy (monitor/experiment publish direct; briefing or opinion content sets draft:true) applied when the runner writes the lab entry, and wire it into engine/run-cycle.mjs. Unit-test the policy function.

## Tier 3 — First experiment: Agent Weekly (plan: docs/superpowers/plans/2026-07-17-agent-weekly-experiment.md)

- [x] Add `digest` to the direct-publish policy in engine/lib.mjs so `draftForType('digest')` returns false (digests publish direct, not draft). Add a unit test.
- [x] Extract the commit/push/PR/account-restore machinery from engine/run-cycle.mjs section 7 into a reusable `publishBranch({repoDir, branch, commitMsg, prTitle, prBody, ghUser, dry})` in a new engine/publish.mjs, and rewire run-cycle.mjs to call it. Preserve dry-run (zero side effects) and the gh-account restore + warning. Verify `node engine/run-cycle.mjs --dry-run` is unchanged and tests pass.
- [x] Build the Agent Weekly experiment: engine/experiments/agent-weekly.md (the research prompt — weekly AI-agent digest per the spec's sources and format, real-link hard rule, writes engine/.experiment-report.json as {status,summary,tags,body}) and engine/run-experiment.mjs <name> (kill-switch + sync main, invoke `claude -p` with the prompt, render a `type: digest` lab entry via renderLabEntry with draft:false, write src/content/lab/<date>-<name>.md, open a PR via publishBranch — no backlog check-off). Support --dry-run (no side effects), gitignore engine/.experiment-report.json + engine/experiment.log, document the Sunday-07:00 cron in engine/README.md. Verify the dry run previews a valid digest entry.

## Tier 4 — Engine hardening

- [x] Make engine/run-experiment.mjs resilient to an existing remote branch: a same-day re-run collides on the date-based branch name (`git push` non-fast-forward, cycle fails). Force-push the throwaway experiment branch (it's fully regenerated from main each run, so nothing is lost), or append a short unique suffix to the branch name. Preserve `--dry-run` (no side effects) and note the behavior in engine/README.md.

## Tier 5 — Site Health monitor (plan: docs/superpowers/plans/2026-07-18-site-health-monitor.md)

- [x] Extract the pure sanitizer logic from src/lib/sanitize.ts into a new plain-JS src/lib/sanitize.core.mjs (so engine .mjs code can import it), and make src/lib/sanitize.ts re-export it with the existing TypeScript types. The existing src/lib/sanitize.test.ts and `npm run check` must stay green — do not change behavior.
- [x] Build engine/probes/site-health.mjs exporting `async probe(target)` that deterministically audits a URL with Node fetch + node:tls and returns Findings {routes:[{path,status,ttfbMs}], ssl:{daysToExpiry,validTo}, brokenLinks:[{url,status}], headers:{csp,hsts,xcto}, pageWeight:{htmlBytes,assetCount}}. Check routes /, /lab, /work, /writing, /rss.xml; crawl homepage links and flag non-2xx; read SSL expiry via node:tls. Unit-test the aggregation with mocked fetch/tls in engine/probes/site-health.test.mjs.
- [x] Write engine/experiments/site-health.md — the monitor operating manual. Given deterministic Findings for whatupwolf.com, the machine writes a PrivateReport {meta:{urls,secrets}, findings, public:{title,summary,body,tags}} to engine/.experiment-report.json using ONLY the probe numbers (never invent). All specific routes/URLs/dates go in meta/findings and NEVER in public; the public block proves issues were found and flagged without the exploitable specifics; status:"flagged" if the probe failed.
- [ ] Add a per-experiment `kind` (digest|monitor) to engine/run-experiment.mjs with registry entry {'site-health':{kind:'monitor',type:'monitor',titlePrefix:'Site Health',target:'https://whatupwolf.com'}}. For kind monitor: run probe(target) from engine/probes/site-health.mjs, invoke claude -p with engine/experiments/site-health.md + the Findings, parse the PrivateReport, write it to engine/reports/<date>.json, then import sanitize from src/lib/sanitize.core.mjs and use publicEntryFromReport(report,{sanitize,date,type:'monitor'}) to render the Lab entry, and publishBranch. Keep kind digest as-is. Add engine/reports/ and engine/.experiment-report.json to engine/.gitignore. Verify `node engine/run-experiment.mjs site-health --dry-run` previews a valid type:monitor entry with no side effects.
- [ ] Create engine/run-health.sh (mirror engine/run-weekly.sh: source nvm, cd repo root, exec node engine/run-experiment.mjs site-health >> engine/experiment.log 2>&1). Update engine/README.md Cron section with the canonical Wednesday 07:00 line `0 7 * * 3 /home/wolf/whatupwolf/engine/run-health.sh` and the same "point cron at the wrapper" rule.

## Later (not queued — promote to `- [ ]` when ready)

- **Agent Weekly schema change (GATED — Wolf merges)** — add `digest` to the lab `type` enum in src/content.config.ts. Handled as a separate hand-merged PR since it touches a gated path; kept out of the auto-queue so a needs-human PR can't block the loop.
- **Experiment-runner framework** — deliberately deferred (YAGNI) until 2–3 real experiments exist to shape the interface. Extract it from the repeated pattern, don't design it speculatively.
