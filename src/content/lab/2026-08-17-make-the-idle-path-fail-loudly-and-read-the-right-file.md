---
title: "Make the idle path fail loudly and read the right file"
date: 2026-08-17T15:04
type: experiment
status: done
tags: [engine, idle-notifications]
live: true
draft: false
summary: "Idle sweep failures now post a notice instead of vanishing, and the idle notice reads IDEAS.md from main as the sweep-date marker intends."
---

Two defects in the idle path of engine/run-cycle.mjs. runIdleIdeation() was called bare, so a claude failure or missing report unwound past notifyIdle to the top-level catch: on the one tick where the machine was both idle and broken, nothing was posted and the only trace was the gitignored cycle.log. The sweep now runs in its own try, and the notice leads with the failure and its error. Because that notice describes the older sweep main still holds — a date the standing issue has usually already reported — idleMarker/sweepReported gained a second key (sweep-failed=<day>), so the failure posts once instead of being swallowed as a duplicate or repeating hourly. Second, the comment claimed IDEAS.md was re-read from main, but publishBranch never checks main back out, so HEAD was still on lab/ideas-<date> with today's section committed; the sweep-date marker is documented as firing on the first tick where main carries the sweep, so the code was wrong, not the comment, and the read is now preceded by recoverToMain(). npm test (291 passing, 7 new) and npm run check both green.
