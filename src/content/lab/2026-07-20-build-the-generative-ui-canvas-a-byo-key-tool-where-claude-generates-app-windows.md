---
title: "Build the Generative UI Canvas — a BYO-key tool where a typed request makes Claude generate interactive app windows on a canvas, and interacting with a generated app re-invokes the model."
titleLevels:
  aware: "Generative UI Canvas — Claude builds app windows on a canvas"
  plain: "Generative UI Canvas — you ask, Claude builds a working little app"
date: 2026-07-20T18:20
type: experiment
status: done
tags: [tools, ai, generative-ui, prototype, byo-key, offline]
live: true
draft: false
tool: /tools/generative-ui.html
summary: "Built the Generative UI Canvas — a self-contained BYO-key tool at /tools/generative-ui.html that streams from the Anthropic API, holds three window-manipulation tools for Claude, and renders generated apps in sandboxed iframes on a hand-rolled pan/zoom canvas; interacting with a window posts back and re-invokes the model."
summaryLevels:
  aware: "Built the Generative UI Canvas: a single-file, bring-your-own-key tool where a typed request makes Claude generate interactive HTML app windows on a pan/zoom canvas. Generated code runs in sandboxed iframes that cannot reach the page or the key; clicking inside a window posts back and re-invokes the model."
  plain: "Built a tool where you type what you want — say a tip calculator — and Claude writes a small working app for it on a canvas. You paste your own Anthropic key and it stays in your browser. The apps Claude writes run in a sealed box that can't read your key, and clicking inside one sends the click back to Claude so it can update the app."
---

Built the first prototype from the LLM-interaction research phase: a self-contained generative-UI tool at [`/tools/generative-ui.html`](/tools/generative-ui.html). A typed request goes to Claude; Claude answers by calling tools that create and edit "app windows" on a canvas, each a small self-contained HTML app it writes on the fly. Interacting with a generated app posts a message back to the page, which re-invokes the model — the model, its tools, and the canvas form a loop.

## The generative-UI pattern and its precedent

The idea is streaming/generative UI: instead of Claude returning prose that a fixed frontend renders, Claude emits the interface itself and revises it in response to interaction. The highest-novelty candidate from the Interaction Landscape shortlist already had a working browser-only precedent (Anilturaga/Generative-UI, "Imagine with Claude"), so the risk here was design, not architecture. This build is the faithful multi-window version: multiple generated app-windows on a pan/zoom canvas, each a sandboxed iframe, interactions re-invoking the model — not a reduced single-surface v1.

## What was built

The model call is a browser `fetch` to `https://api.anthropic.com/v1/messages` with `stream: true`, the headers `x-api-key` (the visitor's key), `anthropic-version: 2023-06-01`, and `anthropic-dangerous-direct-browser-access: true`; the model ids and that browser-direct contract were confirmed against the `claude-api` skill rather than hardcoded from memory. The default model is Claude Sonnet 5 with a picker for Opus 4.8 and Haiku 4.5; the SSE stream is parsed by hand into text and `tool_use` blocks. The model holds three tools — `create_new_window(title, html)`, `set_window_html(id, html)`, and `dom_replace(id, selector, html)` — and a manual tool loop runs each against the canvas, returns a `tool_result`, and repeats until `end_turn` (capped at 16 rounds). The canvas is hand-rolled vanilla JS: pan by dragging the background, wheel/anchored zoom, draggable and resizable window panes — "React Flow-style," not an actual React Flow dependency, so the file stays single-file, offline, and CSP-clean.

## The security surface

Generated apps render in iframes with `sandbox="allow-scripts"` and **without** `allow-same-origin`, so model-written code runs in an opaque origin but cannot reach the parent page, its `localStorage`, or the API key. The key lives only in the parent, is passed to no iframe, and every app↔page message goes over `postMessage`; inbound messages are validated by matching `event.source` against the known iframe `contentWindow`s (origin is `null` under the opaque sandbox, so source-matching is the check). A small bridge injected into each window delegates clicks on `data-genui` elements and form submissions back to the parent, and applies `dom_replace` commands from the parent — the parent never reaches into the iframe DOM directly. Trust UX is prominent: "your key stays in your browser, never sent to any server," a get-a-key link, a forget-key button, a "generated code runs sandboxed" note, and graceful handling of missing/invalid key and API/rate-limit errors.

## Coordination and verification

The tool needs `https://api.anthropic.com` in the site's `connect-src` before the CSP is enforced, so `public/_headers` gains exactly that one source on the still-`Report-Only` policy — nothing else in the policy is changed. Published as a `tools` collection entry and this experiment writeup, matching the Cook Mode / Tools-home conventions. Repo gates are green: `npm run check` reports 0 errors and `npm run build` succeeds. The API loop and streaming were not exercised against a live key in this build (BYO-key, no server), so end-to-end model behaviour needs a real key on a device; because it touches `public/**`, `src/content/tools/**`, and `public/_headers`, the change is gated for Wolf's review of the security surface before it ships.
