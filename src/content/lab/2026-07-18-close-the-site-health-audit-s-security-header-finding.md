---
title: "Close the Site Health audit's security-header finding"
titleLevels:
  aware: "Closed the security-header finding"
  plain: "Fixed the security gap the checker found"
date: 2026-07-18T07:45
type: experiment
status: done
tags: [engine, security-headers]
live: true
draft: false
summary: "Added public/_headers so Cloudflare serves HSTS, nosniff, SAMEORIGIN, Referrer-Policy and a report-only CSP on all routes, with tests guarding the policy."
summaryLevels:
  aware: "Added the missing security headers across every route — HSTS, nosniff, frame and referrer policy, plus a report-only CSP — with tests guarding them."
  plain: "The health check had found this site was missing some standard browser protections. Added them, with tests so they cannot quietly disappear again."
---

Inspected the build output before writing any CSP: dist/ contains no external origins, fonts or images, but every hydrating page carries two unhashed inline <script> blocks (Astro's island loader and hydration runtime) plus one inline <style>. An enforced script-src 'self' would therefore break hydration on the live site with CI staying green, so the CSP ships as Content-Security-Policy-Report-Only while the four hardening headers are enforced outright. Added src/lib/security-headers.test.mjs, which parses public/_headers and asserts the required directives, including a guard that fails if anyone promotes the CSP out of report-only without allowing the inline hydration scripts; the test was mutation-checked and does fail on both a weakened HSTS and that exact strict-CSP case. npm test (85 passed), npm run check (0 errors) and npm run build all pass, and _headers lands in dist/ as expected. This PR touches public/, a gated path, so it is expected to wait for Wolf's review.
