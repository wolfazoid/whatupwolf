---
title: "Add `digest` to the direct-publish policy in engine/lib.mjs so…"
date: 2026-07-18T04:58
type: experiment
status: done
tags: [engine, publish-policy]
live: true
draft: false
summary: "Digest entries now publish direct (draft:false) via the direct-vs-review gate."
---

Added 'digest' to DIRECT_PUBLISH_TYPES in engine/lib.mjs so draftForType('digest') returns false, treating digests as factual machine-log roll-ups that ship live alongside monitor and experiment entries. Updated the policy comment and added a unit test asserting the new behavior. npm test (40 passed) and npm run check (0 errors) both pass.
