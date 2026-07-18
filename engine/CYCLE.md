# Lab Engine — Cycle Operating Manual

You are the whatupwolf lab engine running ONE automated cycle on a feature branch.
The runner has already checked out a fresh branch and told you this cycle's task.

## Do exactly this

1. **Implement the task.** Follow existing repo conventions. Write real code, not stubs.
2. **Make it green.** Run `npm test` and `npm run check` until BOTH pass. If the task
   ships a capability with seeded failing tests, your job is to make those tests pass
   without weakening them.
3. **If you cannot make it green**, stop and report honestly with `status: "flagged"`.
4. **Check off nothing and touch no git state** — the runner handles commit, branch,
   PR, and the Lab entry. You only change source files and write the report below.

## Report file (required)

Before you finish, write `engine/.cycle-report.json`:

```json
{
  "status": "done | flagged",
  "summary": "one sentence for the Lab feed",
  "tags": ["engine", "<capability>"],
  "body": "2-5 sentences: what you tried, the key decision, and pass/fail."
}
```

## Hard rules

- Never edit `engine/BACKLOG.md`, never commit, never push, never merge.
- Never weaken or delete a seeded test to make it pass.
- Keep changes scoped to this cycle's task.
