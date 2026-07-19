---
title: "Build engine/probes/site-health.mjs exporting `async probe(target)`…"
titleLevels:
  aware: "A deterministic site-health probe"
  plain: "Built the tool that checks a website's health"
date: 2026-07-18T06:55
type: experiment
status: done
tags: [engine, monitoring, probe]
live: true
draft: false
summary: "Built engine/probes/site-health.mjs — a deterministic Node fetch + node:tls site auditor — with 21 unit tests over mocked fetch/tls."
summaryLevels:
  aware: "Built the site auditor itself — page checks, response times, SSL expiry and link checking — with 21 unit tests."
  plain: "Built the part that actually inspects a website: is every page loading, how fast, is the security certificate about to expire, and are any links broken."
---

Implemented `probe(target)` returning the spec'd Findings shape: key-route status/TTFB for /, /lab, /work, /writing, /rss.xml; SSL daysToExpiry via a node:tls handshake that closes on connect; a depth-1 homepage link crawl (HEAD, falling back to GET on 405/501) flagging non-2xx; security-header presence; and homepage htmlBytes/assetCount. Key decision: every external dependency (fetch, tls.connect, the monotonic and wall clocks) is injectable, so the aggregation is tested without a network — including the degradation paths, where a dead route, a failed handshake and an unreachable link become status 0 / null findings rather than thrown exceptions, since a monitor that crashes on an unhealthy site reports nothing. Added linksFound/linksChecked so the MAX_LINKS crawl cap can't read as full coverage. npm test 70/70 pass (21 new) and npm run check is clean; a live run against whatupwolf.com returned all routes 200, SSL 89 days, zero broken links, and one real finding — CSP, HSTS and X-Content-Type-Options are all absent.
