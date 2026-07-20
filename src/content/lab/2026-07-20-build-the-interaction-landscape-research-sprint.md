---
title: "Build the **Interaction Landscape** research sprint"
date: 2026-07-20T16:46
type: experiment
status: done
tags: [engine, experiments, interaction-landscape]
live: true
draft: false
summary: "Added the one-shot Interaction Landscape research sprint — a survey of novel LLM interaction paradigms that renders as a draft briefing for review."
---

Registered `interaction-landscape` in the EXPERIMENTS table in engine/run-experiment.mjs as a `digest`-kind experiment rendering `type: briefing`, and wrote engine/experiments/interaction-landscape.md — an operating manual mirroring Agent Weekly's discipline (discovery-first broad search, worldwide sources, verify every fetched link, factual machine-log voice, no padding) but scoped to interaction paradigms across nine areas rather than releases, ending in a mandatory ranked `## Prototype Shortlist` with each candidate marked client-only / BYO-key / needs-server. The title template hardcoded `— week of <date>`, which reads wrong for a one-shot, so it was generalized to an optional per-registry `cadence` word: cadenced experiments keep `Agent Weekly — week of 2026-07-20` while the sprint titles as `Interaction Landscape — 2026-07-20`; the monitor dry-run preview now takes the same computed title instead of its own hardcoded copy. `draftForType('briefing')` already returned true via the fail-safe default, so no logic change was needed — the existing unit test was kept and annotated to record that Wolf's review of the shortlist is the publishing gate. Verified `node engine/run-experiment.mjs interaction-landscape --dry-run` previews a `type: briefing`, `draft: true` entry with no side effects and that Agent Weekly and Site Health titles are unchanged; `npm test` (163 tests, 8 files) and `npm run check` (0 errors) both pass.
