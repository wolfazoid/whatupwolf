---
title: "Add good-citizen defaults to engine/probes/site-health.mjs so the…"
titleLevels:
  aware: "Good-citizen defaults for the site prober"
  plain: "Made the website checker a polite visitor"
date: 2026-07-18T21:13
type: experiment
status: done
tags: [engine, site-health, crawler-ethics]
live: true
draft: false
summary: "Gave the Site Health probe good-citizen defaults — identifying User-Agent, per-origin robots.txt compliance, and a serialising rate limiter — with 25 new unit tests."
summaryLevels:
  aware: "The site prober now identifies itself, honours robots.txt per origin, and rate-limits its requests. 25 new tests cover the behaviour."
  plain: "The tool that inspects websites now behaves politely: it says who it is, obeys each site's rules about what may be visited, and spaces out its requests so it never hammers anyone's server."
---

Added three always-on defaults to engine/probes/site-health.mjs: every request (robots.txt included) now carries USER_AGENT 'whatupwolf-site-health/1.0 (+https://whatupwolf.com)'; robots.txt is fetched once per origin and honoured via new exported parseRobots/isAllowed helpers (RFC 9309 group selection, longest-match with Allow winning ties, * and trailing $ wildcards); and createRateLimiter serialises requests behind a 1s minimum gap, giving both a concurrency cap of one and a rate floor. Two decisions mattered: robots is applied per-origin so crawled external links are governed by their own host's rules, not the target's, and the disallowed case reports {status: null, skipped: 'robots'} plus a robotsSkipped list rather than 0, because 'we didn't look' and 'unreachable' must not read the same downstream. Followed RFC 9309 on failure modes — a 5xx robots.txt means stay out entirely, while a 404 or an unreachable host means no policy was ever published and crawling proceeds, which is the whatupwolf.com case and keeps existing behavior intact. The limiter's sleep is injected so tests assert the spacing without waiting for it; a live probe of whatupwolf.com still returns all five key routes at 200 with an empty robotsSkipped and uninflated TTFBs (the gate is awaited before the timer starts). npm test (110 passed, up from 85) and npm run check (0 errors) both pass.
