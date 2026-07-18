# Spec — "Agent Weekly" (the engine's first real experiment)

**Status:** Approved design (brainstorm complete 2026-07-17). Ready for planning.
**Repo:** `~/whatupwolf`
**Owner:** wolf@wearefeasting.com
**Parent:** [`self-building-lab-engine`](2026-07-17-self-building-lab-engine-design.md) — this is the engine's first *experiment* (its payload), distinct from the self-building loop.

---

## 1. What this is

A **weekly curated intelligence digest** on AI-agent tooling & model releases. Once a week
the machine reads the firehose, curates the ~5–8 things that actually mattered, and
publishes a skimmable brief to the Lab.

- **Primary purpose: dogfood.** It exists because Wolf will actually read it to stay current.
  Public proof-of-work is the *side-effect*, not the goal — which is what makes it sustainable.
- **Delivery:** Wolf reads it via **RSS** (the site already ships per-collection feeds). No email.
- **Beat:** AI-agent tooling & model releases (frameworks, model launches, agent techniques,
  standout repos/papers). On-brand ("someone who ships agents") and the fastest-moving firehose.
- **Cadence:** weekly, **Sundays at 07:00**.
- **Voice:** factual curation, concise, no hype — machine-log voice per the engine's rules
  (this is *not* Wolf's editorial opinion).

---

## 2. Execution architecture

An experiment is **not** the self-building coding loop: it researches and publishes rather
than writing code that passes tests. So it gets its own runner.

- **`engine/run-experiment.mjs <name>`** — a dedicated, minimal experiment runner. It reuses
  the shared publish machinery (kill-switch check, main sync, git commit/push/PR) and the
  `lib.mjs` helpers (`renderLabEntry`, `shortTitle`, etc.).
- **Refactor:** extract the shared git/commit/push/PR/publish steps out of `run-cycle.mjs`
  into a reusable helper (e.g. `engine/publish.mjs`) so both the coding loop and the
  experiment runner use one implementation (DRY).
- **`engine/experiments/agent-weekly.md`** — the experiment's operating manual (the prompt:
  what beat, what sources, format, hard rules).
- **No general experiment-runner framework yet.** The parent spec deferred it (YAGNI) until
  2–3 experiments exist to shape the interface. Build this one concretely; extract later.

*Alternatives rejected:* overloading the coding loop with a "recurring backlog item"
(conflates two very different modes; the verify gate and check-off semantics don't fit); or
building the framework now (premature).

### One cycle of `run-experiment.mjs agent-weekly`

1. Kill-switch check (`engine/PAUSED`) — reuse the loop's behavior.
2. `git checkout main` + `git pull`.
3. Invoke headless `claude -p` with `engine/experiments/agent-weekly.md`, instructing it to
   research the past week via WebSearch/WebFetch and write a report to
   `engine/.experiment-report.json` in the existing cycle-report shape
   (`{ status, summary, tags, body }`, where `body` is the digest markdown).
4. Runner renders a Lab entry: `type: digest`, `title: "Agent Weekly — week of <date>"`
   (runner-generated for consistency), plus the machine's `summary`/`tags`/`body`.
5. Branch `lab/agent-weekly-<date>`, commit, push, open a PR.

The PR touches only `src/content/lab/*` → it's in the guard allowlist → **auto-merges on
green CI** (Tier B), fully hands-off.

---

## 3. What the machine does each run

Using Claude Code's **WebSearch/WebFetch**, gather the past week's items, then curate.

- **Sources (defaults):** official blogs/changelogs (Anthropic, OpenAI, Google DeepMind,
  Meta AI), major agent-framework releases, trending agent repos on GitHub, key arXiv agent
  papers, top Hacker News threads. Best-effort on public pages; sources it can't reliably
  reach (e.g. X/Twitter) are simply out of scope.
- **Hard rule — every item must carry a real, fetched link.** No unlinked or hallucinated
  entries. A slow week yields a *shorter honest* brief, never padding.
- **Recency:** only items from the past 7 days.

---

## 4. Digest format (the Lab entry body)

- One-line intro: week range + item count.
- **Top items** (~5–8), each: **Title** — one line on what it is · *why it matters* · link.
  Standouts may be tagged "worth building with."
- A short **"also noted"** list of minor items (title + link).
- Concise, skimmable, factual.

---

## 5. Publishing

- **New `type: digest`** that **publishes direct** (hands-off). This is a one-time **schema
  change** in `src/content.config.ts` (add `digest` to the `lab` type enum) — a **gated path**,
  so Wolf merges that PR once. After that, every weekly digest flows automatically.
- **Direct-vs-review gate:** update the per-type policy (in `lib.mjs`, engine-zone) so
  `digest` is in the direct-publish set (alongside `monitor`/`experiment`); `briefing`/opinion
  still route to draft.
- **Lab rendering:** confirm the feed renders the new `type` acceptably (it's shown as mono
  chrome metadata); a trivial component touch is possible but likely unneeded.
- **Sanitizer:** this experiment is **public by construction** (all sources public), so the
  private/public sanitization rail is *not* exercised here. It remains available for future
  experiments that touch private/client data.

---

## 6. Scheduling

A weekly cron, separate from any self-building schedule:

```cron
# Agent Weekly — Sundays 07:00
0 7 * * 0 cd ~/whatupwolf && /usr/bin/node engine/run-experiment.mjs agent-weekly >> engine/experiment.log 2>&1
```

Covered by the existing off-switches: `engine/PAUSED` (`npm run pause`) halts it before it
spends any Claude quota; disable the cron line to stop scheduling; `git revert` any entry.

---

## 7. Implementation note (for the plan)

Most of this lives in `engine/` (auto-zone), so it can be **built by the engine itself**:
queue the runner, the shared-publish refactor, the experiment prompt, and the policy update
as backlog items, and the Tier-B loop builds and auto-merges them. Wolf hand-merges only the
**gated schema change** (`content.config.ts`) and any Lab-component tweak. The flywheel builds
the flywheel. (The plan decides how much is engine-built vs. hand-built.)

---

## 8. Definition of done

- [ ] `engine/run-experiment.mjs agent-weekly` runs end-to-end: researches, writes a report,
      renders a `type: digest` Lab entry, opens an auto-merging PR.
- [ ] Shared publish machinery is factored out of `run-cycle.mjs` and reused (both still work).
- [ ] `type: digest` exists in the schema and publishes direct via the gate policy.
- [ ] `engine/experiments/agent-weekly.md` encodes the beat, sources, format, and the
      real-link hard rule.
- [ ] One real digest is generated, verified (links resolve, recency correct, machine-voice),
      and live on `/lab` + RSS.
- [ ] Sunday-07:00 cron documented in `engine/README.md`; `PAUSED` halts it.

## 9. Out of scope

- The general experiment-runner framework (extract after 2–3 experiments).
- Email delivery / any private-report split (unneeded — all public).
- Additional beats or cadences (add later once this one proves out).

## 10. Decisions

- **Publishing: direct.** `type: digest` publishes without draft-review from the first entry (confirmed 2026-07-17).
- **First run: autonomous.** The engine builds and runs the first digest itself — no supervised hand-authored run. "Prove it out" end-to-end (confirmed 2026-07-17).

### Still to settle in the plan

- Exact `claude -p` tool/permission flags for a research run (WebSearch/WebFetch enabled).
- Report shape reuse vs. a dedicated experiment-report schema (lean: reuse `{status,summary,tags,body}`).
