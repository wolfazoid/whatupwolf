---
title: "Voice Loop"
description: "A bring-your-own-key voice prototype that closes a full spoken loop around Claude using only the browser — SpeechRecognition in, speechSynthesis out, no server and no second vendor — and instruments the cascade: speech-end → transcript, transcript → first token, first token → first audio, and the total stop-talking-to-start-speaking, live per turn with a session median. Push-to-talk and continuous turn-taking, barge-in, and the raw transcript shown alongside every turn. One file, no build step."
descriptionLevels:
  aware: "A bring-your-own-key voice prototype: talk to Claude entirely in the browser, using the browser's own speech recognition and speech synthesis. The point is the stopwatch — every turn is broken into the four stages of the cascade, live, with a session median, so you can feel where a voice agent's delay actually comes from. Push-to-talk or continuous turn-taking, barge-in, and the raw transcript shown next to the conversation so mishearings stay visible."
  plain: "Talk to Claude out loud in your browser and it talks back. The real point is the timer: it shows you exactly where the delay comes from — hearing you, thinking, then starting to speak — so you can feel why talking to an AI lags. You can hold a button to talk or just leave the mic on, and it always shows you what it thought you said, so you can spot when it mishears. You paste your own Anthropic key and it stays in your browser — though note the browser's speech recognition may send your audio to the browser maker."
href: "/tools/voice-loop.html"
date: 2026-07-24
tags: [ai, voice, speech, latency, prototype, byo-key]
---
