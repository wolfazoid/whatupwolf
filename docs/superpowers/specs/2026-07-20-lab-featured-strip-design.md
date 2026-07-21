# Lab featured "Tools & experiments" strip — design

**Date:** 2026-07-20
**Status:** approved, ready to implement
**Zone:** GATED (touches `src/pages/**` + `src/components/**` — needs Wolf's manual merge)

## Problem

`/lab` is a single flat reverse-chronological feed of every non-draft entry. Two
kinds of content are mixed with no visual distinction:

1. **Curated writeups** — interactive tools (a `tool:` "try it" link), digests
   (Agent Weekly, Interaction Lab), briefings (Interaction Landscape), monitors
   (Site Health). The valuable, human-facing posts.
2. **Routine engine build-logs** — the machine hardening itself (in-code lock,
   registry extraction, loop-skip fixes). One per cycle.

The feed buries (1) under (2), and the list doesn't even surface the `tool:`
link, so a visitor can't tell a live tool from a machine build-log at a glance.
Wolf hit this directly: the Generative UI Canvas's routine-looking technical post
sat next to its far-more-valuable "try it" writeup.

A separate `/tools` page already lists interactive tools (`Open →`); it stays as
is. This change is only about `/lab`.

## Goal

Give the curated writeups a **featured strip at the top of `/lab`**, above the
activity log, so the valuable posts are seen first and the routine cycles become
a clearly-secondary "build log."

## What qualifies as featured

Rule-based and automatic (no manual flag the autonomous machine would forget):

```
isFeatured(item) === item.tool is set  ||  item.type ∈ { digest, briefing, monitor }
```

Everything else — `type: experiment` with no `tool:` (the routine cycles) — is
log-only.

## Layout & partition

The page splits into a **featured strip** and an **activity log**, with each
entry appearing in exactly one (no repeats — Wolf's explicit choice).

**Featured strip — two subtle groups:**

1. **Tools** — *every* entry with a `tool:` link, newest-first, pinned first.
   Small, stable, permanent set. Each card shows a prominent **Try it →** that
   deep-links to the tool href.
2. **Reads** — `digest` / `briefing` / `monitor` entries, newest-first, capped to
   the most recent **`readsCap = 6`**. Each card shows **Read →** to its writeup.

**Why the cap:** Site Health (weekly) and Agent Weekly (weekly) mint ~2 reads per
week; unbounded, they'd bury the tools. Tools never overflow (few, permanent).
Reads beyond the cap fall back into the activity log — so nothing is hidden, and
each entry still appears exactly once. `readsCap` is a single tunable constant.

**Activity log:** routine `experiment` build-logs **plus** any overflow reads
(beyond the cap), newest-first. The existing client filter island (search / type
/ tag) applies to the **log only** — the featured strip is always shown (it's
curated highlights, not something you filter).

**Cards** (both groups) preserve the site's reading-level mechanism
(`titleLevels` / `summaryLevels` via the existing `Levelled` pattern). The card
title always links to the `/lab/<id>` writeup for context; tool cards *also* carry
the `Try it →` deep-link.

## Components & data flow

- **`src/lib/lab-filter.ts`** (auto-zone) — add:
  - `tool?: string` to the `LabItem` type.
  - `isFeatured(item): boolean` — the rule above.
  - `partitionLab(items, { readsCap }): { featured: { tools, reads }, log }` — pure.
    `items` arrive already sorted newest-first. Returns tools (all `tool:` items),
    reads (recent `readsCap` of the curated types), and log (routine experiments +
    overflow reads), preserving order.
- **`src/lib/lab-filter.test.ts`** (auto-zone) — unit tests: a tool entry, one of
  each read type, a routine build-log, reads-cap overflow (reads beyond cap land
  in `log`), a tool never overflowing, and empty input.
- **`src/components/FeaturedStrip.astro`** (GATED, new) — static (no hydration).
  Renders the Tools group then the Reads group with level-aware title/summary and
  the correct CTA per group. Renders nothing if both groups are empty. On-brand
  paper theme + mono chrome, matching `LabFilter` card styling and `/tools`.
- **`src/pages/lab/index.astro`** (GATED) — include `tool` in the serialized items
  map; call `partitionLab`; render `<FeaturedStrip .../>` above
  `<LabFilter items={log} client:load />`. Update the level captions so the strip
  reads as highlights and the log reads as "the routine build log."

`LabFilter.tsx` itself is unchanged except that it now receives only the `log`
subset; it keeps working as-is.

## Edge cases

- **No featured entries** → strip renders nothing; page is just the log (today's
  behavior).
- **No log entries** (all featured) → log area shows its existing empty state.
- **Overflow reads** appear in the log, correctly ordered by date among the cycles.
- **Draft entries** remain excluded upstream (unchanged) before partitioning.

## Testing

- Unit: `isFeatured` + `partitionLab` per the cases above (`npm test`).
- `npm run check` → 0 errors; `npm run build` → all pages, no broken routes.
- Manual: visual check of `/lab` at each reading level.

## Out of scope (YAGNI)

- No manual `featured:` / pin / exclude flag — the rule is automatic.
- No per-series collapsing (e.g. "latest Site Health only"); a flat recency cap is
  enough. Revisit only if the reads cap proves too blunt.
- No change to `/tools`, the `tools` collection, or `/lab/<id>` detail.
