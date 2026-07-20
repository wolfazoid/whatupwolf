# Generative UI Canvas — Prototype Design

**Date:** 2026-07-20
**Status:** approved (brainstorm), queued to `engine/BACKLOG.md` (Tier 14)
**Origin:** Prototype Shortlist #1 from the Interaction Landscape sprint
(`src/content/lab/2026-07-20-interaction-landscape.md`).

## What it is

A self-contained browser tool that turns a typed request into live, interactive UI:
the visitor asks for something, Claude generates HTML "app windows" on a canvas, and
interacting with a generated app posts back and re-invokes the model. The first
prototype from the LLM-interaction research phase — the highest-novelty candidate that
already has a working browser-only precedent (Anilturaga/Generative-UI, "Imagine with
Claude"), so the risk is design, not architecture.

## Decisions (locked in brainstorm)

- **Provider: Anthropic (Claude) only, BYO-key.** The visitor pastes their own Anthropic
  API key; calls go browser→Anthropic directly. No server (the site is static on
  Cloudflare).
- **Scope: faithful multi-window canvas** — multiple generated app-windows on a
  pan/zoom canvas, each a sandboxed iframe, interactions re-invoking the model. Not a
  reduced single-surface v1.

## Architecture

Self-contained single file at `public/tools/generative-ui.html` — no build step, no
external dependencies, works offline (matches the Cook Mode convention).

- **Model call:** `fetch` to `https://api.anthropic.com/v1/messages`, streaming SSE
  (`stream: true`), headers `x-api-key: <visitor key>`, `anthropic-version`,
  `anthropic-dangerous-direct-browser-access: true`, `content-type: application/json`.
  Default model **Claude Sonnet 5** (fast + cheap on the visitor's key) with a small
  model picker. The build cycle MUST confirm current model IDs and the browser-direct
  header via the `claude-api` skill before hardcoding them.
- **Tool-calling loop:** the model holds three tools —
  `create_new_window(title, html)`, `set_window_html(id, html)`,
  `dom_replace(id, selector, html)`. The page executes each against the canvas and
  returns a `tool_result`; a user interaction inside a window posts a message that
  re-invokes the model with that event, closing the loop.
- **Canvas:** hand-rolled **vanilla JS** pan/zoom + draggable window panes — NOT an
  actual React Flow dependency, so the file stays single-file, offline, and CSP-clean.
  "React Flow-style," not React Flow.

## Security (the part a reviewer must check)

- **API-key isolation.** Generated apps render in iframes with
  `sandbox="allow-scripts"` and **without** `allow-same-origin`, so model-generated
  code runs but cannot reach the parent page, its `localStorage`, or the API key. The
  key lives only in the parent and is passed to no iframe. All app↔page communication is
  `postMessage`. This directly answers the "UI impersonation / security bugs" objection
  logged in the research (HN thread on A2UI).
- **CSP.** The site's `public/_headers` Content-Security-Policy (currently
  `Report-Only`) will need `https://api.anthropic.com` in `connect-src` before it is
  enforced, or the tool breaks on the live site. The build task flags this as a
  coordinated `_headers` note — do not silently weaken the site CSP.

## Trust UX

- Prominent, honest key messaging: "your key stays in your browser, never sent to any
  server," a link to where to get an Anthropic key, and a clear-key button.
- A note that generated code runs sandboxed.
- Graceful handling of a missing/invalid key and of API/network/rate-limit errors.

## Publishing

- The tool: `public/tools/generative-ui.html`.
- A `tools` collection entry `src/content/tools/generative-ui.md`
  (title, description, `href: /tools/generative-ui.html`, tags).
- A `type: experiment` Lab writeup describing the pattern (generative/streaming UI, the
  precedent, why it matters) with `tool: /tools/generative-ui.html` in frontmatter,
  matching the Cook Mode / Tools-home conventions.

## Gating

Touches `public/**`, `src/content/tools/**`, and likely `public/_headers` → **GATED /
needs-human**. Wolf reviews the security surface before it ships. Appropriate for a
BYO-key tool that executes model-generated code.

## Non-goals (v1)

- No provider beyond Anthropic.
- No server / no proxying of the key.
- No persistence of generated apps beyond the session (canvas state is in-memory;
  the key persists in `localStorage`).
- No real React Flow / npm dependency.
