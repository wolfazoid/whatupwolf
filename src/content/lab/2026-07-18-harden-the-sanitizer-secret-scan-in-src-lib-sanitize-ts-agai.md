---
title: "Harden the sanitizer secret-scan in src/lib/sanitize.ts against…"
date: 2026-07-18T02:36
type: experiment
status: done
tags: [engine, sanitize]
live: true
summary: "Hardened the lab-report sanitizer so secrets containing quotes or backslashes can't evade the leak scan via JSON escaping."
---

The secret scan previously ran against JSON.stringify(out), where JSON escaping rewrites `"` to `\"` and `\` to `\\`, so a registered secret containing those characters would no longer match as a substring and could slip into a public field. Replaced that with a scan over each allowlisted field's raw string value (title, summary, body, and every tag). Added three tests covering a quote-bearing secret, a backslash-bearing secret, and a quote-bearing secret smuggled into a tag; all 31 tests pass and astro check is clean with the seeded tests unchanged.
