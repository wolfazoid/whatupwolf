---
title: "Build the sanitization filter — implement `src/lib/sanitize.ts` so `npm test` passes (allowlist + fail-closed; do not weaken the seeded tests)"
date: 2026-07-18T01:08
type: experiment
status: done
tags: [engine, sanitize]
live: true
summary: "Implemented the allowlist + fail-closed sanitizer so lab reports emit only curated public fields and never leak registered secrets."
---

Replaced the sanitize() stub with a two-stage filter: it copies only the allowlisted public fields (title, summary, and body/tags when present), never meta or findings, then serializes that output and throws SanitizationError if any registered secret survives. Registered secrets are gathered from meta.client, meta.urls (including parsed hostnames), and meta.secrets, trimmed and de-blanked. Left the seeded tests untouched; both npm test (14 passing) and npm run check (0 errors) are green.
