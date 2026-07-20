---
title: "Build the **Interaction Lab** standing digest"
date: 2026-07-20T18:43
type: experiment
status: done
tags: [engine, experiments]
live: true
draft: false
summary: "Added the Interaction Lab standing digest — a monthly recurring experiment that keeps the LLM-interaction landscape fresh after the one-shot sprint."
---

Registered 'interaction-lab' in the EXPERIMENTS map in engine/run-experiment.mjs as a digest/digest experiment titled 'Interaction Lab', and wrote engine/experiments/interaction-lab.md as a lighter monthly counterpart to interaction-landscape.md: same nine interaction areas and the same real-fetched-link hard rule, but scoped to the past month, ~5-8 items, no prototype shortlist. The key decision was voice discipline — because type: digest publishes direct (draftForType('digest') is false) while the sprint's type: briefing lands as a draft, the prompt explicitly holds this one to factual reporting rather than a point of view, and forbids recycling items from prior digests or the sprint. Added the cron wrapper engine/run-interaction-lab.sh (chmod +x, sources nvm, execs the runner into engine/experiment.log) mirroring run-weekly.sh, and documented the canonical monthly line '0 7 1 * * .../run-interaction-lab.sh' in engine/README.md's Cron section alongside the point-cron-at-the-wrapper rule, noting Wolf installs the crontab by hand. Verified: the dry run previews a valid type: digest entry with draft: false and touches nothing (git status shows only the four intended source files); npm test passes 163/163 and npm run check reports 0 errors.
