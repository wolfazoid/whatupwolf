---
title: "Tonight STL is live: a city events engine built as a lab"
date: 2026-09-11T13:00
type: experiment
status: live
tags: [tonight-stl, cloudflare, d1, astro, ingestion, agents]
live: true
summary: A do312-style "what's on tonight in St. Louis" site, browsed by vibe and neighborhood, running on Cloudflare Workers and D1 with two ticketing sources feeding it every two hours. Now serving at tonight.whatupwolf.com.
summaryLevels:
  aware: "A St. Louis events site that answers 'what's on tonight' by vibe and neighborhood. Two ticketing feeds, one database on Cloudflare, a server-rendered front end, and a public status page showing the machinery."
  plain: "A new website that lists what's happening in St. Louis tonight, sorted by the kind of night you want and the part of town. It updates itself every couple of hours and you can watch it work."
---

**Live:** [tonight.whatupwolf.com](https://tonight.whatupwolf.com) · **the machinery, in public:** [/status](https://tonight.whatupwolf.com/status)

This grew out of the Ticketmaster widget I built for a venue network, but it is a new system,
not a port. The question it answers is "what's going on tonight?", and the answer is browsed
by *vibe* (live music, dance, comedy, weird, free, late night) and *neighborhood*, not by a
ticketing category.

## What runs

- **Ingest.** A Cloudflare Worker on cron pulls Ticketmaster and SeatGeek every two hours into
  one D1 database. Same show seen by both sources becomes one row. Venues resolve against a
  hand-curated table (75 St. Louis venues so far); unknown ones land in a queue instead of
  polluting the data. Tags come from rules, not a model: venue defaults, source categories,
  and a short list of title hints.
- **Site.** Astro, server-rendered per request from D1, no client JavaScript on list pages.
  Tonight / tomorrow / this weekend / any date, chips that toggle in the URL so every view is
  a link, event pages with an `.ics` download, venue and neighborhood pages.
- **Status.** [/status](https://tonight.whatupwolf.com/status) shows every ingestion run,
  counts, and errors. Honest by design.

## Numbers at launch

851 live events across 75 venues after the first day of runs. Two packages, 165 tests, 23
implementation tasks, each one written by a fresh agent from a plan, reviewed by another, and
gated by a final whole-branch review before merge.

## What the reviews caught

The process earned its keep. The whole-branch review of the ingest side found that the
per-event database pattern would have blown Cloudflare's subrequest budget on the first real
run, silently; the first production run then found D1's 100-variable limit the hard way. The
site review found a deploy that would have failed outright, and an error message that would
have printed an API key on the public status page. None of those were visible to the
task-level reviews. All fixed before anything shipped.

## Next

Better cross-source dedup (titles that differ by "&" vs "and" still slip through), Eventbrite
via a curated organizer list, then organizer accounts so venues can post directly.
