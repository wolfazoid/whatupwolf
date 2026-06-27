# Spec — whatupwolf.com

**Status:** Approved design (brainstorm complete 2026-06-27). Ready for planning.
**Repo:** `~/whatupwolf`
**Owner:** wolf@wearefeasting.com

---

## 1. What this is

whatupwolf.com is a personal brand + portfolio + **experimentation laboratory**. It is built under the wearefeasting umbrella — independent of Pack Digital. (`pack-support-agents` belongs to Pack; any productized work is rebuilt fresh, inspiration only.)

### The flywheel (the reason it exists)

> The always-on machine **runs** experiments (site monitoring, daily briefings, agent trials) → **auto-publishes** them to the Lab feed → the Lab **is** the portfolio that proves the capability → which **wins** consulting/product revenue.

The machine being always-on isn't incidental — it's the engine. Its output becomes living proof-of-work on the site.

### Sequencing

- **Sub-project #1 (this spec):** the site itself — a static Astro site with a Lab feed, deployed to Cloudflare Pages.
- **Sub-project #2 (later, designed-for here):** the always-on monitoring/briefing engine that auto-publishes to the Lab and is the eventual product to sell.

This spec covers #1 in full and lays the seams for #2 so it can be bolted on without rework.

---

## 2. Aesthetic direction

**Concept: "field-lab notebook, built by a builder."** Confident, a little playful (the name earns it), unmistakably made by someone who ships agents.

- **Paper theme.** Warm white background, ink text, **one** accent color. (Chosen over the dark-first alternative.)
- **Two typefaces.**
  - Clean grotesk (Geist or Inter) for headlines and prose.
  - **Monospace for all chrome** — timestamps, tags, metadata, lab-entry furniture (JetBrains/Berkeley Mono vibe). The mono is what sells "lab."
- **Layout.** Generous whitespace, single reading column, fast. Terminal cues (`>` prompt glyph, mono timestamps) used sparingly — never gimmicky.
- **Signature element.** A live **Lab feed** that reads like a running log: timestamped, status-tagged entries, with a subtle pulse-dot "live" indicator on anything the always-on box just updated.

### Design tokens (starting point — refine with real eyes later)

| Token | Value | Use |
|---|---|---|
| `--bg` | warm white (e.g. `#faf8f3`) | page background |
| `--ink` | near-black warm (e.g. `#1a1a17`) | body text |
| `--muted` | warm gray | metadata, secondary text |
| `--accent` | one signal color (TBD — signal green or amber) | links, live dot, status |
| `--font-sans` | Geist / Inter | headlines, prose |
| `--font-mono` | JetBrains / Berkeley Mono | chrome, timestamps, tags |

---

## 3. Site structure

Nav: **Home · Work · Writing · Video · Lab · Now/About · RSS**

- **Home** — one line on who you are + what you do, a **live snippet of the latest Lab activity** (instant proof the machine is working), and a "work with me" CTA.
- **Work** — selected projects: headless commerce (Hydrogen), agents, monitoring. Client work described generically.
- **Writing** — human-authored essays/posts (distinct from the machine's Lab feed).
- **Video** — talks, demos, screencasts (YouTube/Loom embeds + notes).
- **Lab** — the auto-published feed. The heart of the site and the whole point of phase 2.
- **Now / About** — who you are, contact, book-a-call.
- **RSS** — full-site feed (and per-collection feeds); on-brand, near-free.

---

## 4. Content model

Everything is **Astro content collections** — each entry is one Markdown file with frontmatter. An agent (or a human) publishes by writing a file and pushing.

### Collections

**`lab`** — machine output (also human-writable). This is what the always-on box writes to.

```yaml
---
title: string
date: datetime
type: experiment | briefing | monitor | note
status: string        # e.g. running | done | flagged | draft
tags: [string]
live: boolean         # drives the pulse-dot "fresh" indicator
summary: string       # one-liner for the feed
---
```

**`work`** — human-curated portfolio entries.

```yaml
---
title: string
date: datetime
role: string
stack: [string]
summary: string
link?: string
---
```

**`writing`** — human-authored essays/posts.

```yaml
---
title: string
date: datetime
tags: [string]
draft?: boolean
summary: string
---
```

**`video`** — talks/demos/screencasts.

```yaml
---
title: string
date: datetime
embed: string         # YouTube/Loom URL
tags: [string]
summary: string
---
```

All collections validated with Astro `defineCollection` + Zod schemas.

---

## 5. Publishing pipeline (phase 2 — designed for now)

1. A scheduled agent runs on the always-on box (local cron → headless Claude Code).
2. It does its job (e.g. monitor a site, generate the daily briefing), then **writes a `lab/*.md` entry, commits, and pushes.**
3. Push → Cloudflare auto-deploy → entry is live within ~1 minute. The pulse-dot marks it fresh (`live: true`).

### Two safety rails (because this touches client data later)

- **Public-safe filter.** The monitoring engine emits **two** outputs:
  - a full **private** report (emailed to you/client via Gmail MCP), and
  - a **sanitized** public Lab snapshot — no client names, URLs, or secrets — that proves capability without leaking.
- **Direct vs. review.** Pure machine logs publish **directly**; anything with judgment (briefing opinions, essays) lands as a **draft/PR** you approve. The line is set per `type`.

> Phase-1 scope note: the site only needs to **render** `lab` entries correctly (including `live` and `status`) and support a `draft` state. The cron/headless-agent automation and the email/sanitization split are phase 2 — not built in this spec, but the content schema and draft handling above make them drop-in.

---

## 6. Tech & deploy

- **Framework:** Astro + TypeScript + content collections.
- **Styling:** Tailwind CSS, configured with the paper-theme tokens above. Minimal JS (zero-JS by default; JS only for the live-dot/feed niceties).
- **Repo:** `~/whatupwolf` (existing empty git repo, `master`).
- **Deploy:** **Cloudflare Pages**, auto-deploy on push to `main`.
- **Feeds:** RSS via `@astrojs/rss` (site-wide + per-collection).

---

## 7. Phase-1 scope (this spec) — definition of done

- [ ] Astro + TypeScript + Tailwind project scaffolded in `~/whatupwolf`.
- [ ] Paper-theme tokens + the two typefaces wired in.
- [ ] Four content collections (`lab`, `work`, `writing`, `video`) defined with Zod schemas.
- [ ] All seven routes built: Home, Work, Writing, Video, Lab, Now/About, plus RSS.
- [ ] Lab feed renders as a timestamped, status-tagged running log with the pulse-dot "live" indicator and `draft` handling.
- [ ] Home shows a live snippet of the latest Lab activity + a "work with me" CTA.
- [ ] Seed content: 1–2 example entries per collection so every view renders.
- [ ] Deploys to Cloudflare Pages on push to `main`.

## 8. Out of scope (phase 2)

- The always-on monitoring/briefing engine itself.
- Local cron + headless Claude Code auto-publish.
- Gmail-MCP private report + public-safe sanitization split.
- PR/review automation for judgment content.

---

## 9. Open decisions

- **Accent color:** signal green vs. amber — decide against real rendering.
- **Font specifics:** Geist vs. Inter; JetBrains vs. Berkeley Mono.
- **Writing + Video:** kept as two nav items for now; easy to merge into one "Content" hub later if they feel thin.
