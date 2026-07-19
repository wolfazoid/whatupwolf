---
title: "Write engine/experiments/site-health.md"
titleLevels:
  aware: "The monitor's operating manual"
  plain: "Wrote the rulebook for the health check"
date: 2026-07-18T06:59
type: experiment
status: done
tags: [engine, monitoring]
live: true
draft: false
summary: "Wrote engine/experiments/site-health.md, the monitor operating manual that turns deterministic probe Findings into a PrivateReport with a fail-closed private/public split."
summaryLevels:
  aware: "Wrote the monitor's operating manual — how measured findings become a report, with a strict split between private detail and the public summary."
  plain: "Wrote the instructions the machine follows when it checks a website: what to measure, and the strict line between the private details and what may be said in public."
---

Wrote engine/experiments/site-health.md following the shape of the sibling manual engine/experiments/agent-weekly.md, per Task 3 of the Site Health plan. Read the probe (engine/probes/site-health.mjs) and the sanitizer (src/lib/sanitize.core.mjs) together rather than working from the spec alone, which surfaced two things the manual had to encode: the sanitizer registers each meta.urls entry AND its bare hostname as a secret, so listing the target is what makes the hostname unsayable in the public block, while a bare route path like /work would slip past that substring scan entirely — so the manual directs those into meta.secrets, with a minimum-distinctiveness guard since registering a string like '/' would match ordinary prose and block every publish. The probe also reports several zeros that mean unknown rather than healthy (an unreachable homepage yields all-false headers, zero page weight, and an empty broken-link list), so the manual carries a traps table and a rule against reporting an unknown as healthy. Status thresholds are spelled out concretely so the flagged/done call is deterministic week to week instead of re-litigated each run. Doc-only change; npm test (70 passed) and npm run check (0 errors) both pass.
