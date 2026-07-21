---
title: "Build the Branching Canvas Conversation — a BYO-key tool where a chat is laid out spatially on a canvas and any message can be branched into a parallel thread."
titleLevels:
  aware: "Branching Canvas Conversation — chat drawn as a tree you can branch"
  plain: "Branching Canvas Conversation — a chat you can split into side-by-side threads"
date: 2026-07-21T15:40
type: experiment
status: done
tags: [tools, ai, canvas, conversation, branching, prototype, byo-key]
live: true
draft: false
tool: /tools/branching-chat.html
summary: "Built the Branching Canvas Conversation — a self-contained BYO-key tool at /tools/branching-chat.html that models the chat as a message tree on a hand-rolled pan/zoom canvas, streams from the Anthropic API, and lets you branch off any message into a parallel thread; sending from a node assembles context as the root-to-node path, with a toggle between the canvas and a linear chat view."
summaryLevels:
  aware: "Built the Branching Canvas Conversation: a single-file, bring-your-own-key tool where every message is a draggable node in a conversation tree on a pan/zoom canvas. Branch off any message into a parallel thread — each reply uses the path from the root down to that node as its context — and toggle to a linear view to read one thread top to bottom."
  plain: "Built a chat tool that draws the conversation as a tree instead of one straight line. Every message is a card on a canvas, and you can split off from any point to try a different direction without losing the first one. There's also a normal top-to-bottom view. You paste your own Anthropic key and it never leaves your browser."
---

Built the second prototype from the LLM-interaction research phase: a self-contained branching-conversation tool at [`/tools/branching-chat.html`](/tools/branching-chat.html), one HTML file with no build step and no dependencies. The conversation is modelled as a **tree** rather than a list — each message, from the visitor and from Claude, is a node linked to the one it followed. Sending from a node assembles the request context as the path from the root of the tree down to that node, so a reply only ever sees its own lineage. Branching off a message starts a new child thread that diverges at that point, leaving the original thread intact for side-by-side comparison. A toolbar toggle switches between the hand-rolled pan/zoom canvas (draggable nodes, SVG edges, active-path highlighting) and a linear view that renders the selected thread as an ordinary top-to-bottom chat with a per-fork sibling picker.

Reused the Generative UI Canvas security and BYO-key posture: Anthropic-only, a browser `fetch` to `https://api.anthropic.com/v1/messages` with `stream: true` SSE, `x-api-key` plus `anthropic-dangerous-direct-browser-access: true`, the key in `localStorage` and sent to no server of ours, default Claude Sonnet 5 with an Opus 4.8 / Haiku 4.5 picker, and prominent "your key stays in your browser" messaging with a get-a-key link and a clear-key button. Current model IDs and the browser-direct calling contract were confirmed via the claude-api skill rather than hardcoded from memory. `https://api.anthropic.com` was already present in the `public/_headers` CSP `connect-src`, so the policy was left unchanged. Added the `tools` collection entry and verified: `npm run check` (0 errors) and `npm run build` both green.
