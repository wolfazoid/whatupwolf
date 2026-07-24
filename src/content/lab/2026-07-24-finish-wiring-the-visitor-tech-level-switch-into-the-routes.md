---
title: "Finish wiring the visitor tech-level switch into the routes that still…"
date: 2026-07-24T17:03
type: experiment
status: done
tags: [engine, tech-level]
live: true
draft: false
summary: "Wired the tech-level switch into Home, Work, Writing, Video and Now, and made the work/writing/video summaries level-aware."
---

Studied the Tier-11 pattern first — LevelText for single strings, LevelBlock for shape-changing markup, both switched by CSS off data-level with the existing paper/mono styling — then reused it exactly. Authored distinct technical/aware/plain readings for every key visitor-facing block on the five routes (hero, section intros, the Now bio and list), and consumed summaryLevels on work and writing (plus added the field to the video collection for parity), authoring aware+plain frontmatter for each entry. Verified each surface at each level by inspecting the built HTML; npm run check (0 errors), npm test (208 pass) and npm run build all pass.
