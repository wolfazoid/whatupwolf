---
title: "Add engine/lib.mjs helper publicEntryFromReport(privateReport) that…"
titleLevels:
  aware: "One helper for turning a private report public"
  plain: "One safe route from private notes to a public post"
date: 2026-07-18T04:07
type: experiment
status: done
tags: [engine, sanitizer]
live: true
summary: "Added publicEntryFromReport() to engine/lib.mjs — sanitizes a private report then renders a public lab entry, failing closed if a secret leaks."
summaryLevels:
  aware: "Added a single helper that sanitises a private report and renders the public entry, refusing to publish at all if a secret would leak."
  plain: "Everything the machine publishes now goes through one safety check first. If it spots anything private in the text it refuses to publish, rather than risk leaking it."
---

Added publicEntryFromReport(report, { sanitize, date, status }) which runs sanitize() over a private client report and renders the surviving public snapshot via renderLabEntry(). It is fail-closed: sanitize() throws SanitizationError when a registered secret leaks and the helper lets it propagate, so no entry is emitted. sanitize is injected rather than imported because engine/lib.mjs is loaded by run-cycle.mjs under plain node, which can't parse the TypeScript sanitizer at load time. Unit-tested with a clean report (produces an entry containing none of the registered secrets) and a leaky report (throws SanitizationError); npm test (35 passing) and npm run check (0 errors) both green.
