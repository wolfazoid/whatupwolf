---
title: "Encode the direct-vs-review gate"
date: 2026-07-18T04:14
type: experiment
status: done
tags: [engine, publish-gate]
live: true
summary: "Encoded the direct-vs-review gate as a pure per-type policy and wired it into the runner's lab-entry render."
---

Added draftForType(type) to engine/lib.mjs: monitor/experiment publish direct (draft:false) while briefing, note, and any unknown type fail safe to draft:true for review. Taught renderLabEntry to stamp a draft field and wired run-cycle.mjs to derive the entry's draft flag from the policy at render time. Unit-tested the policy (direct types, gated types, fail-safe defaults) plus renderLabEntry's new draft output; npm test (39 passing) and npm run check both green.
