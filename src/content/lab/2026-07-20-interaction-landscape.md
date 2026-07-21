---
title: "Interaction Landscape — 2026-07-20"
date: 2026-07-20T16:51
type: briefing
status: done
tags: [interaction, briefing]
live: true
draft: false
summary: "Surveyed 32 verified LLM interaction patterns across nine areas — generative UI protocols, spatial and direct-manipulation interfaces, agent-initiated pausing, elicitation and memory UX — with a browser-only BYO-key generative UI canvas as the top prototype candidate."
---

Survey of novel LLM interaction patterns, not model releases: 32 patterns across nine areas, every item fetched and verified against its primary artifact.

## Generative & streaming UI

**A2UI v0.9 (Google)** — A framework-agnostic standard for declaring UI intent, letting an agent drive a client's existing component catalog over MCP, WebSockets, REST, A2A or other transports · The novel part is incremental repair: the client can "incrementally parse and heal LLM output, allowing the client to render UI components as they are being generated — no waiting for the full JSON block", so malformed partial output still renders · https://developers.googleblog.com/a2ui-v0-9-generative-ui/

**MCP Apps (SEP-1865)** — The official MCP extension for interactive UI, spec version 2026-01-26, shipping in Claude, ChatGPT and VS Code · A tool declares a `ui://` resource containing its HTML interface; the host renders it in a sandboxed iframe, passes tool data in via notifications, and the UI can call other tools back through the host — a two-way channel rather than a render target · https://github.com/modelcontextprotocol/ext-apps

**AG-UI** — An event-based protocol for agent-to-frontend interaction with ~16 standard event types and a middleware layer, transport-agnostic across SSE, WebSockets and webhooks · Positions itself as the third leg alongside MCP (tools for agents) and A2A (agent to agent): a bidirectional channel carrying agent state, UI intents and user interactions · https://github.com/ag-ui-protocol/ag-ui

**Generative UI: LLMs are Effective UI Generators (Google Research)** — Leviathan, Valevski, Kalman et al. measure LLM-generated interfaces against markdown output and human-designed pages · Reports generated UI preferred over standard markdown output at 82.8%, and finds the capability is emergent across model generations, with error rates falling from 29–60% to 0% on newer models — evidence that "render an interface" is becoming a viable default response type, not a special case · https://arxiv.org/html/2604.09577v1

**Generative-UI (OSS reimplementation of Imagine with Claude)** — Anilturaga's open reimplementation, where requested apps appear as windows on a React Flow canvas · Notable for its build shape rather than its scale (12 stars): the agent holds `create_new_window()`, `dom_replace()` and `set_window_html()` tools, user interaction posts a message that re-invokes the agent, and it runs with "LLM calls made from the browser with no backend server needed and BYOK" · https://github.com/Anilturaga/Generative-UI

**Counter-argument, on the record** — The Hacker News thread on A2UI collects the standing objections: platform-independent UI as a decades-old unsolved problem, "Why on earth would you trust an LLM to output a UI? You're just asking for security bugs, UI impersonation attacks, terrible usability", whether agents need button-clicking middleware at all when they can call APIs, and standards fragmentation across MCP-UI, ChatKit and A2UI · https://news.ycombinator.com/item?id=46286407

## Direct manipulation & spatial interfaces

This area was not on the original checklist but produced the densest run of verifiable new interaction techniques.

**Malleable Prompting / From Words to Widgets (UIST '26)** — Zhang, Liu, Nie, Rzeszotarski, Huang, August turn subjective preference phrases inside a prompt into sliders, dropdowns and toggles · The widgets are not prompt-rewriting sugar: they drive "an LLM decoding algorithm that modulates the token probability distribution during generation based on preference expressions and their widget values", making a slider a continuous control on the sampler · https://arxiv.org/abs/2604.10925

**CanvasConvo (LMU Munich / Aalto / Bayreuth)** — Amin, Adatepe, Fernandes, Buschek, Butz embed a branching conversation tree in a spatial canvas, evaluated in a 5–7 day field study with 24 participants · Users branch directly off conversational content to run parallel alternatives and can toggle between linear chat and the canvas rather than committing to one view · https://arxiv.org/abs/2605.15848

**Visual Story-Writing (UIST '25)** — Masson, Zhao, Chevalier auto-generate an entity-interaction graph, location movements and an event timeline from a narrative text · The interaction runs backwards from the usual text-in/visual-out: manipulating the visualization produces suggested text edits, so "connecting two characters in the graph creates an interaction between them, moving an entity updates their described location" · https://arxiv.org/abs/2410.07486

**Texterial (CHI 2026)** — Shen, Marquardt, Romat, Hinckley, Riche, Chevalier build two probes treating generated text as a physical material: "Text as Clay, where users refine text through gestural sculpting, and Text as Plants, where ideas grow serendipitously over time" · Text as Plants drops the request/response turn entirely — output accrues over time rather than on submit · https://arxiv.org/abs/2603.00452

**Orality (CHI 2026, City University of Hong Kong)** — Li, Tian, Liu convert spoken thinking-aloud into an interactive node-link diagram instead of a transcript · Voice is both input and editing channel: "users could manipulate clusters of nodes and give verbal instructions to re-extract and organize the content in other ways", evaluated head-to-head against speech interaction with ChatGPT · https://arxiv.org/abs/2603.02544

**SketchDynamics (CHI '26 conditionally accepted, HKUST)** — Li, Yuan, Wang, Fu let users express motion intent to a vision-language model by free-form sketching over a storyboard · Sketches are deliberately left unconstrained where "existing approaches often constrain sketches to fixed command tokens or predefined visual forms", making sketch ambiguity a designed trigger for clarification rather than an error · https://arxiv.org/abs/2601.20622

## Computer use / GUI agents

The human-control surface is where the research energy sits, and the notable shift is that the *pause* is increasingly initiated by the model rather than configured by the developer.

**Morae (UIST 2025)** — Peng, Li, Bigham, Pavel build a UI agent for blind and low-vision users that "uses large multimodal models to interpret user queries alongside UI code and screenshots, and prompt users for clarification when there is a choice to be made" · The trigger is ambiguity in *user preference*, not risk — the control surface is a question, not a stop button · https://arxiv.org/abs/2508.21456

**VeriOS (Shanghai Jiao Tong University)** — Wu, Huang, Lou, Qu et al. train an OS agent to decide when to stop and ask, separating trustworthiness meta-knowledge from task knowledge · Escalation is a learned policy conditioned on whether the environment looks untrustworthy, not a hardcoded sensitive-action list; reports +19.72% average step-wise success over the strongest baselines "without compromising normal performance" · https://arxiv.org/abs/2509.07553

**Magentic-UI (Microsoft Research)** — Mozannar, Bansal, Fourney, Amershi et al. ship an open-source interface for a browsing/code/file multi-agent system built as a human-agent interaction testbed rather than for autonomy · It decomposes oversight into separately-designed mechanisms — co-planning (the human edits the plan before execution), co-tasking, multi-tasking, action guards, long-term memory — rather than one generic interrupt · Note: the abstract says "six interaction mechanisms" and then enumerates five; the discrepancy is in the paper's own text · https://arxiv.org/abs/2507.22358

## Tool-call & clarification UX

**Conleash** — Li, Chen, Wang, Khabra, Shezan, Feng, Tian replace per-call allow/deny prompts in MCP with "a client-side middleware that enforces boundary-scoped authorization by utilizing a risk lattice to auto-permit safe calls" · Consent becomes a scope chosen once that auto-permits everything provably below it, instead of the current binary between single-shot approval and "Always Allow" · https://arxiv.org/abs/2605.11360

**Oversight Has a Capacity** — Emre Turan models the human approver as a finite, fatiguing resource: "human attention is finite, and the guard's escalation policy spends it" · The result inverts the default design assumption — "realized safety becomes an inverted-U in the escalation rate: more human oversight can make a system less safe" — so the safety-optimal policy confirms strictly less than everything · https://arxiv.org/abs/2606.08919

**Reframing LLM Agent Security as an Agent–Human Interaction Problem** — Wang, Li, Tian survey 59 papers, 21 production agent systems and 26 security plugins as of April 2026 · The useful output is a deployment gap count across those 21 production systems: policy specification 16, runtime approval 15, scope configuration 14, intent anchoring 0, trust labeling 0 — two heavily-researched patterns with zero shipped instances · https://arxiv.org/abs/2605.24309

**SAGE-Agent** — Suri, Mathur, Lipka, Dernoncourt, Rossi, Manocha price the ask-vs-guess decision, using "Expected Value of Perfect Information (EVPI) to quantify the disambiguation value of each potential question" against aspect-based cost modeling · Splits specification uncertainty (what the user wants) from model uncertainty (what the LLM predicts); reports 7–39% higher coverage on ambiguous tasks with 1.5–2.7x fewer clarification questions · https://arxiv.org/abs/2511.08798

## "Thinking out loud" surfaces

**Seeing the Reasoning** — Sun, Wei, Bosch, Echizen, Sugawara, El Ali run an N=68 fact-verification experiment crossing rationale correctness, certainty framing and presentation timing · The finding cuts against a lot of streaming-trace product design: "Presentation format did not have a significant effect, suggesting users were less sensitive to how reasoning was revealed than to its reliability", while correct rationales and certainty cues raised trust and adoption and hedging lowered them · https://arxiv.org/abs/2603.07306

**Watching AI Think** — Cox, Martin-Lise, Hosio, van Berkel run a 3×2 study varying whether a chatbot exposes pre-response reflections (none / emotionally-focused / expertise-focused) across habit vs. feelings problems · Treats the thinking pane as a designed content type with a voice rather than a debug dump, noting visible thinking "can also anthropomorphise the agent and shape user expectations" · https://arxiv.org/abs/2601.16720

**ReasoningLens** — Zhang, Zheng, Cao, Lu et al. restructure long chain-of-thought traces "into interactive hierarchies that separate high-level strategy from low-level execution" and add "an agentic auditor for automated error detection and tool-augmented verification" · The trace becomes a browsable, machine-checked artifact instead of a stream a human is expected to read in full · https://arxiv.org/abs/2606.23404

## Elicitation patterns

Strong academic work, near-zero shipped product surface — the clearest research/product gap in this survey.

**LLMREI** — Korn, Gorsch, Vogelsang build a chatbot that conducts requirements-elicitation interviews with stakeholders, evaluated over 33 simulated interviews against human interviewers · The system holds the interview turn and is scored on *interviewer error types* borrowed from a human-interviewing rubric rather than on answer quality; shows "a notable ability to generate highly context-dependent questions" · https://arxiv.org/abs/2507.02564

**Asking Clarifying Questions for Preference Elicitation** — Montazeralghaem, Tennenholtz, Boutilier, Meshi train an LLM to ask a sequence of clarifying questions that reconstruct a user preference profile · The question-ordering policy is learned via a diffusion-style process — answers are progressively noised out of a known profile and the model learns to re-elicit them — rather than written as fixed intake rules · https://arxiv.org/abs/2510.12015

**What Prompts Don't Say** — Yang, Shi, Ma, Liu, Kästner, Wu quantify how often unstated prompt requirements are silently inferred · The empirical case for interview-style intake: LLMs infer unstated requirements in only 41.1% of cases, and underspecified prompts are "2x as likely to regress across model or prompt changes" · https://arxiv.org/abs/2505.13360

## Agent-handoff UX

Strong tooling, almost no published HCI evaluation of the async *return* specifically — that work is happening in repos and blog posts, not papers.

**Agent Inbox (LangChain)** — An inbox-style web UI collecting LangGraph agent interrupts for a human to triage · The agent→human return is typed into four distinct verbs at the interrupt boundary — accept, edit, respond, ignore — each independently enablable per interrupt via `allow_edit` / `allow_accept` / `allow_respond` / `allow_ignore`, so the developer sets how much redirect authority the reviewer holds at each pause · https://github.com/langchain-ai/agent-inbox

Magentic-UI's action guards and VeriOS's learned escalation (above) are the other half of this area: the interrupt placement problem rather than the review-surface problem.

## Multimodal

Screen-share and camera-in-the-loop have largely shipped; the live novelty has moved to *which* pixels the model receives and to who owns the turn.

**SketchGPT (Institute of Software, Chinese Academy of Sciences + UCAS, Cardiff, Tsinghua)** — Huang, Gao, Shan et al. "integrate sketch and speech input directly over the system interface, facilitating open-ended, context-aware communication with LLMs" · The canvas is the live application UI, so the stroke acts as a deictic reference ("this, here") while speech carries the intent — the two modalities split roles rather than duplicating each other · https://zaynehuang.github.io/SketchGPT/

**GazeLLM (Jun Rekimoto)** — Fuses eye-tracking with first-person video, feeding the model only gaze-focused sub-regions and "decomposing first-person vision video into sub areas for regions of gaze focus" · The user's eyes become the input-selection device; reports comprehension equivalent to or better than full-resolution processing at roughly a tenth of the pixels · https://arxiv.org/abs/2504.00221

**Project Astra (Google DeepMind)** — Research prototype streaming live camera, screen and audio, with capabilities folded into Gemini Live · The model holds turn-taking initiative: it "can intuitively start conversations, and respond in the moment — without interrupting or time lag" and "ignores distractions, like background conversation and irrelevant speech" — an inversion of the request/response contract · https://deepmind.google/models/project-astra/

## Voice & ambient

**GPT-Live (OpenAI)** — Full-duplex voice models rolled out to ChatGPT, system card dated 2026-07-08 · Per the system card these models "are full-duplex, meaning they can listen and respond continuously instead of waiting for a clearly defined turn to end" and "can follow pauses, interruptions, and changes in pace, and decide in the moment whether to respond or keep listening" — silence becomes a first-class model output · https://deploymentsafety.openai.com/gpt-live

**τ-Voice** — Ray, Dhandhania, Barres, Narasimhan benchmark full-duplex voice agents on task completion, conversation dynamics and realistic audio simultaneously, which prior benchmarks measured separately · The measured gap is the useful part: even on clean audio with no interruptions, voice agents reach 31–51% against 85% for GPT-5 reasoning in text, falling to 26–38% under realistic conditions, with 79–90% of failures attributed to agent behavior rather than simulator artifacts · https://arxiv.org/abs/2603.13686

## Memory & context UX

**Shape of AI — Memory patterns** — A pattern catalogue separating global memory (ChatGPT's cross-chat memory), scoped memory (Perplexity's per-space memory) and ephemeral memory (session-only) · States the design constraint plainly: "Memory should never be a black box. Show users when new memories are added. Make it easy to manage and control what memories are retained" · https://www.shapeof.ai/patterns/memory

**MemoAnalyzer** — Zhang, Ye, Yi, Tang et al. build a system that infers sensitive information from aggregated past inputs and lets users modify it directly · The novel element is rendering model state as a visual property: "background color temperature and transparency are mapped to inference confidence and sensitivity", so what the system thinks it knows and how confident it is are legible without opening a settings pane · https://arxiv.org/abs/2410.14931

## Also noted

- **Knowing but Not Showing** — models recognize ambiguity when asked directly but "overwhelmingly default to direct answers"; retrieved context makes them *less* likely to ask · https://arxiv.org/abs/2605.25284
- **"I'm Not Sure, But…"** — Kim, Liao, Vorvoreanu, Ballard, Wortman Vaughan (FAccT 2024, N=404): first-person uncertainty phrasing reduced over-agreement and increased accuracy; general-perspective phrasing did not · https://arxiv.org/abs/2405.00623
- **OOPrompt (Object-Oriented Prompting)** — Xu, Ma, Chen (PACM HCI / EICS 2026) treat prompts "as structured, manipulable artifacts" rather than text · https://arxiv.org/abs/2604.19114

## Coverage gaps

Two areas came back genuinely thin rather than unexamined. **Ambient agents** — background systems that surface only when they have something — produced abundant pattern-blog writing but no shipped implementation with a verifiable primary artifact; the pattern pages found describe low-attention presence signals without naming a product that ships one. **Reasoning-trace faithfulness as an interface variable** is dominated by model-eval work with no human in the loop; "Seeing the Reasoning" was the only human-subjects study on it that survived verification. Separately, r/LocalLLaMA could not be fetched (robots restriction), so community argument in this survey comes from Hacker News only.

## Prototype Shortlist

1. **Generative UI canvas** — A BYO-key page where a request spawns app windows on a canvas, the model holding `create_new_window` / `dom_replace` / `set_window_html` tools and interactions posting back to re-invoke it · Ranked first because it is the highest-novelty pattern with a working browser-only precedent already in the open (Anilturaga/Generative-UI), so the risk is design, not architecture · Build shape: React Flow canvas, sandboxed iframes per window, streaming DOM patches, key in localStorage · **BYO-key**

2. **Reasoning-trace A/B, from recordings** — Show the same answer with a correct trace vs. a subtly unfaithful one, and vary reveal timing (instant / delayed / on-demand), letting the visitor judge before showing them the published result · Ranked second because "Seeing the Reasoning" found presentation format had no significant effect while rationale reliability dominated — a finding that contradicts common streaming-trace design and lands harder as an interaction the visitor loses than as a citation · Build shape: pre-recorded trace pairs as static JSON, no model call at runtime · **client-only**

3. **Branching canvas conversation** — CanvasConvo's core move on a static page: branch directly off any message into a parallel thread, laid out spatially, with a toggle back to linear chat · Ranked third because the interaction is legible in ten seconds and needs no server, but it is a re-implementation of a published design rather than new ground · Build shape: canvas layout over a conversation tree, per-node context assembly on send · **BYO-key**

4. **Memory inspector** — A conversation whose memory store is visible beside it, where entries can be edited or forgotten inline and background shading encodes inferred confidence and sensitivity, following MemoAnalyzer · Ranked fourth because the shading idea is the genuinely under-copied part of that paper and maps cleanly onto localStorage, but it needs a few turns of conversation before it shows anything · Build shape: localStorage memory list, extraction pass per turn, shading on two axes · **BYO-key**

5. **Widget-ified prompting** — Malleable Prompting's surface: detect preference phrases in a typed prompt, render them as sliders and toggles, regenerate as they move · Ranked last on feasibility rather than interest — the paper's contribution is decoding-time modulation of the token probability distribution, which no hosted API exposes, so a static-site version can only approximate it by rewriting the prompt and would be demonstrating a weaker claim than the paper's · Honest framing: the faithful version is **needs-server** (local model with logit access); the approximation is BYO-key and should be labelled as an approximation
