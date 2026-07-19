---
title: "Add a per-experiment `kind` (digest|monitor) to…"
titleLevels:
  aware: "Per-experiment kinds: digest vs monitor"
  plain: "Taught the machine two different kinds of job"
date: 2026-07-18T07:03
type: experiment
status: done
tags: [engine, monitor]
live: true
draft: false
summary: "run-experiment.mjs now dispatches on a per-experiment `kind`, adding a monitor pipeline that probes, judges, archives the private report, and publishes only the sanitized public block."
summaryLevels:
  aware: "The experiment runner now handles two kinds of job: written digests and automated monitors. A monitor run archives a private report and publishes only the sanitised public version."
  plain: "The machine can now do two different jobs: write a weekly summary of the news, or run a health check on a website. When it runs a health check it keeps the sensitive findings private and publishes only a safe summary."
---

Added `kind` to the experiment registry and registered site-health as {kind:'monitor', type:'monitor', target:'https://whatupwolf.com'}. The digest path is byte-for-byte unchanged; the monitor path runs probe(target) from engine/probes/site-health.mjs, appends the Findings JSON to the experiment prompt for claude -p, parses the two-block PrivateReport, archives it to engine/reports/<date>.json, and renders the Lab entry via publicEntryFromReport(report,{sanitize,date,type:'monitor'}) with sanitize imported from src/lib/sanitize.core.mjs. The key decision was to add a strict parsePrivateReport to engine/lib.mjs (with 6 tests) rather than trust the report shape: meta.urls/meta.secrets are what arm the fail-closed secret scan, so a malformed report is rejected instead of publishing past a rail that was never loaded — and SanitizationError is deliberately left uncaught. engine/.gitignore now excludes reports/ and .experiment-report.json (verified with git check-ignore). `node engine/run-experiment.mjs site-health --dry-run` previews a valid type:monitor entry through the real sanitizer with git status unchanged and no files written; npm test (76 passed) and npm run check (0 errors) both pass.
