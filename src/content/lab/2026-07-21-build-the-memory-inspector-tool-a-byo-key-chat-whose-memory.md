---
title: "Build the Memory Inspector tool — a BYO-key chat whose memory store is visible beside it, with per-turn extraction and confidence/sensitivity shading."
titleLevels:
  aware: "Memory Inspector — a chat that shows what it remembers about you"
  plain: "Memory Inspector — see and edit what a chat assistant remembers about you"
date: 2026-07-21T01:05
type: experiment
status: done
tags: [tools, ai, memory, transparency, byo-key, offline]
live: true
draft: false
tool: /tools/memory-inspector.html
summary: "Built the Memory Inspector at /tools/memory-inspector.html — a browser-direct BYO-key chat whose extracted memory store sits open beside it, where each entry's background shading encodes inferred confidence and sensitivity, and entries can be edited or forgotten inline."
summaryLevels:
  aware: "Built Memory Inspector: a bring-your-own-key chat that shows its memory beside it. After each turn Claude extracts durable facts about you, shaded by how sure and how private each is; you can edit or forget them, and changes take effect next turn."
  plain: "Built Memory Inspector: a chat where everything the assistant decides to remember about you shows up in a list next to the conversation, tinted by how sure it is and how private the fact is. You can correct or delete anything, and the next reply uses your corrections. Your Anthropic key never leaves your browser."
---

Built a first prototype of a memory-transparency tool at [`/tools/memory-inspector.html`](/tools/memory-inspector.html) — one HTML file, no build step, no backend, calling the Anthropic API directly from the browser with a bring-your-own key. It reuses the security and BYO-key posture of the [Generative UI Canvas](/tools/generative-ui.html): Anthropic-only `connect-src`, `x-api-key` plus `anthropic-dangerous-direct-browser-access: true`, the key held in `localStorage` and never sent to any server of ours, a default of Claude Sonnet 5 with an Opus 4.8 / Haiku 4.5 picker, and the same key-safety messaging and forget-key control.

## What it does

The window is split: a chat on the left, the memory store open on the right. Each turn, the current memory list is injected into the chat model's system prompt, so replies are shaped by what the assistant "knows". After the reply streams in, a second non-streaming call — a forced `commit_memory` tool call — runs an extraction pass over the exchange and the existing store, emitting `add`/`update` operations for durable, user-specific facts (identity, preferences, goals, constraints), each carrying an inferred **confidence** and **sensitivity** in [0,1]. Operations are applied to a `localStorage`-backed list and the panel re-renders.

The design decision the brief turns on: each entry's **background shading is a two-axis read**. Sensitivity drives hue (calm green → warning red) and confidence drives fill strength (faint → saturated), computed in `shadeFor()` and recomputed on a light/dark switch. A small legend renders the field as a 5×5 swatch grid with labelled axes, so an unsure/private fact and a certain/neutral one look different at a glance without opening anything. Entries can be **edited or forgotten inline** — editing a fact marks it fully confident, since a hand-corrected fact is one you confirmed — and because the store is re-injected every turn, edits and forgets take effect on the next message. Approach follows [MemoAnalyzer](https://arxiv.org/abs/2410.14931) on making an assistant's inferred memory visible and editable.

## Decisions and verification

Model IDs and the browser-direct contract were confirmed against the `claude-api` skill rather than hardcoded from memory: Sonnet 5 (`claude-sonnet-5`) as the default with Opus 4.8 and Haiku 4.5 selectable, `anthropic-version: 2023-06-01`, and `thinking: {type:"disabled"}` on the 4.6+ models (omitted on Haiku 4.5, which predates the switch) to keep both the chat and extraction passes fast. Extraction uses a forced tool call rather than free-text JSON so the operations array is structurally guaranteed; inbound `confidence`/`sensitivity` are clamped to [0,1], tolerating a stray percentage. `https://api.anthropic.com` was already present in the `_headers` CSP `connect-src` from an earlier tier, so the policy was left unchanged, not weakened.

Repo gates are green: `npm run check` reports 0 errors, `npm run build` completes (42 pages, the tool copied verbatim into `dist/tools/`), `npm test` passes 202/202, and the inline script passes `node --check`. This touches gated paths (`public/**`, `src/content/tools/**`), so the PR waits for review. Layout and live API behaviour need a real browser with a key; the obvious next slices are letting the user nudge the confidence/sensitivity axes by hand and surfacing which stored facts actually influenced a given reply.
