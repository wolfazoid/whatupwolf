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

## 2026-07-24

### Ideas (dreamed up)
- **Adversarial self-review before the PR opens** — after the machine finishes a cycle, the runner invokes a second, independent `claude -p` whose only job is to read `git diff main...HEAD` against the backlog line and answer "does this do what was asked, and what's wrong with it?", appended to the PR body. Today the only independent judgement in the loop is `npm test` + `npm run check` (`engine/run-cycle.mjs:308-322`), which says nothing about whether the work matches the task.
- **Cycle replay** — an interactive page that walks a visitor through one real cycle end to end: the backlog line, the diff, the verify gate, the PR. The lab's unrepeatable asset is that every build is already recorded; a replay makes "an always-on machine builds this site" something you watch rather than read.
- **Agent-legible lab** — publish `/llms.txt` plus a structured JSON feed of the Lab and Tools collections, then treat "who reads this site" as an open question: increasingly the answer is another agent. Cheap to build (both derive from existing collections) and an honest experiment in writing for a non-human reader.
- **Prompt-injection dojo** — a client-only, zero-key tool in the reasoning-trace mould: the visitor plays the defender while injected instructions arrive in "tool output", and scoring shows how often they'd have let an agent be steered. AI literacy for the failure mode people actually hit with agents, and it needs no server.
- **A recurring `audit` experiment kind** — a third pipeline alongside `digest`/`monitor` in `engine/experiments/registry.mjs` that adversarially re-tests our own shipped BYO-key tools (key never leaves the parent, iframes stay `allow-scripts`-only, `connect-src` unchanged) and files findings. The security posture of `public/tools/*.html` was reviewed once, at build time, and never since.

### Opportunities (grounded in a repo read)
- The "live" dot is on every entry, so it signals nothing. `renderLabEntry` defaults `live = true` (`engine/lib.mjs:134`) and no caller ever passes it, so all 38 files in `src/content/lab/` carry `live: true` — and `src/components/LabEntry.astro:38` + `src/components/FeaturedStrip.astro:40` render the pulsing "live — just updated" dot on all of them, including entries from a week ago. Either derive it from recency at render time or stop stamping it true.
- `class="prose"` on the Lab entry body is a no-op. `src/pages/lab/[...id].astro:52` styles the write-up with ad-hoc `[&_h2]`/`[&_p]`/`[&_code]` variants plus a `prose` class that matches nothing: `src/styles/global.css` has zero `prose` rules and `@tailwindcss/typography` is not a dependency. With preflight on, markdown bullets lose their markers and inline links lose their colour — `src/content/lab/2026-07-18-agent-weekly.md` alone has 7 list/link lines rendering as flat grey text.
- Lab search can't find the featured entries. `src/pages/lab/index.astro:57` passes only `log` into `<LabFilter>`, while `partitionLab()` has already pulled every tool and recent read into `FeaturedStrip` — which has no query awareness. Searching "cook mode" on /lab shows the empty state even though the card is on screen above it.
- Draft entries still get a public URL. `getStaticPaths` in `src/pages/lab/[...id].astro:8` calls `getCollection('lab')` unfiltered, while `src/pages/index.astro:7`, `src/pages/lab/index.astro:10` and `src/pages/rss.xml.ts:6` all drop `draft`. So a `draft: true` briefing builds and deploys at its real URL, just unlinked. Latent right now (no draft entry exists), but the whole review gate — `draftForType('briefing')` in `engine/lib.mjs:162` — assumes a draft is not published.
- Tag chips leak into the plain reading level. `src/components/LabEntry.astro:50` and `src/pages/lab/[...id].astro:32` deliberately mark their tag rows `data-variant="technical aware"` so `#engine`-style jargon disappears at the plain level, but the equivalent rows in `src/pages/tools/index.astro:27` and the stack chips in `src/pages/work.astro:65` carry no `data-variant` — and `src/styles/global.css:48-51` only hides elements that have one.
- Nothing tests the five shipped tools. `src/lib/` and `engine/` are well covered by vitest, but `public/tools/*.html` (cooking, generative-ui, reasoning-trace, branching-chat, memory-inspector) has no test at all, so the verify gate that guards every cycle cannot notice a tool regressing. A cheap static assertion per file — sandbox attribute never gains `allow-same-origin`, `fetch` targets only `api.anthropic.com`, no external `<script src>` — would put them inside the gate.
