---
title: "Extract the commit/push/PR/account-restore machinery from…"
titleLevels:
  aware: "Extracted a reusable publishBranch()"
  plain: "Tidied up the publishing step so it is shared, not copied"
date: 2026-07-18T05:01
type: experiment
status: done
tags: [engine, refactor]
live: true
draft: false
summary: "Extracted the commit/push/PR/account-restore machinery into a reusable publishBranch() in engine/publish.mjs and rewired run-cycle.mjs to call it."
summaryLevels:
  aware: "Pulled the commit, push and pull-request machinery into one reusable publishBranch() so every job shares it."
  plain: "The steps for saving and submitting finished work were written out twice. Merged them into one, so there is a single thing to fix if it ever breaks."
---

Moved section 7's stage/commit/push/PR flow plus currentGhUser() out of run-cycle.mjs into a new engine/publish.mjs exporting publishBranch({repoDir, branch, commitMsg, prTitle, prBody, ghUser, dry}); run-cycle now computes the PR title/body and delegates. Preserved the gh-account restore + can't-identify-prior-account warning, and gave publishBranch its own dry path (logs every shell-out, never reads/switches gh auth, bypasses the restore branch) for zero side effects. Added engine/publish.test.mjs covering the dry-mode command sequence; npm test (41) and npm run check both pass, and `node engine/run-cycle.mjs --dry-run` is unchanged apart from the wall-clock timestamp. Note: engine/publish.mjs is a new path outside the auto-merge allowlist, so this PR waits for Wolf's manual review.
