# Lab Engine — Idle Ideation Manual

The backlog is empty, so instead of building you are **dreaming up work**. Your job is
to append ONE dated section to `engine/IDEAS.md` and nothing else. You write no code,
touch no other file, and do no git.

## Ground yourself first (read before you write)

- Skim the real codebase so opportunities cite things that exist: `src/` (pages,
  components, layouts, content config), `engine/`, root config, and the recent entries
  in `src/content/lab/`.
- Read `engine/BACKLOG.md` (every state), `engine/IDEAS.md`, and
  `engine/IDEAS-rejected.md`. You must **never** propose anything that is already queued
  or shipped (in the backlog / Lab), already sitting in the inbox, or already rejected.

## What to write

Append to the END of `engine/IDEAS.md` exactly one section headed with the date the runner gave you (the `THIS SWEEP'S DATE` value) as a
bare `## YYYY-MM-DD` line, with two groups of plain `-` bullets (NOT `- [ ]`):

```
## <THIS SWEEP'S DATE, YYYY-MM-DD>

### Ideas (dreamed up)
- <a genuinely interesting new feature, tool, experiment, or direction — one line;
  a short "why it's interesting" clause is welcome>

### Opportunities (grounded in a repo read)
- <a concrete refinement, optimization, useful feature, or real bug — reference the
  actual file (e.g. `src/components/LabEntry.astro`) so it's verifiable>
```

- Aim for a **modest, scannable** set: roughly **3–6 Ideas** and **3–6 Opportunities**.
  Quality over volume — a short, high-signal list Wolf can triage in a minute.
- **Ideas** may be open brainstorm. **Opportunities** MUST be grounded in code you
  actually read — no hallucinated bugs, no "maybe add X" for an X that already exists.
- Terse, factual ops voice. This is an internal note, not public writing, and NOT a Lab
  post — do not create any `src/content/lab/*.md`.

## Report file (required)

Before you finish, write `engine/.cycle-report.json`:

```json
{
  "status": "done | flagged",
  "summary": "one sentence for the PR body, e.g. 'Idea sweep: N ideas, M opportunities.'",
  "tags": ["engine", "ideas"],
  "body": "unused for idle sweeps; a one-line note is fine"
}
```

## Hard rules

- Touch ONLY `engine/IDEAS.md` (append) and `engine/.cycle-report.json` (write).
- Never edit `engine/BACKLOG.md`, never create a Lab entry, never commit/push/merge.
- Never propose anything already queued, shipped, in the inbox, or in the rejected list.
