---
title: "Build the Voice Loop — a browser-only BYO-key spoken loop around Claude that instruments the cascaded latency budget per turn."
titleLevels:
  aware: "Voice Loop — a spoken loop around Claude, with the cascade timed"
  plain: "Voice Loop — talk to Claude in your browser, and watch where the delay comes from"
date: 2026-07-24T17:10
type: experiment
status: done
tags: [tools, ai, voice, speech, latency, prototype, byo-key]
live: true
draft: false
tool: /tools/voice-loop.html
summary: "Built the Voice Loop — a self-contained BYO-key tool at /tools/voice-loop.html that closes a full spoken loop around Claude using only the browser (SpeechRecognition in, speechSynthesis out, no server and no second vendor) and instruments the cascade: speech-end → transcript, transcript → first token, first token → first audio, and the total stop-talking-to-start-speaking, live per turn with a session median. Push-to-talk and continuous turn-taking, barge-in, verbatim transcript alongside the conversation, and explicit copy that the browser's recogniser may ship audio to the browser vendor."
summaryLevels:
  aware: "Built the Voice Loop: a single-file, bring-your-own-key tool that talks to Claude using only the browser's own speech recognition and speech synthesis — no server, no second vendor, no extra key. The research payload is the stopwatch: every turn is split into the four stages of the cascade, live, with a running session median, so the cost of gluing four systems in a line is something you measure in your own hands. Two turn-taking modes (explicit push-to-talk versus a VAD guess), barge-in, and the raw recogniser output shown next to every turn so mishearings stay visible."
  plain: "Built a tool that lets you talk to Claude out loud in your browser and hear it answer. The real point is the timer: it breaks every exchange into the steps that made it slow — hearing you, thinking, starting to speak — so the lag stops being vague. You can hold a button to talk or leave the mic open, and it always shows what it thought you said so you can catch mishearings. Your Anthropic key stays in your browser, but the page says plainly that the browser's speech recognition may send your voice to the browser maker."
---

Built the fourth prototype from the LLM-interaction research phase: a self-contained voice tool at [`/tools/voice-loop.html`](/tools/voice-loop.html), one HTML file, no build step, no dependencies. It closes a complete spoken loop around Claude using **only the browser** — `SpeechRecognition` for speech in, `speechSynthesis` for speech out — so the Anthropic-only, one-key, no-server posture the other Lab tools use survives intact into a modality that usually drags in a second vendor and a backend.

## The point is the stopwatch, not the chat

A chat with a voice on it is not a finding. The instrumented cascade is. Every turn is timed in four stages and displayed live, with a running session median and a per-turn log that copies out as TSV:

1. **speech-end → final transcript** — endpointing plus recogniser finalisation.
2. **transcript → first model token** — request construction, network, and streamed time-to-first-token.
3. **first token → first audible audio** — buffering enough text to be worth saying, plus synthesiser start.
4. **stop talking → start hearing** — the sum, which is the only number a person in the room can feel.

Stage 3 is a policy as much as a measurement, and the page says so: text is flushed to the synthesiser at the first sentence boundary rather than at the end of the reply, because waiting for the whole reply would be simpler and roughly double that stage. Stage 1 differs by mode on purpose. **Push-to-talk** starts the clock at button release — an explicit floor handoff, so the instant is exact. **Continuous** starts it at the recogniser's own guess and includes the settle window the page waits out before believing that guess. Running the same sentence through both modes is the cheapest way to see that a meaningful share of perceived latency is the endpointer, not the model.

Barge-in cancels in-flight `speechSynthesis` when the user takes the floor again — the talk button in push-to-talk, detected speech after a short echo-guard window in continuous mode. A new utterance while a request is still streaming aborts it and supersedes the turn, which is logged rather than silently dropped. The copy is explicit that all of this is **half-duplex**: one party holds the floor at a time, there is no overlap or backchannel, the model never hears tone — only text — and cancelling playback mid-sentence is a crude approximation of what a native speech-to-speech model does over a continuous stream.

## The architecture fork, and which side the Lab is on

Voice agents split into two families. **Cascaded** systems chain ASR → LLM → TTS: four systems in a line whose latencies add rather than overlap, and which throw away everything that was not words — prosody, hesitation, overlap, the fact that someone started to interrupt. **Speech-to-speech** models take audio in and emit audio out, keeping the paralinguistic signal and the ability to listen and talk at once. This build is deliberately on the cascaded side, because the Lab's constraint is Anthropic-only and browser-only: Claude is a text model, so any voice loop reachable with one Anthropic key and no backend *is* a cascade. Naming that constraint honestly, and then measuring what it costs, is more useful than pretending the gap is small.

The gap is not small. The τ-Voice benchmark ([arXiv:2603.13686](https://arxiv.org/abs/2603.13686)) ran matched agent tasks in text and in voice: roughly **85% task completion in text** falls to **31–51% on clean audio** and **26–38% under realistic noise and accents** — and **79–90% of the failures are attributed to the agent's own behaviour** rather than to transcription errors. That last figure is the uncomfortable one. It says the dominant problem is not that the words arrive wrong; it is that agents behave worse once the channel is speech. Latency is the part of that you can feel in ten seconds with this page. The capability gap is the part you cannot, which is exactly why it needs citing next to a tool that makes voice feel easy.

## Mishearing is visible by construction

A transcript-free voice UI hides its most common real-world failure. Here the verbatim recogniser output is shown in a dedicated panel — settled text solid, in-flight guesses italic — and every user turn in the conversation carries the raw transcript plus the endpoint kind (button, VAD guess, or typed) and, where the browser reports it, the recognition confidence, flagged when it drops below 75%. Claude's system prompt is told outright that its input is speech-recognition output and will contain mishearings, and to infer intent from context rather than parroting a garbled word back.

## Graceful degradation, and honesty about the audio

Both speech APIs are feature-detected. Firefox ships no `SpeechRecognition` implementation at all, so there is nothing to fall back to; instead of breaking silently the page shows a plain on-page explanation, disables the mic controls, and keeps a **type-a-turn** box that still exercises and times the model and speech-out stages. A missing `speechSynthesis` is handled the same way, with the last two stages honestly reported as unmeasurable rather than zero.

The trust UX carries a second claim that the other Lab tools do not have to make. The key messaging is unchanged — key in `localStorage`, sent only to `api.anthropic.com`, static site with no backend to receive it, get-a-key link and a forget-key button. But "nothing leaves your browser" covers the key and **not the audio**: in Chrome and Edge the browser's `SpeechRecognition` is a network service that streams captured audio to the browser vendor for transcription, and this page can neither see nor prevent that. A dedicated privacy panel separates the three answers (key stays; voice probably does not; words go to Anthropic), the microphone permission is explained on its own screen *before* the browser prompt fires, and the voice picker labels each synthesis voice `device` or `network` so remote TTS is visible too.

## Coordination and verification

Model ids and the browser-direct calling contract were confirmed via the `claude-api` skill rather than hardcoded from memory: `fetch` to `https://api.anthropic.com/v1/messages` with `stream: true` SSE, `x-api-key`, `anthropic-version: 2023-06-01`, and `anthropic-dangerous-direct-browser-access: true`. Default is Claude Sonnet 5 with a Haiku 4.5 / Opus 4.8 picker — Haiku is a genuinely interesting row in a latency table, not just a cheaper option — and thinking is disabled on the models that accept the parameter to keep time-to-first-token as low as the API allows. `https://api.anthropic.com` was already present in the `public/_headers` CSP `connect-src`, so the policy was left exactly as it was. Published as a `tools` collection entry and this experiment writeup, matching the Cook Mode / Generative UI conventions.

Repo gates are green: `npm run check` reports 0 errors, `npm test` passes, and `npm run build` succeeds. The spoken loop itself was not exercised against a live key or a real microphone in this build — it is BYO-key and there is no server, and the sandbox has neither audio hardware nor a browser speech engine — so end-to-end behaviour and the measured numbers need a real device. Because it touches `public/**` and `src/content/tools/**`, the change is gated for Wolf's review.
