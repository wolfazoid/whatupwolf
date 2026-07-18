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

- [ ] Add `digest` to the direct-publish policy in engine/lib.mjs so `draftForType('digest')` returns false (digests publish direct, not draft). Add a unit test.
- [ ] Extract the commit/push/PR/account-restore machinery from engine/run-cycle.mjs section 7 into a reusable `publishBranch({repoDir, branch, commitMsg, prTitle, prBody, ghUser, dry})` in a new engine/publish.mjs, and rewire run-cycle.mjs to call it. Preserve dry-run (zero side effects) and the gh-account restore + warning. Verify `node engine/run-cycle.mjs --dry-run` is unchanged and tests pass.
- [ ] Build the Agent Weekly experiment: engine/experiments/agent-weekly.md (the research prompt — weekly AI-agent digest per the spec's sources and format, real-link hard rule, writes engine/.experiment-report.json as {status,summary,tags,body}) and engine/run-experiment.mjs <name> (kill-switch + sync main, invoke `claude -p` with the prompt, render a `type: digest` lab entry via renderLabEntry with draft:false, write src/content/lab/<date>-<name>.md, open a PR via publishBranch — no backlog check-off). Support --dry-run (no side effects), gitignore engine/.experiment-report.json + engine/experiment.log, document the Sunday-07:00 cron in engine/README.md. Verify the dry run previews a valid digest entry.

## Later (not queued — promote to `- [ ]` when ready)

- **Agent Weekly schema change (GATED — Wolf merges)** — add `digest` to the lab `type` enum in src/content.config.ts. Handled as a separate hand-merged PR since it touches a gated path; kept out of the auto-queue so a needs-human PR can't block the loop.
- **Experiment-runner framework** — deliberately deferred (YAGNI) until 2–3 real experiments exist to shape the interface. Extract it from the repeated pattern, don't design it speculatively.
