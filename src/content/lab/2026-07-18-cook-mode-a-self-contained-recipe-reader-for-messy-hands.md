---
title: "Research and build a first prototype of a better recipe/cooking tool: a self-contained single-file reader at public/tools/cooking.html targeting the known pain points of cooking from a screen."
date: 2026-07-18T22:40
type: experiment
status: done
tags: [tools, cooking, prototype, offline]
live: true
draft: false
tool: /tools/cooking.html
summary: "Built Cook Mode — a dependency-free single-file recipe reader with one-step-at-a-time navigation, timers parsed out of the step text, ingredient scaling, unit conversion, and a screen wake lock."
---

Researched what shipped cooking modes actually do and where cooking-from-a-screen breaks down, then built a v1 at [`/tools/cooking.html`](/tools/cooking.html) — one HTML file, no build step, no dependencies, no network calls.

## What the research said

Claude's recipe cards render an interactive cooking mode with per-step timers, servings adjustment, and US/metric switching. The recurring complaints about cooking from a screen are narrower and more physical than "the recipe is bad": the screen sleeps mid-step and the place is lost; advancing means touching a phone with hands covered in food; and quantities live at the top of the page while the instruction that needs them is halfway down, so following a recipe becomes scrolling between two places. Cook-mode implementations across recipe plugins converge on the same answers — Wake Lock API, one large step at a time, and the ingredients for *this* step shown beneath it.

## What was built

The step view is the whole screen: one instruction at display size, invisible tap zones over the left third and right half, plus arrow keys, space, and swipe. Timers are parsed out of the prose rather than authored — `findTimers` reads "Roast for 25 minutes" and "cook for 20-25 minutes" into startable chips, taking the upper end of a range, and runs several concurrently in a persistent tray with a synthesised WebAudio chime (no audio file, so the page stays one file). Ingredients parse into quantity/unit/name, scale by a servings stepper, and convert between US and metric with cook-legible rounding; quantities render as vulgar fractions (`1½`, not `1.5`). A screen wake lock is taken on entry and re-acquired on `visibilitychange`, since locks drop whenever the tab is backgrounded. State persists to localStorage, so a reload mid-cook returns to the same step.

## Decisions and verification

Two behaviours are deliberately conservative. Per-step ingredient chips are matched by token overlap, but a token shared by two ingredients — "chicken" in both *chicken thighs* and *chicken stock* — is discarded as non-discriminating, because showing the wrong ingredient on a step is worse than showing none. Range durations take the upper bound and are labelled as such. Scaling also prints an explicit warning that cooking times and pan sizes do not scale linearly.

Verification found three defects that unit tests alone missed, all caught by simulating a full cook through the demo recipe: `1/2 tsp black pepper` parsed as quantity `1` with the name `/2 tsp black pepper` (the bare-number regex alternative was matching before the fraction one); `1⅓` rendered as the unreadable `11/3`; and the first version of the chip matcher put *chicken stock* on the "pat the thighs dry" step. All three are fixed and covered. The tool was then driven end-to-end in a DOM harness — 36 checks across parsing, scaling, both unit directions, navigation by tap and by key, timer start and tray rendering, completion, persistence, and three input formats (headings, markdown, and headingless) — all passing with no console errors. Headless-browser verification was attempted first but the sandbox lacks the required system libraries, so layout and the wake lock itself are unverified and need a real device. Repo gates are green: `npm test` 110 passed, `npm run check` 0 errors.

This is a starting point, not a finished tool. Voice control ("next"), recipe import from a URL, and multi-recipe timing are the obvious next slices.
