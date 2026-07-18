# Engine Backlog

The runner picks the **first unchecked `- [ ]` item** each cycle. Human-editable between cycles.

**Convention:** only `- [ ]` / `- [x]` lines are tasks. Anything under **Later** is a plain
bullet (no checkbox) so the runner will NOT pick it — promote it to `- [ ]` when it's ready.

## Done

- [x] Build the sanitization filter — implement `src/lib/sanitize.ts` so `npm test` passes (allowlist + fail-closed; do not weaken the seeded tests)

## Tier 1 — Harden the loop (do these first; make every later cycle trustworthy)

- [x] Add an independent verify gate to engine/run-cycle.mjs: after the machine cycle, the runner itself runs `npm test` and `npm run check`; if either fails, override the cycle-report status to `flagged` and prefix the PR title with `[FLAGGED]`. Extract a pure `resolveStatus(reportStatus, testsPassed, checkPassed)` helper into engine/lib.mjs and unit-test it in engine/lib.test.mjs.
- [x] Fix currentGhUser() in engine/run-cycle.mjs for gh 2.45: do not use the unsupported `gh auth status --active` flag; instead parse `gh auth status` output for the account marked active. Extract the parsing into a pure helper in engine/lib.mjs and unit-test it against sample gh output.
- [ ] Harden the sanitizer secret-scan in src/lib/sanitize.ts against JSON-escaping: scan each allowlisted field's raw string value for registered secrets rather than only JSON.stringify(out), so a secret containing quotes or backslashes cannot evade. Add tests with secrets containing `"` and `\`. Do not weaken the existing seeded tests.
- [ ] Quote unsafe tags in renderLabEntry (engine/lib.mjs): a tag that is purely numeric or a YAML reserved word (true/false/null/yes/no/~) must be quoted so it stays a string and satisfies z.array(z.string()) at build time. Add a unit test.
- [ ] Make engine/run-cycle.mjs re-runnable: if branch lab/<slug> already exists, reuse or recreate it cleanly instead of crashing; on any cycle failure, check the working tree back out to main. Update engine/README.md to note the behavior.

## Tier 2 — Wire the public/private pipeline (bridge the sanitizer to real experiments)

- [ ] Add engine/lib.mjs helper publicEntryFromReport(privateReport) that runs sanitize() then renderLabEntry() to produce a public lab entry, throwing (fail-closed) if sanitization fails. Unit-test with a clean report and a leaky report.
- [ ] Encode the direct-vs-review gate: add a pure per-type policy (monitor/experiment publish direct; briefing or opinion content sets draft:true) applied when the runner writes the lab entry, and wire it into engine/run-cycle.mjs. Unit-test the policy function.

## Later (not queued — promote to `- [ ]` when ready)

- **First real experiment** — the engine's actual payload. Direction is being designed in a dedicated brainstorm (site-monitoring was rejected). Promote once the brainstorm lands.
- **Experiment-runner framework** — deliberately deferred (YAGNI) until 2–3 real experiments exist to shape the interface. Extract it from the repeated pattern, don't design it speculatively.
