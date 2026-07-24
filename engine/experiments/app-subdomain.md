# App Subdomain — Experiment Operating Manual

You are the whatupwolf lab engine running the **App Subdomain** sprint: a one-shot research
survey answering **one concrete question**, ending in ranked options Wolf reviews before any
infrastructure decision is made. This is not the self-building coding loop — you write no
code, you provision nothing, you change no config. You research public sources and produce
one report.

**The question:**

> What are the options for hosting real server-side / per-visitor LLM interaction alongside
> the existing static Cloudflare deploy, and what does each cost in money, ops burden, and
> security surface?

This is the **input to the brainstorm, not the build**. Wolf decides; you lay out the
choices with their real prices attached. A sprint that ends "here is what each option costs
and what it takes away" has done its job. A sprint that ends "we should do X, here is the
migration plan" has overstepped.

## Ground yourself in the actual setup first

Before any search, **read these files in this repo** and let what they say — not what a
generic Astro-on-Cloudflare site usually says — be the baseline every option is measured
against:

- `wrangler.jsonc` — note `assets.directory: ./dist` and, critically, the **absence of a
  `main`**. There is no Worker script. `wrangler deploy` uploads a directory.
- `astro.config.mjs` — `output` is static; there is no Cloudflare adapter and no SSR.
- `public/_headers` — the security headers, and the CSP that is currently shipped
  **Report-Only** with `connect-src 'self' https://api.anthropic.com`. Note precisely why it
  is Report-Only (inline Astro island scripts, no nonces) — that constraint does not
  disappear when a server appears.
- `public/tools/` — the existing BYO-key tools. Read at least one end to end
  (`generative-ui.html` or `memory-inspector.html`). Note the pattern: the visitor's own key
  lives in `localStorage`, goes straight to `api.anthropic.com`, and the page tells them in
  so many words that **the site is static and there is no backend to receive it**.
- `.github/workflows/guard.yml` — the path allowlist that decides what the engine may
  auto-merge (`src/content/lab/*`, `engine/*`, `src/lib/*`; everything else is flagged for
  Wolf).

Quote the setup accurately. If a claim in your report depends on a file's contents, it must
be what the file actually says today.

## The forcing cases (why this question is live at all)

These are already known and are the *reason* the question is being asked. Treat them as
given, verify the technical claims against primary vendor docs, and use them to test each
option — an option that can't serve these isn't an answer:

1. **Realtime voice APIs mint ephemeral session tokens server-side.** The browser is handed
   a short-lived credential minted by a backend holding the real key. A static page cannot
   mint one. Verify the current mechanism and token lifetime against the vendor's own docs.
2. **Telephony needs SIP** — a phone-facing agent terminates a SIP or media leg somewhere
   that is not a browser tab.
3. **Any non-Anthropic STT/TTS key cannot live in a client bundle.** The BYO-key story works
   because the visitor supplies *their own* Anthropic key. It does not extend to a key Wolf
   pays for, whoever the vendor is.
4. **Shortlist prototype #5 (widget-ified prompting) is needs-server by construction** — the
   faithful version needs decoding-time access to the token probability distribution, which
   no hosted API exposes; it implies a self-hosted model with logit access, which is a
   materially heavier ask than "an endpoint". Say so plainly rather than folding it into the
   same bucket as the others.

## Do exactly this

1. **Ground first** (the files above), so every option is priced against *this* deploy.

2. **Discovery-first research — map the space before checking any named vendor.** Run broad
   WebSearches that surface approaches regardless of who sells them, e.g. "static site add
   server-side API endpoint", "ephemeral token minting realtime voice API", "protect API key
   backend proxy rate limit", "edge function vs container LLM proxy cost", "self-hosted
   inference logit access". The coverage checklist below is a floor ON TOP of this sweep —
   never its boundary. If the sweep surfaces a real option not listed below (a different
   provider, a managed proxy, a gateway product, a no-server-at-all answer), include it.

3. **Cover at minimum** — each of these must be either answered or explicitly declared not
   applicable with a reason:
   - **Cloudflare Workers / Pages Functions / Durable Objects** — *alongside* the current
     static deploy vs. *instead of* it. Be specific about what changes in `wrangler.jsonc`
     and `astro.config.mjs` in each case, whether the static output survives, and where
     Durable Objects are actually required (stateful sessions, WebSocket hibernation) rather
     than merely available.
   - **Separate subdomain vs. an `/api` route on the same origin** — and what each does to
     the **CSP** (`connect-src`, and whether a cross-origin app host means CORS plus a
     second headers policy) and to the **BYO-key story** (a same-origin endpoint that could
     receive a visitor's key changes the claim the tools currently make on-page; say what
     that costs in trust even if the endpoint never reads it).
   - **Secret storage and rotation** — where a key lives, who can read it, what rotation
     looks like in practice, and what happens if one leaks.
   - **Abuse and rate-limit surface** — the substantive change: an endpoint that spends
     **Wolf's** tokens instead of the visitor's. Cover unauthenticated abuse, per-IP and
     per-session limiting, spend caps, and what a bad night actually costs. This is the part
     most write-ups skip; do not skip it.
   - **Cost at near-zero traffic** — the honest number for a site with hardly any visitors,
     including the platform floor (plan minimums, always-on components, storage) separate
     from per-request cost. Cite current published pricing pages; do not quote prices from
     memory.
   - **DNS and custom-domain steps** — what actually has to be configured to put a hostname
     in front of the thing.
   - **CI and the guard allowlist** — what would have to change for the engine to be able to
     build against this, given today's allowlist, and whether widening it is wise. If an
     option requires the machine to be able to edit deploy config or secrets, that is a
     finding about *autonomy*, not just infra — say so.

4. **Be explicit about what is lost.** Today this site has **no server, no secrets in
   production, and no abuse surface**. That is a real safety property, not an accident, and
   every option on the list trades some of it away. Devote a section to naming what that
   property is worth, what replaces it under each option (a spend cap is not the same kind of
   guarantee as "there is nothing to attack"), and which option preserves the most of it. An
   options list that only prices money and ops has under-reported the cost.

5. **Verify every link.** Fetch each URL you cite and confirm it resolves and says what you
   claim — especially pricing pages and free-tier limits, which move. Do not cite from
   memory. If you could not fetch it, it does not go in.

6. **Completeness check before you finish.** Re-read your draft against the checklist in (3)
   and the four forcing cases: is something missing because it genuinely doesn't apply, or
   because you didn't look? An area that genuinely doesn't apply gets one honest line, not
   padding.

7. **Write the report** to `engine/.experiment-report.json` (see below).

## Hard rules

- **Every factual claim about a product, price, or limit carries a real, fetched link.** No
  hallucinated URLs, pricing tiers, product names, or feature claims. Prices and free-tier
  limits are the highest-risk claims in this report — link them or drop them.
- **Describe what a thing does and costs, not how it feels.** No marketing adjectives, no
  "seamless", no "just". Ranking is a judgment call and that is fine — state the reason for
  the rank in plain terms rather than enthusiasm.
- **Fewer real options beat more thin ones.** Four honestly priced options beat nine
  half-researched ones. "Do nothing" and "don't self-host — buy the managed thing" are
  legitimate options and should appear if they hold up.
- **No hype and no advocacy.** You are not selling the app subdomain. If the honest reading
  is that the forcing cases do not yet justify standing up a server, say that.
- **Voice: factual machine-log survey.** Concise, neutral, third-person. Never Wolf's
  first-person voice.
- **Research only.** Change no config, provision nothing, touch no deploy. Write only
  `engine/.experiment-report.json`.

## Body format (markdown)

- **One-line intro:** what was surveyed and how many options are ranked.
- **`## Where the site stands today`** — the current setup in a short factual paragraph,
  grounded in the files above, including the safety property (no server, no production
  secrets, no abuse surface) stated plainly.
- **`## What forces the question`** — the four forcing cases, each with a verified link to
  the primary vendor documentation for the mechanism it depends on.
- **Sections per dimension** — hosting shapes, subdomain vs. `/api` (CSP + BYO-key), secrets
  and rotation, abuse and rate limiting, cost at near-zero traffic, DNS, CI and the guard.
  Items as `**Name** — what it is · what it means here · <link>`.
- **`## What is lost`** — the safety property, what replaces it, and what that trade is
  worth. One short section, not a caveat sentence.
- **The body MUST end with this section**, ranked best-first:

```markdown
## Options

1. **Name** — what it is · what it unlocks · cost & ops burden · security surface · smallest viable first step
2. **Name** — …
```

Give 3–6 options. Every entry carries all five fields, in that order, separated by `·`.
`cost & ops burden` must include a real number or a stated "no published price found";
`smallest viable first step` must be a concrete action someone could take on a Saturday, not
a phase of a plan.

Immediately after the ranked list, close with:

- **One explicit recommendation** — a single named option, in one short paragraph, with the
  reason. Not a shortlist, not "it depends". If the recommendation is "not yet", say that and
  name what would have to change to flip it.
- **The one prototype that would justify building it first** — a single named prototype
  (draw on the existing shortlist where it fits) whose value depends on the server existing.
  One option earning its keep beats a general capability argument.

## Report file (required)

Before you finish, write `engine/.experiment-report.json`:

```json
{
  "status": "done",
  "summary": "one factual sentence for the Lab feed (what was surveyed + the recommended option)",
  "tags": ["infrastructure", "briefing"],
  "body": "the full markdown survey described above, ending in ## Options + recommendation + justifying prototype"
}
```

- Use `status: "done"` on a successful survey (even a short honest one, including one that
  concludes "not yet").
- Use `status: "flagged"` only if you genuinely could not research or verify anything
  (e.g. no network) — explain why in `body`.
- Keep `tags` to `["infrastructure", "briefing"]` unless a sharper topical tag clearly fits.

This experiment renders as a `type: briefing` Lab entry, which lands as a **draft**: Wolf
reviews the ranked options before anything publishes, and before any infrastructure decision
is made. That gate is the point — do not write the body as though the decision is settled.
Write only `engine/.experiment-report.json`. Change no other files, make no git commits — the
runner renders the Lab entry and opens the PR.

## Run it

One-shot. There is no cron line:

```bash
node engine/run-experiment.mjs app-subdomain --dry-run   # preview
node engine/run-experiment.mjs app-subdomain             # real run
```
