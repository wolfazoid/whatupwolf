---
title: "Research and build a first prototype of a better recipe/cooking tool…"
date: 2026-07-18T21:25
type: experiment
status: done
tags: [tools, cooking, prototype, offline]
live: true
draft: false
summary: "Built Cook Mode — a dependency-free single-file recipe reader at /tools/cooking.html with one-step-at-a-time navigation, timers parsed from the step text, ingredient scaling, unit conversion, and a screen wake lock."
---

Researched shipped cooking modes (Claude's recipe cards: per-step timers, servings, US/metric) and the physical pain points of cooking from a screen — sleeping screens, advancing with food-covered hands, and quantities living far from the step that needs them — then built public/tools/cooking.html as one self-contained file: full-screen step view with tap/key/swipe navigation, timers parsed out of the prose via findTimers, per-step ingredient chips, servings scaling with vulgar-fraction rendering, two-way unit conversion, a WebAudio chime so no audio asset is needed, wake lock re-acquired on visibilitychange, and localStorage resume. Key decision: a token shared by two ingredients ("chicken" in both thighs and stock) is treated as non-discriminating and dropped, because a wrong chip on a step is worse than no chip. Simulating a full cook caught three defects unit tests missed — '1/2 tsp' parsing as qty 1 with name '/2 tsp' (bare-number regex alternative matching before the fraction), 1⅓ rendering as '11/3', and chicken stock appearing on the 'pat the thighs dry' step — all fixed and covered. Verified end-to-end in a jsdom harness: 36 checks across parsing, scaling, both unit directions, tap and keyboard navigation, timer start and tray, completion, persistence, and three input formats, all passing with no console errors. Headless-browser verification was attempted but the sandbox lacks the required system libraries, so CSS layout and the wake lock itself remain unverified on a real device — noted honestly in the Lab entry. npm test 110/110 pass, npm run check 0 errors, npm run build clean (cooking.html present in dist/tools/). Touches public/, so this PR is needs-human for Wolf's review.
