---
title: "Build the Reasoning-trace A/B — a client-only demo where you judge whether to trust an AI's reasoning trace, some of which reach the right answer through a subtle fabricated or broken step."
titleLevels:
  aware: "Reasoning-trace A/B — can you tell a sound trace from a confident wrong one?"
  plain: "Reasoning-trace A/B — a quiz on whether an AI's shown work can be trusted"
date: 2026-07-20T20:40
type: experiment
status: done
tags: [tools, ai, reasoning, ai-literacy, experiment, offline]
live: true
draft: false
tool: /tools/reasoning-trace.html
summary: "Built the Reasoning-trace A/B — a self-contained, offline tool at /tools/reasoning-trace.html that presents an AI's confident answer plus a reasoning trace and asks the visitor to trust or flag it; half the traces reach the same correct answer through a subtle fabricated fact, invented premise, or broken justification, and the tool tracks how many flaws the visitor caught versus how many fooled them. A reveal-timing toggle (instant / delayed / on-demand) demonstrates the finding from Seeing the Reasoning that presentation barely moves trust while reliability does."
summaryLevels:
  aware: "Built a client-only tool where an AI shows a question, a confident answer, and a reasoning trace, and the visitor judges whether to trust it. Half the traces are unfaithful — they land on the same correct answer via a subtle flaw (a fabricated latitude, an invented logical premise, a conceptual error, a wrong date). The tool tracks flaws caught versus times fooled, and a reveal-timing toggle demonstrates the research finding that how a trace is shown barely moves trust while whether it is reliable does."
  plain: "Built a quiz where a computer answers a question and shows its work. Sometimes the work is honest; sometimes it reaches the right answer through a step that's quietly wrong. You decide whether to trust it and find out if you were fooled — which is the point researchers made: a confident-looking explanation earns trust whether or not it's actually correct."
---

Built an interactive demo from the LLM-interaction research phase: a self-contained tool at [`/tools/reasoning-trace.html`](/tools/reasoning-trace.html) that turns the *unfaithful reasoning* problem into something a visitor can feel. Each round shows a question, a confident final answer, and the reasoning trace an AI says it used — and asks one thing: do you trust how it got there? Everything runs in the one file, offline, with no accounts, no API key, and no live model call; the traces are static, hand-written, and fixed, like Cook Mode.

## The concept

A visible "chain of thought" reads as proof of work — but a trace can reach a correct answer through a step that doesn't actually hold. The demo makes that concrete with four hand-authored **trace pairs**, embedded as static JSON in the file. Each pair carries one question and one genuinely-correct answer, and comes in two versions that both land on that same answer: a *faithful* trace whose every step is sound, and an *unfaithful* trace that gets there through a real but subtle flaw. The four flaws are deliberately different in kind — a **fabricated fact** (placing New York City at ~38°N to conclude, correctly, that Rome is farther north), an **invented premise** ("only trophies are kept in the cabinet," never stated, smuggled into an otherwise-valid deduction), a **broken justification** (using the right number, 1/4, for the chance of no heads in two flips, but justifying it with "independent events can't overlap," which confuses independence with mutual exclusivity), and a **wrong date** (dating Columbus's first voyage to 1502 instead of 1492, still after Gutenberg, so the conclusion survives). In every case the answer is right, so the trace *feels* right — which is exactly the trap.

## What was built

A three-screen flow: an intro with the reveal-timing toggle, a four-round study, and a results readout. Each session is balanced — every pair appears once, exactly half the traces faithful and half unfaithful, shuffled fresh — so no run is all-sound or all-flawed. The visitor trusts or flags each trace; flagging opens the steps as clickable so they can point at the one they suspect, and the reveal marks the actual load-bearing step, tags the kind of flaw, and explains it. The tool tracks and shows whether they were **fooled** (trusted an unfaithful trace), **caught** it (flagged it, with a bonus for pinpointing the exact step), or raised a **false alarm** (flagged a sound one). The **reveal-timing toggle** — instant, delayed, or on-demand — is the A/B variable: it changes only *when* the trace appears, which is the presentation lever the research found to be nearly inert.

## The finding it demonstrates

The results screen reveals the research from *Seeing the Reasoning* ([arXiv:2603.07306](https://arxiv.org/abs/2603.07306)): changing how a reasoning trace is presented barely moved trust, while whether the reasoning was actually reliable did — and when a trace was unfaithful, most people didn't catch it and trusted it about as much as a sound one. So the presentation the visitor just picked is the part that doesn't matter much; the reliability underneath is the part that does, and it is the part we are worst at reading. That is why it matters for AI literacy: as more tools surface their "chain of thought," reading a trace critically — finding the load-bearing step and asking whether it is actually true — is a skill, not a reflex.

## Verification and gating

Published as a `tools` collection entry and this experiment writeup, matching the Cook Mode / Generative-UI conventions; the runner's generic build-log entry is suppressed in favour of this curated post. The tool makes no network calls, so it sits comfortably inside the existing Report-Only CSP with no header change. Repo gates are green: `npm run check` reports 0 errors and `npm run build` succeeds. Because the change touches `public/**` and `src/content/tools/**`, it is gated for Wolf's review before it ships.
