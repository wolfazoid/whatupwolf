---
title: "Agent Weekly — week of 2026-07-18"
date: 2026-07-18T05:10
type: digest
status: done
tags: [agents, digest]
live: true
draft: false
summary: "Week of July 11–18, 2026: a quiet consolidation week in AI agents — three verified in-window releases (OpenAI Agents SDK v0.18.2–0.18.3, Claude Agent SDK for Python 0.2.116–0.2.122, and GA of Agent Skills for Python in Microsoft Agent Framework), mostly tooling adapting to the July 9 GPT-5.6 launch."
---

**Agent Weekly — July 11–18, 2026 · 3 verified items.** A quiet consolidation week: the confirmable news all sits on the agent-tooling layer, not on net-new models. The window opened just after two July 9–10 launches — OpenAI's GPT-5.6 GA (Jul 9) and Microsoft's Agent Framework for Go public preview (Jul 10) — and the in-window activity was largely SDKs catching up to them. Widely repeated claims about a Gemini 3.5 Pro launch on Jul 17 remain third-party rumor with no official Google post, so they are excluded here.

**OpenAI Agents SDK v0.18.2 → v0.18.3** — Two point releases (Jul 11 and Jul 17). v0.18.2 adds GPT-5.6 request controls and hosted multi-agent beta support; v0.18.3 adds configurable tracing spans for tasks/turns and realtime-session usage tracking, plus provider-isolation and streamed-input fixes. · First-party wiring for the day-old GPT-5.6 family and a hosted path for multi-agent runs. · https://github.com/openai/openai-agents-python/releases

**Claude Agent SDK for Python 0.2.116 → 0.2.122** — Seven releases across Jul 11–18, tracking the bundled Claude CLI from 2.1.207 to 2.1.214. The substantive content is security hardening: an argv flag-injection fix so `--resume`/`--session-id` values can't be reinterpreted as CLI flags (0.2.121), build-script command-injection hardening with version validation, and escaping of untrusted fields in a Slack notification workflow (0.2.117). · Maintenance cadence rather than features — worth noting for the injection-surface fixes if you pin this SDK. · https://github.com/anthropics/claude-agent-sdk-python/releases

**Microsoft Agent Framework — Agent Skills for Python (GA)** — Shipped Jul 15. The skills API is now stable (no experimental gate), supporting file-, class-, and code-defined skills that load instructions and scripts on demand, with bundled-script execution gateable behind human approval. · Brings the reusable-"skills" packaging pattern to MAF's Python SDK with production governance controls, following the .NET skills GA on Jul 7. · https://devblogs.microsoft.com/agent-framework/agent-skills-for-python-is-now-released/

**Context (just before the window, for reference):**
- GPT-5.6 general availability — Jul 9. Three variants (Sol / Terra / Luna); adds programmatic tool calling and persisted reasoning. The model the in-window SDK updates target. · https://openai.com/index/gpt-5-6/
- Microsoft Agent Framework for Go, public preview — Jul 10. Go SDK with providers for Foundry, Azure OpenAI, Anthropic, Gemini, and A2A; still missing handoff orchestration and CodeAct relative to .NET. · https://github.com/microsoft/agent-framework-go
