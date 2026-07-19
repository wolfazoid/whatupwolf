# Tech levels

A visitor picks how technical the site should read. Three levels:

| id | label | who it's for |
|----|-------|--------------|
| `technical` | technical | engineers who want file names, mechanisms, trade-offs |
| `aware` | tech-aware | reads tech fine, doesn't want the internals |
| `plain` | plain | most clients — the value of the work, no jargon |

## How it works

The site is static (Astro → Cloudflare): no server, no per-visitor LLM call. So
**every reading is authored ahead of time and ships together in the HTML**, and
only one is shown:

1. `src/layouts/Base.astro` has a blocking inline script that restores the saved
   level onto `<html data-level="…">` before first paint.
2. `src/styles/global.css` hides every `[data-variant]` element whose token list
   doesn't include the current level.
3. `src/components/LevelSwitch.astro` (in the nav) writes the choice to
   `localStorage` under `whatupwolf:tech-level`.

There is no per-element JavaScript. Switching level is one attribute write, so
the Lab's React island never learns about levels at all — it renders all the
readings and the cascade picks one.

**With JavaScript off**, `data-level` is never set, the CSS falls through to the
technical source, and the switch stays hidden — the site behaves exactly as it
did before this existed.

## Authoring

Copy is written **technical first**, then authored *down*. Both lighter
readings are optional; an unwritten one falls back (`plain` → `aware` →
`technical`), so untranslated content still renders — it just reads the same at
every level.

In content frontmatter:

```yaml
title: "Quote unsafe tags in renderLabEntry (engine/lib.mjs)"
titleLevels:                      # lab entries only — machine titles carry file names
  aware: "Quote YAML-unsafe tags"
  plain: "Stopped certain tag names breaking the site build"
summary: "renderLabEntry now quotes numeric and YAML-reserved-word tags so they stay strings."
summaryLevels:
  aware: "Tags that are numbers or YAML keywords are now quoted, so they stay strings and cannot fail the build."
  plain: "A tag like 2026 or no could be misread by the site builder and break the build. They are now written in a way that cannot be misread."
```

`summaryLevels` exists on `lab`, `work` and `writing`; `descriptionLevels` on
`tools`; `titleLevels` on `lab`.

In a page or component:

```astro
<LevelText technical="latest from the lab" plain="what i've been building" />

<LevelBlock levels="plain" as="p">…markup that only belongs at this level…</LevelBlock>
<LevelBlock levels={['technical', 'aware']}>…shown at both…</LevelBlock>
```

Use `LevelText` for a string, `LevelBlock` when the *shape* of the copy changes
with depth (a list at one level, a sentence at another) or to drop something
entirely — the stack chips on `/work` and the Lab's tag vocabulary are
`technical aware` only.

## Deliberate limits

- **Lab entry bodies stay technical at every level.** They're the machine's own
  write-up; translating a build log line by line would invent detail it never
  reported. Lighter levels get the translated title and summary plus an honest
  note that the body below is written for engineers.
- **`<title>` and `<meta name="description">` stay technical.** They're outside
  the document body, so the CSS mechanism can't reach them, and varying them
  would fight the canonical URL. Same for `/rss.xml`.
- **Entries the engine writes arrive untranslated** and fall back to technical.
  Translating them is a separate authoring pass, not something the runner does.

## Adding a level

`src/lib/tech-level.ts` is the single source of truth for the vocabulary. The
one duplicate is the inline boot script in `Base.astro`, which can't import —
`src/lib/tech-level-boot.test.ts` fails if the two drift apart.
