# LLM-Interaction Research Phase — Design

**Date:** 2026-07-20
**Status:** approved (brainstorm), queued to `engine/BACKLOG.md`

## Motivation

Every lab experiment so far is *observational or utility* — Agent Weekly (digest),
Site Health (monitor), Cook Mode (a tool). Nothing yet explores **new ways of
interacting with LLMs**. This phase adds that thread, but does it the disciplined
way: **research first, build second, gate the build on what research surfaces.**

## Hard constraints (inherited)

- The site is **static on Cloudflare** — no server, no per-visitor LLM call. Any live
  interaction prototype must be client-only, bring-your-own-key, or pre-generated —
  until/unless we stand up an app subdomain (deferred, see *Later*).
- **PR-first, human-gated.** The engine opens PRs; `engine/**` auto-merges under Tier B,
  everything else waits for Wolf.
- **Research work runs in the *experiment* runner, not the coding loop.** `CYCLE.md`
  demands real code; a research task doesn't fit it. Experiments (`run-experiment.mjs`,
  registry-driven, cron-scheduled) are the right vehicle — see Agent Weekly / Site Health.
- Therefore **what we queue in `BACKLOG.md` are the *build tasks* that stand the
  experiments up** (all `engine/**` → auto-zone). The research then runs as experiments.

## The two things we build now

### A. `interaction-landscape` — one-shot sprint (the gate)

A new experiment whose operating manual runs a **deep, Agent-Weekly-style source sweep**
aimed at *interaction paradigms*, not releases: voice / ambient agents, generative &
streaming UI, memory / context UX, multimodal, computer-use, tool-call UX, "thinking out
loud" surfaces, elicitation patterns, etc. Real fetched links, factual voice, no hype.

- `type: 'briefing'` → the direct-vs-review policy sets `draft: true`, so it lands as a
  **draft Lab entry Wolf reviews**. That review **is the gate**.
- The report body **ends with a ranked "Prototype Shortlist"** — each candidate as:
  *what it is · why it's interesting · rough build shape · static-site feasibility
  (client-only / BYO-key / needs-server)*.
- Run **once** (manually or a one-off cron) to produce the sprint. We read the draft,
  pick winners, and promote them to `- [ ]` prototype items.

### B. `interaction-lab` — standing digest (the feed)

A recurring experiment mirroring Agent Weekly:

- `type: 'digest'` → publishes direct (public immediately).
- Wrapper `engine/run-interaction-lab.sh` (source nvm, cd repo root, exec node runner) +
  a **monthly** cron line `0 7 1 * *` — monthly, not weekly, so a deeper survey never
  becomes digest fatigue.
- Lighter "what's new this month in how people interact with LLMs" cadence that keeps the
  landscape fresh as prototypes get built.

## Later (un-queued — promoted only after the sprint)

- **Prototype probes — TBD from the shortlist.** Promoted to `- [ ]` by Wolf + Claude
  after reviewing the draft briefing. Gated on findings, per the chosen discipline.
- **App subdomain (e.g. `app.whatupwolf.com`) for live-LLM prototypes.** The ambitious
  payoff that *lifts the static-only constraint* — real server-side / per-visitor LLM
  interaction (BYO-key or a small edge function). Explicitly deferred until after the
  research phase.

## Non-goals

- No new lab `type` enum values (both `briefing` and `digest` already exist).
- No live LLM API on the static site.
- No speculative prototype tasks queued before the sprint reports.
