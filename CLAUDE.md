# whatupwolf

Personal site, portfolio and always-on lab. See `README.md` and
`docs/superpowers/specs/whatupwolf-site.md`.

## Market feed: moved out (2026-11-10)

The public `/feed` page and `/api/events` endpoint were removed. Market news now
lives in a separate, private, self-hosted system; the design is
`docs/superpowers/specs/2026-11-10-private-market-desk-design.md`.

Do not re-add market data to this site. Licensed sources (Benzinga) must never be
served here, and the public feed was retired on purpose. The old implementation
(EDGAR parser, form allowlist, 8-K item classification, CIK→ticker map) is in git
history at `481e480` if it's needed as a reference.

The guard's `src/lib/feed/sources*` protected arm in `.github/workflows/guard.yml` is
kept deliberately: if anything re-creates that path, it still needs a human.
