---
title: "Build the Agent Weekly experiment"
titleLevels:
  aware: "The Agent Weekly experiment, end to end"
  plain: "Set up the weekly AI news round-up"
date: 2026-07-18T05:08
type: experiment
status: done
tags: [engine, experiment, agent-weekly]
live: true
draft: false
summary: "Built the Agent Weekly experiment: a research-prompt + run-experiment.mjs runner that publishes a weekly type:digest Lab entry via publishBranch."
summaryLevels:
  aware: "Built Agent Weekly end to end: the research brief plus the runner that publishes the digest to the Lab each week."
  plain: "Set up a job that runs every Sunday: the machine researches the week's AI news, checks its sources, and posts a summary here by itself."
---

Added engine/experiments/agent-weekly.md (weekly AI-agent digest prompt with the spec's source list, real-link hard rule, and the {status,summary,tags,body} report contract) and engine/run-experiment.mjs <name>, which reuses the PAUSED kill-switch + main-sync pattern, invokes claude -p, then renders a type:digest entry via renderLabEntry (draft:false through draftForType) and opens a PR with publishBranch — no backlog check-off, since experiments aren't backlog items. Added --dry-run (synthetic report, zero side effects), gitignored engine/.experiment-report.json + engine/experiment.log, and documented the Sunday-07:00 cron in engine/README.md. Verified: `node engine/run-experiment.mjs agent-weekly --dry-run` previews a valid type:digest entry (draft:false) with a clean git tree; unknown/missing names fail fast; npm test (41 passing) and npm run check (0 errors) both green.
