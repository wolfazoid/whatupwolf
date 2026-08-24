# Market feed

Personal market news pipeline. Ingest → score → two read surfaces.

## Hard constraints

**Redistribution.** `src/lib/feed/sources.ts` gates which sources reach
which deploy. This is a licensing boundary, not a UI preference.

- `public`  — EDGAR, exchange halts, federal economic releases. Public
  domain or publicly disseminated. Safe to serve to visitors.
- `private` — Benzinga stream via Alpaca. Licensed. Personal consumption
  only. Serving it to visitors is redistribution.

Do not simplify this away, inline the source list, or "helpfully" default
`PUBLIC_FEED` to showing everything. The filter must fail closed: if the
env var is missing or malformed, show *less*, never more.

**Never put API keys in client code.** The browser talks to `/api/events`;
the server holds credentials. No direct Alpaca or EDGAR calls from the page.

**EDGAR rate limits.** 10 req/sec hard cap, and a `User-Agent` header with
real contact info is mandatory. Exceeding this gets the IP banned, not
throttled.

## Architecture decisions

**Two services, deliberately.** Astro is a read surface. The Python ingest
is a long-running poller with its own lifecycle. Coupling them means a bad
site build stops data collection. They share only the Postgres schema.

**Store features, not scores.** `events` persists the extracted feature
JSON, and score is computed on read. This is what makes threshold replay
work after a weight refit — if you persist the score instead, refitting
invalidates all history and you lose the ability to ask "what would
yesterday have alerted on at threshold 45?"

**Polling, not SSE, on the public page.** A filings feed does not need
sub-second delivery, and serverless functions cannot hold a connection
open. The tailnet build can use SSE if it earns it. Do not "upgrade" the
public page to SSE.

**Vanilla client script, no island.** The feed page is a fetch loop and
innerHTML. It does not need hydration or a framework dependency.

## The scoring gate

**No LLM in the hot path.** The alert gate is deterministic rules only.
An LLM call costs 1–2s against a 5s budget, fails silently, and cannot be
debugged by reading a config file. LLM use is confined to post-alert
enrichment and the batch digests.

**Labels are volatility-normalised and market-adjusted.** See
`label_harness.py`. The label is `|move − beta·spy_move| / atr_pct`, not
raw price movement. Raw movement just relearns that small caps are
volatile. Both corrections are load-bearing — do not simplify the label.

**Ratings weight coverage depth and market cap inversely.** A downgrade on
a 30-analyst mega cap is already priced. The same downgrade on a
2-analyst small cap is the whole story. This looks backwards; it isn't.

**Report precision/recall, never accuracy.** ~85% of ratings actions move
nothing, so a model alerting on zero events scores 85% accurate.

## Session timing (America/Chicago)

Pre-market brief 07:00 · intraday hot path 08:30–15:00 · close recap 15:30.
Filings are *not* suppressed intraday — an 8-K landing mid-session is
anomalous, and the anomaly is the signal. Only the scheduled form types
(10-Q, Form 4, S-3) drop to the recap.

## State

Built: ratings scorer, labelling harness, weight fitter, Astro feed page
and endpoint.

Not built: ingest pollers, `events` table migration, EDGAR index-directory
poller, halt monitor, Telegram sender with token-bucket limiter, pre-market
brief generator.

Weights in `ratings_score.WEIGHTS` are hand-set priors, not fitted. Needs
~300 labelled events before `fit_weights.py` means anything. Treat the
first fit as better priors, not answers.

## Gotchas

- Beta and ATR must be computed as of the event date. Backfilling with
  today's values leaks future information into features.
- If Astro deploys to a cloud host and Postgres is on the home box, the
  host cannot reach it. Needs a managed DB or a tunnel.
- Telegram Bot API caps ~20 messages/min to a group. The 15:00 filing
  flood will exceed this. Token-bucket in front of the sender, collapse
  overflow into a single "N more" message.
