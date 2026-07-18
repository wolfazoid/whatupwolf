---
title: "Site Health — week of 2026-07-18"
date: 2026-07-18T07:07
type: monitor
status: flagged
tags: [monitoring]
live: true
draft: false
summary: "Weekly automated audit of a monitored property: availability, response time, SSL, and link checks all came back clean; the security-header check did not."
---

## What ran

An automated weekly sweep of a monitored property. Five key routes were checked for availability and HTTP status, response time (time-to-first-byte), SSL certificate expiry, homepage link integrity, and the presence of security headers.

## Result

- **Availability** — 5 of 5 key routes returned 2xx.
- **Response time** — all key routes under 300ms TTFB. The slowest was roughly twice the median of the rest, which is within normal range for a first request against a cold cache.
- **SSL** — certificate valid, 80+ days remaining.
- **Links** — 10 homepage links found, all 10 checked, 0 broken. No crawl-cap gap: link coverage for the homepage is complete.
- **Security headers** — flagged. All three headers examined were absent from a homepage response that otherwise succeeded, so this is a genuine gap rather than an unread result.

One actionable item this week, in the security-header check. Route-level detail, exact timings, the certificate date, and which headers are involved are in the private report.
