# Spec — Self-Building Lab Engine (Phase-2, Slice #1)

**Status:** Approved design (brainstorm complete 2026-07-17). Ready for planning.
**Repo:** `~/whatupwolf`
**Owner:** wolf@wearefeasting.com
**Parent spec:** [`whatupwolf-site.md`](whatupwolf-site.md) — this is the first slice of that spec's Phase 2.

---

## 1. What this is

The first slice of the always-on engine: a **self-building machine**. A scheduled agent
works a backlog of engine-building tasks, opens a PR for each, and logs the work to the
Lab feed. Its destination is the Phase-2 engine itself — the machine builds the machine.

### The bootstrap arc (why it's shaped this way)

The Phase-2 engine *is* the always-on box that auto-publishes to the Lab. So "the machine
builds the Phase-2 engine" is the engine building itself — and it doesn't exist yet. It
can't build itself from nothing.

The resolution: **we hand-build a minimal bootstrap loop, and its first assigned job is to
build out the rest of the engine.** The scaffold builds the real machine, then dissolves
into it. This is not throwaway scaffolding — the minimal loop *is* two of the four Phase-2
deliverables from the parent spec:

- **Phase-2 item #2** (cron + headless auto-publish) — the loop itself.
- **Phase-2 item #4** (direct-vs-review gate) — expressed as "PR you approve."

And its first backlog item delivers **Phase-2 item #3** (the public-safe sanitization
filter). The Lab entries become a build-log of an agent building an agent product — the
exact proof-of-work the site's buyers care about.

### What ships in this slice

1. **The bootstrap loop** — hand-built by us (see §2). It can't build itself from nothing.
2. **The sanitization filter** — the first real engine capability, built **by the loop** as
   its first backlog item. The slice's headline proof is: *watch the self-building machine
   build a real, security-critical piece of the engine and open a PR for it.*

Two design calls, confirmed with the owner:

- **(a)** The harness is hand-built by us; only *capabilities* are machine-built.
- **(b)** The sanitizer's tests are **human-seeded** — we write the failing tests + fixtures,
  the machine makes them pass. This keeps the owner tightly in the loop on the first
  security-critical build and makes PR review binary (green or not).

---

## 2. Components

### `engine/run-cycle.mjs` — the runner

Node (matches the repo, stays testable), invoked by cron. One cycle:

1. `git pull` latest `main`.
2. Read `engine/BACKLOG.md`, pick the top unchecked item.
3. Create a branch `lab/<slug>`.
4. Invoke **headless Claude Code** non-interactively with the cycle prompt + the backlog item.
5. Run `npm run check` and the test suite.
6. Commit the work; the machine also **checks off its backlog item** in the same commit
   (idempotency — cycles don't repeat work).
7. Write a `src/content/lab/*.md` build-log entry on the branch (see §5).
8. Push the branch and open a PR via `gh`.

Merging the PR (by the owner) → Cloudflare deploys → the Lab entry goes live.

**Honest logging:** if `npm run check` or tests go red, the cycle **still** opens the PR and
the Lab entry records the failure. Real proof-of-work includes the misses.

**Git auth:** the runner uses the `wolfazoid` GitHub account, not the default Pack account
(`wolfhoward-pack`), per the two-account gotcha (see the `deploy-setup` project memory). A
plain push on the wrong account fails with `could not read Username`.

### `engine/CYCLE.md` — the operating manual

The standing instructions handed to headless Claude Code each cycle: read the backlog,
implement the top item, follow repo conventions, write tests, open a PR, and log honestly
(including failures). This is the machine's constitution; editing it steers behavior.

### `engine/BACKLOG.md` — the task queue

An ordered, checkbox list of engine-building tasks. **This is the owner's steering wheel** —
human-editable between cycles. Top item for this slice:

> *Build the sanitization filter (spec + failing tests provided).*

Items below it (experiment-runner framework, first real experiment, Gmail delivery, …) are
**not touched in this slice** — they exist only to show the queue's intent.

### `src/lib/sanitize.ts` + tests — the first capability

The capability the machine builds this slice. Design in §3.

### Lab integration — no schema change

Build-log entries use the **existing** `lab` collection as `type: experiment`. No new
`type` and no schema change (YAGNI). The entry's `status` records the cycle outcome
(`done` / `flagged`), and `live: true` drives the existing pulse-dot for fresh entries.

---

## 3. The sanitization filter

**Core design call: allowlist + fail-closed. Never denylist-scrubbing.**

- **Signature:** `sanitize(report: PrivateReport): PublicSnapshot` — a pure function, no I/O.
- **Allowlist:** the `PrivateReport` carries an explicit `public: {…}` block the author
  fills. The sanitizer **emits only allowlisted fields.** Default is reveal-nothing. We
  never regex known-bad patterns out of free text — that fails open and is fragile.
- **Belt-and-suspenders scan:** a registry of known secrets (client names, domains, tokens)
  is scanned against the *emitted* output. If any registered secret appears in what would
  go public, the function **throws** — fail-closed. A leak is a crash, not a silent pass.

### Types (starting shape — refine in the plan)

```ts
interface PrivateReport {
  // Full internal detail — never emitted wholesale.
  meta: { client?: string; urls?: string[]; secrets?: string[] };
  findings: string;           // free-form internal write-up
  public: PublicSnapshot;     // author-curated, safe-to-publish subset
}

interface PublicSnapshot {
  title: string;
  summary: string;            // one-liner for the feed
  body?: string;              // optional public detail
  tags?: string[];
}
```

The registry of secrets to scan against is assembled from `report.meta` (client, urls,
secrets) plus any globally-registered terms.

### Tests (human-seeded — we write these)

Fixtures of `PrivateReport`s with **planted** secrets, asserting:

1. **Allowlist holds** — the returned `PublicSnapshot` contains only allowlisted content;
   no `meta` field leaks through.
2. **Scan fails closed** — a fixture that deliberately smuggles a registered secret into a
   `public` field causes `sanitize` to throw.

The machine's job is to make these failing tests pass. Review is binary: green or not.

---

## 4. Data flow & safety

```
cron → run-cycle → headless Claude Code (reads BACKLOG + CYCLE)
     → branch + code + tests + Lab entry → PR
     → [owner reviews & merges] → Cloudflare deploy → live
```

- **PR-first by construction** — nothing auto-merges. The owner is the gate every cycle.
- **Fail-closed sanitizer** — a leak throws rather than publishes.
- **Honest logging** — red cycles still open a PR; the Lab entry records the miss.
- **Git auth** — runner uses the `wolfazoid` account (see §2).
- **Idempotency** — the machine checks off its backlog item in the same PR.
- **Cost** — modest cron interval (daily) for this slice.

---

## 5. Lab build-log entry

Each cycle writes one `src/content/lab/<date>-<slug>.md` using the existing schema:

```yaml
---
title: <what the cycle did>
date: <cycle timestamp>
type: experiment
status: done | flagged      # flagged if tests went red
tags: [engine, <capability>]
live: true                  # fresh — drives the pulse-dot
summary: <one-liner for the feed>
---
```

Body: what it tried, a diff summary, and pass/fail — a readable narrative, not a raw log.

---

## 6. Definition of done

- [ ] `engine/run-cycle.mjs`, `engine/CYCLE.md`, `engine/BACKLOG.md` exist and a cycle can be
      run manually end-to-end.
- [ ] The loop runs **one real end-to-end cycle**: the machine picks the sanitizer backlog
      item → implements it → tests green → PR opened → Lab entry drafted → owner merges → live.
- [ ] `src/lib/sanitize.ts` is allowlist + fail-closed, with passing human-seeded
      planted-secret tests.
- [ ] `npm run check` stays green; the site still builds.
- [ ] A short doc (`engine/README.md`) covers: running a cycle manually, the cron setup, and
      the `wolfazoid` git-auth handling.

---

## 7. Out of scope (later slices)

- The **experiment-runner framework** — deferred until 2–3 real experiments exist to shape
  its interface (avoiding premature abstraction).
- Any **real experiment** — what the engine actually monitors or produces. (The owner
  rejected site-monitoring as the first experiment; this decision is deliberately deferred
  to a future backlog item, guided by the owner.)
- **Gmail delivery** of the private report via Gmail MCP (flagged unreliable headless).
- **Auto-merge** — the loop stays human-gated.

---

## 8. Open decisions (settle in the plan)

- **Cron mechanism** — local `cron` vs a small always-on script with an internal timer.
- **Headless Claude Code invocation** — exact non-interactive command + allowed-tools scope.
- **Branch/PR hygiene** — one PR per cycle; how stale/abandoned `lab/*` branches get cleaned.
- **`sanitize` type details** — final shape of `PrivateReport` / `PublicSnapshot` and the
  secret-registry source.
