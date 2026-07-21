---
title: "Memory Inspector"
description: "A bring-your-own-key chat whose memory store sits open beside it. After each turn Claude runs an extraction pass that pulls durable facts about you into an editable localStorage memory list; the stored memory is injected back into the model's context every turn. Each entry's background shading is a 2-D read — confidence on one axis, sensitivity on the other — so what the system knows, and how sure and how private, is legible without opening a panel. Edit or forget entries inline; changes take effect next turn. Key stays in the browser. One file, no build step."
descriptionLevels:
  aware: "Chat with an assistant that shows its memory next to it. After each reply, a Claude extraction pass adds or updates the durable facts it inferred about you, each shaded by inferred confidence and sensitivity. Edit or forget any of them inline; changes take effect on the next turn. Bring your own Anthropic key — it stays in your browser."
  plain: "You chat with an assistant, and everything it decides to remember about you appears in a list right next to the conversation. Each remembered fact is tinted by how sure the assistant is and how private the fact is — faint means unsure, red means personal — so you can see at a glance what it thinks it knows. You can fix a fact or delete it, and the next reply uses the corrected list. You paste your own Anthropic key and it never leaves your browser."
href: "/tools/memory-inspector.html"
date: 2026-07-21
tags: [ai, memory, transparency, byo-key, offline]
---
