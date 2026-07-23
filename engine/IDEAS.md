# Idea Inbox

Daily **idea sweeps** land here when the backlog runs dry. Each sweep appends one
`## YYYY-MM-DD` section with two groups: **Ideas** (dreamed up) and **Opportunities**
(grounded in a read of the actual repo). Bullets are plain `-`, never `- [ ]`, so the
backlog parser never mistakes an idea for a buildable task.

**Triage (Wolf, by hand):**
- **Queue it** → copy the bullet into `engine/BACKLOG.md` as a `- [ ]` task, then delete
  it from here.
- **Reject it** → move the bullet to `engine/IDEAS-rejected.md`; the next sweep reads that
  file and won't re-propose it.
- **Ignore it** → leave it here; it stays as standing context and won't be resurfaced.

<!-- Sweeps append below this line, newest section wins the once-per-day guard. -->

## 2026-07-23

### Ideas (dreamed up)
- **Loop retrospective** — a recurring experiment (`kind: digest`) that reads the last N merged cycle PRs + `engine/cycle.log` and publishes what the machine got wrong, what the verify gate caught, and the flagged-vs-clean rate. The lab's one unrepeatable asset is its own operating history; nobody else can write that post.
- **`/engine` status page** — a build-time page rendered from git history: cycles run, PRs merged, flagged rate, days on. Turns the "always-on machine" claim from copy into a number a visitor can check.
- **Provenance link per Lab entry** — capture the PR number in frontmatter at publish time and render "built by cycle #NN ↗" on the entry. Proof-of-work becomes verifiable instead of asserted; costs one field in `renderLabEntry`.
- **Context-budget visualizer** — client-only tool: paste a system prompt / conversation, get a block-by-block breakdown of what's eating the window (approximate tokenizer, no key, no server). Everyone building agents guesses at this; nobody sees it.
- **Idea-inbox auto-ranking** — a light sweep mode that re-reads the standing bullets in this file and re-emits them ranked by value × feasibility, so triage is a sorted list rather than an archaeology dig once the inbox is 40 bullets deep.

### Opportunities (grounded in a repo read)
- The tech-level switch is dead on 5 of 8 routes. `src/components/Nav.astro` renders `LevelSwitch` site-wide, but only `/lab`, `/lab/[id]` and `/tools` consume it — `src/pages/index.astro`, `work.astro`, `writing.astro`, `video.astro` and `now.astro` contain no `LevelText`/`LevelBlock`. Worse, `src/content.config.ts` already declares `summaryLevels` on the `work` and `writing` collections and no page reads it. Switching to "plain" on /work changes nothing.
- RSS guid collision for writing posts. `src/pages/rss.xml.ts:20` hardcodes `link: '/writing/'` for every writing item, and `@astrojs/rss` derives `<guid isPermaLink="true">` from the link — so a second writing post publishes with the same guid as the first and readers dedupe it away. Latent today (one entry). Root cause: there is no per-post writing page, so the body of `src/content/writing/why-a-lab.md` is never rendered anywhere. Fix is `src/pages/writing/[...id].astro` + real links.
- Every page ships the same meta description. `src/layouts/Base.astro:9` accepts a `description` prop with a site-wide default and **no page passes one** (grep: zero call sites). No canonical link and no OG/Twitter tags either, so every Lab entry shares one search/social preview.
- The homepage shows the least-curated slice of the lab. `src/pages/index.astro:9` takes `lab.slice(0, 3)` — the three newest raw entries, which are usually routine build-logs — while `partitionLab()` in `src/lib/lab-filter.ts:140` already exists to headline tools and reads. /lab is curated; / is not.
- The idle-sweep verify gate doesn't check what it claims. `engine/run-cycle.mjs:203-215` runs only `npm test` + `npm run check` (which pass trivially for a docs-only edit) yet the PR body asserts "an idle idea sweep should only touch engine/IDEAS.md". A sweep that wrote a Lab entry or edited `BACKLOG.md` would auto-merge green. `newLabEntriesInStatus()` (`engine/lib.mjs:291`) plus a porcelain path check would make the assertion true.
- Tools link out but never back. Lab entries reach their tool via the `tool:` field (`src/pages/lab/[...id].astro:36`), but `src/content/tools/*.md` has no reciprocal field, so `/tools` cards offer "Open →" and no route to the writeup explaining the thing.
