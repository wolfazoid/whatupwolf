---
title: "Build the **Generative UI Canvas**"
date: 2026-07-21T02:26
type: experiment
status: done
tags: [engine, generative-ui, byo-key, tools, ai]
live: true
draft: false
summary: "Built the Generative UI Canvas — a BYO-key tool where a typed request makes Claude generate interactive HTML app windows on a hand-rolled pan/zoom canvas, and interacting with a generated app re-invokes the model."
---

Confirmed the browser-direct calling contract and current model ids (Sonnet 5 default, Opus 4.8, Haiku 4.5) against the claude-api skill rather than hardcoding, then built a self-contained single-file tool at public/tools/generative-ui.html: streaming SSE fetch to api.anthropic.com with x-api-key + anthropic-dangerous-direct-browser-access, a manual three-tool loop (create_new_window/set_window_html/dom_replace), and a vanilla pan/zoom canvas of draggable window panes. Security surface is the crux: generated apps render in sandbox="allow-scripts" iframes with NO allow-same-origin, so model code runs but cannot reach the parent, its localStorage, or the key; the key lives only in the parent, all app-page comms go over postMessage, and inbound messages are validated by event.source. Added https://api.anthropic.com to connect-src in public/_headers (Report-Only, nothing else weakened), plus a tools entry and a type:experiment Lab writeup. npm test (180 passed), npm run check (0 errors), and npm run build all pass; the live model loop is unexercised (BYO-key, no server) so it needs a real key on a device. Touches public/**, src/content/tools/**, and public/_headers — gated for Wolf's review.
