---
title: "Add `digest` to the direct-publish policy in engine/lib.mjs so…"
titleLevels:
  aware: "Digests publish without review"
  plain: "Weekly summaries now publish on their own"
date: 2026-07-18T04:58
type: experiment
status: done
tags: [engine, publish-policy]
live: true
draft: false
summary: "Digest entries now publish direct (draft:false) via the direct-vs-review gate."
summaryLevels:
  aware: "Digest entries now go straight to the site instead of waiting as drafts."
  plain: "The weekly news summaries now go live on their own, instead of sitting and waiting for me to approve them."
---

Added 'digest' to DIRECT_PUBLISH_TYPES in engine/lib.mjs so draftForType('digest') returns false, treating digests as factual machine-log roll-ups that ship live alongside monitor and experiment entries. Updated the policy comment and added a unit test asserting the new behavior. npm test (40 passed) and npm run check (0 errors) both pass.
