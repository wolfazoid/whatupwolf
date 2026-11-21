# Private market desk — design

**Date:** 2026-11-10 · **Status:** draft for Wolf's review
**Working name:** `market-desk` (Claude's call; rename freely)

## Intent

Wolf wants market-moving information in front of him early enough to act, with the
*reason* attached. Two real trades frame it:

- **INTC (won):** the government announced a stake. The news itself was the signal, and
  he caught it.
- **TTD (lost):** he saw the price falling but not why: an earnings-driven shift in
  fundamentals, with pundits and hedge funds losing confidence in the business model.
  The price drop was a symptom; the cause was available and he didn't see it.

So the system's job is **capture and present**: collect the information that moves U.S.
stocks and put it, with its source, where Wolf will see it. It does **not** interpret,
analyse, or suggest trades, at least for now.

The second intent: it should **build itself out** over time, adding sources and improving
on its own, so Wolf checks in periodically to understand, adjust, and extract data rather
than building it by hand.

## What it captures

1. **Earnings:** key points from reports (the numbers and guidance changes, not just
   beat/miss), plus the reaction around them, such as analyst rating changes.
2. **Major company announcements** that move a stock hard either way: deals, government
   stakes, guidance changes, leadership exits, halts.
3. **Government and world news** with significant U.S. market impact, including policy
   decisions.
4. **Fed and Treasury:** rate decisions, statements and speeches, Treasury auctions and
   actions.

## The two outputs

### Morning brief, once at market open

- One **flat list**, no categories. Each line: time · ticker (or `MACRO`/`FED`) ·
  headline · source link.
- A plain, easy-to-process file. *Claude's call:* a dated Markdown file
  (`briefs/YYYY-MM-DD.md`) served by the desk's web server, so it opens like a
  document and pastes cleanly into Claude, a doc, or a sheet.
- Produced and sent at **08:15 CT** on trading days. *Claude's call:* Wolf said "at market
  open" and wants 10–15 minutes to scan before trading, so it lands before the 08:30 bell.
- Delivered as a **Telegram ping** (see Alerts), with the top
  lines and a link to the full brief.
- **Order is chronological, newest first.** *Claude's call:* any "importance" ranking
  would be interpretation. The ping's "top lines" are the item count plus the most recent
  lines that fit in one message, not a ranked selection. Volume is controlled by *what is
  captured* (the four categories, the form allowlist, the stock universe), not by
  ranking. (OPEN: universe; see the questions at the end.)

### Live feed, during the trading day

- A **single stream, newest on top** (Wolf chose this over per-category lanes), in a small
  window kept in a corner of the screen.
- Every line links to its source so a headline can be checked in one click.
- Light filters (category, ticker) are fine. Interpretation is not.
- *Claude's call:* the page polls every ~15 s with vanilla JS, no framework. SSE is allowed
  on a private network but is not needed for v1.

## Where it runs

- On Wolf's **always-on desktop agent box** (he SSHes into it; it already runs the
  whatupwolf engine). Collection, storage, the web server, the build loop and delivery all
  run there.
- The live feed and brief are reachable **only privately** from Wolf's Mac (his desk
  machine, where the feed window sits during the session), never on the public internet.
  The box does all collecting and serving; the Mac only views. Wolf confirmed this split
  on 2026-11-10: collecting on the Mac would leave gaps whenever it sleeps. *Claude's call:* Tailscale, if it's already on the box; otherwise
  an SSH tunnel.
- **Its own private repository**, separate from whatupwolf. *Claude's call:* a bad build
  here must not touch the public site, and licensed Benzinga content must never live next
  to public code.

## Self-building loop

**What Wolf wants to find when he checks in:**

- **New sources added.** Each new source gets a line: what it covers, and how many items
  it has contributed since it was added (*Claude's call*, so Wolf can judge whether it
  earns its place).
- **A short changelog** of what was built: plain sentences, one line per change, each
  linked to its commit.

**How it works (Claude's call):** it reuses the whatupwolf engine's pattern. A
`BACKLOG.md` of tasks; each cycle runs `claude -p` on one task in a fresh worktree;
tests must pass; then merge. Because this is private and the hard limits below hold,
cycles **auto-merge** when green, except changes to protected files (below), which open a
PR for Wolf. When the backlog is empty, the loop may queue **source-discovery** tasks
itself: find a free public source in one of the four categories and add it. Wolf can edit
the backlog any time; that is the main steering wheel.

**Schedule (Claude's call):** builder cycles run outside the trading session (evenings and
weekends) so a long build never competes with live collection on the box.

## Hard limits (anti-goals)

Wolf named four things that would make this a failure even if it works. Each is enforced
in code or config the loop cannot edit, not just written in its instructions.

1. **Never pulls in something that costs money on its own.** Sources live in a registry,
   and every entry declares cost and whether it needs an account. The loop may add only
   `free` + `no account` sources by itself. **Paid sources are welcome if they earn their
   price** (Wolf, 2026-11-10), but the loop's job is to *build the case*, never to buy:
   a short case file per candidate covering cost, what it covers that current sources
   don't, a sample of what it would have caught in recent weeks, overlap with existing
   sources, and terms. Wolf decides, signs up and adds the credentials himself.
2. **Never gets the IP banned.** All outbound HTTP goes through **one shared fetch
   client** with a per-host rate limiter, required headers (EDGAR: a `User-Agent` with real
   contact info, 10 req/s hard cap, run well under it), and a **circuit breaker**: a 403,
   429 or ban-shaped response stops that host and notifies Wolf. A test fails the build if
   any code makes a network call outside that client.
3. **Never creates accounts or signs up for anything.** No registrations, no accepting
   terms, no email verification flows. If a source needs an account, that is a request
   for Wolf.
4. **Never runs through Wolf's Claude usage.** A hard per-cycle cap (turns/time) and a
   hard **weekly cycle budget**; when it's spent, the loop stops until the next window and
   says so in the changelog. Default (*Claude's call*): at most 1 cycle per weeknight and
   3 per weekend day, adjustable in one config value. The loop also respects a `PAUSED`
   file, like the existing engine.

**Protected files** (the loop can propose changes via PR but never auto-merge them): the
source registry's cost/account/terms fields, the fetch client and rate-limit config, the
budget config, the auto-merge guard itself, and anything holding credentials.

**How the limits are actually enforced (Claude's call):** `claude -p` on the same box as
the same user could edit any local guard, so the boundary is an **OS boundary, not a
GitHub one** (which would also need a paid plan for private-repo branch protection):

- The build loop runs as a **separate, unprivileged OS user** that can write only to its
  own worktrees. It cannot read the credential files or write to the main checkout.
- A **merge step running as Wolf's user** (outside the agent's reach) checks the diff
  against the protected-path list, runs the tests, and either fast-forwards `main` or
  leaves the branch for Wolf with a changelog note.
- The budget counter and `PAUSED` file live in a location the agent user cannot write.
- The repo is pushed to a **private GitHub repo** as a remote and backup; GitHub enforces
  nothing.

**Claude usage, clarified.** Wolf's words: "runs through my full claude usage so I can't
get other work done." So the budget is a share of his own subscription, not a separate
paid key, which would also break limit 1. *Claude's call:* the desk's weekly budget is
its own counter, and the existing whatupwolf engine (which runs hourly with no cap) should
get a cap too, so the two together leave room for Wolf's work.

**Terms of service (Claude's call, the stricter reading):** a source qualifies for
auto-add only if it is free, needs no account, *and* its terms/robots permit automated
access, recorded in the registry with a link. Anything unclear becomes a request for
Wolf.

## Other constraints carried over

- **Licensing:** Benzinga via Alpaca is licensed for personal consumption. It stays on the
  box and the private network. Raw licensed content is **not committed** to the repo; the
  database and generated briefs are gitignored data.
- **Store features, not scores** (from whatupwolf CLAUDE.md): persist extracted fields;
  compute any ranking on read, so later changes can be replayed over history.
- **No LLM in the live path.** Collection, deduping and the live feed are deterministic.
  LLM use (for example, pulling key figures out of an earnings release for the brief) is
  enrichment that runs after capture, counts against the Claude budget, and is a later
  backlog item, not v1.
- **Earnings in v1 (Claude's call):** Benzinga's earnings headlines, which usually carry
  the reported figures and guidance, plus links to the 8-K Item 2.02 and its press-release
  exhibit. **The first backlog item** is deterministic extraction of reported vs prior
  figures and guidance from the 2.02 exhibit and EDGAR's structured XBRL data, so the
  TTD-type case (fundamentals shifting) is covered by the loop's first real build.
- **Telegram's ~20 msg/min group cap** and similar limits on whichever ping service is
  chosen: token-bucket the sender and collapse overflow into "N more".
- Credentials live only on the box; the browser talks only to the desk's own server.

## Tech calls (Claude's, for Wolf to check)

- **Python** for collectors, server and loop tooling, managed with **uv** (Wolf's standing
  preference). Matches the original ingest plan in whatupwolf's CLAUDE.md.
- **SQLite (WAL mode)** instead of Postgres: one box, low write volume, zero ops, a single
  file Wolf can copy out to extract data. Revisit if it ever hurts.
- **One long-running collector service** (asyncio, one task per source) under the box's
  service manager so it restarts on crash and reboot. **A small web server** (FastAPI or
  similar) serves the feed page, `/api/events`, the briefs and an export endpoint.
- **Extraction:** a JSONL/CSV export endpoint plus the SQLite file itself.
- **Delivery:** a Telegram bot DM (see Alerts). There is no existing
  SMS/Telegram sender in whatupwolf; that was never built.

## v1 source set (Claude's call)

All free; the first two cover most of what Wolf described.

- **Benzinga news via Alpaca, if the free account includes it** (see open questions):
  earnings, ratings changes, company and policy headlines (private use).
- **SEC EDGAR** current filings: 8-K with item codes, 13D, and others; port the logic
  from whatupwolf's `src/lib/feed/` (form allowlist, item classification, CIK→ticker).
- **Federal Reserve** press releases and speeches (RSS).
- **Treasury** auction announcements and results (fiscaldata.treasury.gov).
- **Exchange trading halts** (Nasdaq Trader RSS).
- **Federal Register** public-inspection documents (policy actions).

Everything after this is the loop's job, gated by the hard limits.

## Step zero: take the feed off whatupwolf

A separate small change in this repo, done first:

- Remove `src/pages/feed.astro`, `src/pages/api/events.ts`, and the `Feed` nav link
  (`src/components/Nav.astro:9`).
- Remove `src/lib/feed/` after its logic is ported (or keep it untracked as reference for
  the port). Remove `PUBLIC_FEED` wiring and any probes or experiments that hit `/feed`.
- Update whatupwolf's `CLAUDE.md`: the market-feed sections describe the new private repo,
  not this site.

## Non-goals (for now)

- Trade ideas, analysis, sentiment scores, or "bullish/bearish" labels.
- The ratings scorer, label harness and weight fitting from whatupwolf's CLAUDE.md. The
  Python files aren't in the workspace anyway; they can come back as backlog items once
  there's captured data to label.
- Anything public-facing.

## Universe (Wolf, 2026-11-10)

Stocks on the **major indices plus a watchlist**. No OTC/pink-sheet names.
*Claude's call:* "major indices" means the **S&P 500, Nasdaq-100 and Dow 30** (about 600
names), refreshed weekly from free public constituent lists. Macro, Fed, Treasury and
policy items are always in scope regardless of ticker. The watchlist is a plain file Wolf
edits.

## Open questions for Wolf

1. **Benzinga:** Wolf has no Alpaca account. Alpaca's news API (Benzinga content) may be
   usable on a free paper account, but the current docs don't say so explicitly. Proposed:
   Wolf opens a free Alpaca paper account and the first task tests the news stream. If
   it's not included, v1 runs on the free public sources and Benzinga goes through the
   paid-source case process (direct Benzinga data is about $99/mo per dataset).

## Alerts: Telegram (decided 2026-11-10)

The box is Windows and Wolf's phone is an iPhone, which rules out iMessage from the box.
**Telegram bot, direct message to Wolf** is the ping channel for the brief, circuit
breaker trips, budget exhaustion and source requests. It's free, needs no carrier
registration, pushes reliably to iPhone, and supports links (plus inline buttons later,
for things like 👍/👎 labels). Earlier "Telegram isn't working" was because the sender was
never built, not because it broke.

- Wolf creates the bot with @BotFather and puts the token on the box (no account
  creation by the system).
- A DM to one user avoids the ~20 msg/min group cap, but the sender still token-buckets
  (about 1 msg/s) and collapses overflow into "N more".
- *Claude's call, failing closed:* Telegram is a third-party server, so pings carry
  public-source lines plus counts. Benzinga lines appear only on the private feed and
  brief unless Wolf says otherwise.

## Platform: Windows box (Claude's call)

The existing engine is bash plus cron, so it most likely runs in **WSL2** on that box. The
desk runs there too: a Linux user boundary (a separate Linux user for the build loop),
systemd services inside WSL2, and the same Python/uv tooling. The builder must confirm
WSL2 starts at boot without a login (a Task Scheduler entry that launches the distro) and
that Tailscale is reachable from the laptop for the feed page.

## Left to the builder

Database schema details, dedup strategy across sources, the exact page styling, file
layout of the new repo, the service manager (depends on the box's OS), and how each
source is parsed.
