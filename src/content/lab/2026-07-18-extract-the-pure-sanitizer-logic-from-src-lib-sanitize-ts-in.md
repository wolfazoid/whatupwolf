---
title: "Extract the pure sanitizer logic from src/lib/sanitize.ts into a new…"
titleLevels:
  aware: "Sanitiser split into a shareable core"
  plain: "Let both halves of the system share one safety filter"
date: 2026-07-18T06:52
type: experiment
status: done
tags: [engine, sanitizer]
live: true
draft: false
summary: "Extracted the sanitizer into plain-JS src/lib/sanitize.core.mjs so engine .mjs code can import it; sanitize.ts is now a typed re-export."
summaryLevels:
  aware: "Split the sanitiser into a plain-JS core the engine can import, with the typed wrapper left in place for the site."
  plain: "The safety filter existed only where the website could use it. Moved it so the machine uses the very same filter — one filter, rather than two that could drift apart."
---

Moved the sanitize implementation verbatim from src/lib/sanitize.ts into a new plain-JS src/lib/sanitize.core.mjs, with no behavior change. Because tsconfig extends astro/tsconfigs/strict without allowJs, importing the .mjs from TypeScript needed a declaration file, so the canonical types (PublicSnapshot, PrivateReport, SanitizationError, sanitize) now live in src/lib/sanitize.core.d.mts next to the implementation; src/lib/sanitize.ts is a two-line re-export of the values and types. Verified a bare `node -e` import of the .mjs both sanitizes a clean report and throws SanitizationError on a quote-bearing leak. npm test passes (49 tests, incl. the 5 unchanged sanitize tests) and npm run check reports 0 errors.
