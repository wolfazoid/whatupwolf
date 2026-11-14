# Market Desk v1 (capture + present) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A private, always-on service on Wolf's box that collects market-moving news from free public sources (plus Benzinga via Alpaca if a free account allows it), shows it as a live single-stream feed page, and sends an 08:15 CT morning brief with a Telegram ping.

**Architecture:** One Python package (`desk`) with three entry points run as systemd units inside WSL2: a long-running collector (one asyncio loop per source, every outbound request through a single rate-limited, circuit-breaking `FetchClient`), a FastAPI web server (feed page, JSON API, briefs, export), and a timer-driven brief job. SQLite (WAL) is the store: extracted fields only, scope filtering on read.

**Tech Stack:** Python ≥3.12, uv, httpx, feedparser, beautifulsoup4, holidays, FastAPI + uvicorn, pytest + pytest-asyncio + respx.

**Spec:** `docs/superpowers/specs/2026-11-10-private-market-desk-design.md` (whatupwolf repo; Task 1 copies it into the new repo as `docs/design.md`).

**Out of scope for this plan:** the self-building loop (separate OS user, merge step, Claude budget, changelog, source discovery and paid-source cases). That is **Plan 2**, written after v1 runs for a few days. v1 must not contain any `claude` invocation.

## Global Constraints

- New repo at `/Users/wolf/workspace/github.com/wolfazoid/market-desk` (develop on the Mac, deploy to the box via a private GitHub remote). Never inside whatupwolf.
- Use `uv` for everything (`uv add`, `uv run pytest`). Never pip.
- **No LLM anywhere in v1.**
- **No interpretation:** no scores, rankings, sentiment or "hot" labels in any output. Order is always newest first.
- **All network I/O goes through `desk.fetch.FetchClient`.** A test enforces this (Task 3).
- **EDGAR:** ≤10 req/s hard cap; we configure **5 req/s**. Every request to `www.sec.gov` carries `User-Agent` from env `EDGAR_USER_AGENT`; if it is unset, the client refuses to make the request.
- **Tier fails closed:** a source with a missing or unrecognised `tier` is `private`. Private-tier content never goes to Telegram.
- Credentials only in env (`.env` on the box, gitignored). Never in code, `sources.toml`, or the page.
- `data/` (SQLite DB, briefs, universe, ticker cache) is gitignored. Licensed content is never committed.
- Times stored as UTC ISO-8601; displayed in `America/Chicago` (CT).
- Web server binds `DESK_HOST` (default `127.0.0.1`) and `DESK_PORT` (default `8787`). It's never exposed publicly; reached over Tailscale.
- Universe = S&P 500 ∪ Nasdaq-100 ∪ Dow 30 ∪ `data/watchlist.txt`. Categories `fed`, `treasury`, `policy` are always in scope regardless of ticker.
- Tickers are normalised to SEC style: uppercase, `.` → `-` (e.g. `BRK-B`).

## Review Focus

1. **The Wikipedia constituent pages change format** and the parser returns 0 or 40 symbols. The expected behaviour is to keep the previous universe and alert, not to silently hide every company headline. Test in Task 5.
2. **More than 100 EDGAR filings land between two polls** (the 16:00 ET flood). The expected behaviour is to page the feed until it reaches a filing already seen (max 3 pages), not to drop the overflow. Test in Task 6.
3. **A collector loop dies or a source goes quiet** and nobody notices. The expected behaviour: the brief lists sources with no successful poll in 6 h, and a brief with zero items is still sent. Tests in Tasks 9 and 11.
4. **The process restarts while a host's circuit breaker is open** (crash, reboot). The expected behaviour is that the breaker survives the restart, with no immediate re-hit of a host that just returned 403. Test in Task 3.
5. **DST transition:** the Monday after DST ends (2026-11-02) must start its brief window at Friday 15:00 CT local time, not shifted by an hour. Test in Task 4.

---

## File Structure

```
market-desk/
  pyproject.toml            # deps, [project.scripts] desk = "desk.cli:main"
  sources.toml              # source + host registry (tier, cost, account, terms, rate)
  .env.example              # every env var, no values
  docs/design.md            # copy of the spec
  deploy/systemd/*.service|*.timer
  deploy/README.md          # box runbook (WSL2, Tailscale, Telegram bot, .env)
  desk/
    config.py               # env → Settings
    registry.py             # sources.toml → Registry (fail-closed tier)
    models.py               # Event dataclass, Category
    store.py                # SQLite: events, breakers, source_health
    scope.py                # in_scope(event, universe)
    fetch.py                # FetchClient: per-host rate limit, headers, breaker, backoff
    clock.py                # CT, trading days, brief window
    universe.py             # index constituents + watchlist
    sources/edgar.py        # getcurrent Atom, allowlist, 8-K items, CIK→ticker
    sources/fed.py          # Fed press releases + speeches RSS
    sources/treasury.py     # TreasuryDirect announced/auctioned
    sources/halts.py        # Nasdaq Trader halts RSS
    sources/fedreg.py       # Federal Register public inspection
    sources/benzinga.py     # Alpaca news REST (private tier, optional)
    collect.py              # per-source asyncio loops
    telegram.py             # sender: packing, overflow collapse, tier filter
    brief.py                # brief render + run
    web.py                  # FastAPI app
    static/feed.html        # vanilla JS feed page
    cli.py                  # argparse subcommands
  tests/…                   # mirrors desk/, fixtures in tests/fixtures/
```

---

### Task 1: Repo scaffold, settings, and source registry

**Files:**
- Create: `pyproject.toml`, `.gitignore`, `.env.example`, `sources.toml`, `docs/design.md`, `desk/__init__.py`, `desk/config.py`, `desk/registry.py`, `desk/models.py`
- Test: `tests/test_registry.py`, `tests/test_config.py`

**Interfaces:**
- Produces:
  - `Category = Literal["earnings", "company", "halt", "fed", "treasury", "policy"]`; `MACRO_CATEGORIES = frozenset({"fed", "treasury", "policy"})`
  - `@dataclass(frozen=True) class Event: id: str; source: str; category: Category; ticker: str | None; headline: str; url: str; published_at: datetime; features: dict` (id is `f"{source}:{native_id}"`, published_at tz-aware UTC)
  - `@dataclass(frozen=True) class SourceSpec: id: str; tier: Literal["public","private"]; cost: str; account: bool; terms: str; hosts: tuple[str, ...]; interval_s: int`
  - `@dataclass(frozen=True) class HostSpec: host: str; rate_per_sec: float; user_agent_env: str | None; extra_headers_env: dict[str, str]`
  - `class Registry: sources: dict[str, SourceSpec]; hosts: dict[str, HostSpec]; def tier(self, source_id: str) -> str; def host(self, host: str) -> HostSpec | None`; `def load_registry(path: Path) -> Registry`
  - `@dataclass(frozen=True) class Settings: data_dir: Path; db_path: Path; host: str; port: int; base_url: str; telegram_token: str | None; telegram_chat_id: str | None`; `def load_settings(env: Mapping[str, str] = os.environ) -> Settings`

- [ ] **Step 1: Scaffold.** `uv init --package market-desk` at the repo path, `git init`. Add deps: `uv add httpx feedparser beautifulsoup4 holidays fastapi uvicorn python-dotenv` and dev deps `uv add --dev pytest pytest-asyncio respx`. `.gitignore`: `data/`, `.env`, `.venv/`, `__pycache__/`. Copy the spec to `docs/design.md`.
- [ ] **Step 2: Write `sources.toml`** with one `[sources.<id>]` per source in this plan (`edgar`, `fed`, `treasury`, `halts`, `fedreg` with `tier="public"`, `cost="free"`, `account=false`, a `terms` URL; `benzinga` with `tier="private"`, `cost="free?"`, `account=true`). Intervals: edgar 60, halts 60, benzinga 30, fed 300, treasury 600, fedreg 900. Add `[hosts."<host>"]` entries:

  | host | rate_per_sec | user_agent_env |
  |---|---|---|
  | www.sec.gov | 5 | EDGAR_USER_AGENT |
  | www.federalreserve.gov | 1 | DESK_USER_AGENT |
  | www.treasurydirect.gov | 1 | DESK_USER_AGENT |
  | www.nasdaqtrader.com | 1 | DESK_USER_AGENT |
  | www.federalregister.gov | 1 | DESK_USER_AGENT |
  | en.wikipedia.org | 1 | DESK_USER_AGENT |
  | data.alpaca.markets | 2 | DESK_USER_AGENT (+ `extra_headers_env = {"APCA-API-KEY-ID"="APCA_API_KEY_ID", "APCA-API-SECRET-KEY"="APCA_API_SECRET_KEY"}`) |
  | api.telegram.org | 1 | (none) |

- [ ] **Step 3: Write failing tests** in `tests/test_registry.py`:

```python
def test_missing_tier_is_private(tmp_path): ...   # [sources.x] with no tier → reg.tier("x") == "private"
def test_unknown_tier_is_private(tmp_path): ...   # tier = "Public " → "private"
def test_unknown_source_is_private(): ...         # reg.tier("nope") == "private"
def test_repo_sources_toml_loads():               # load_registry(Path("sources.toml")): edgar public, benzinga private,
    ...                                           # hosts["www.sec.gov"].rate_per_sec == 5 and <= 10
```
  and `tests/test_config.py`: `test_defaults` (host `127.0.0.1`, port `8787`, data_dir `data`), `test_telegram_optional` (missing token → `None`, no exception).
- [ ] **Step 4: Run** `uv run pytest -q`. Expected: FAIL (modules missing).
- [ ] **Step 5: Implement** `models.py`, `registry.py` (stdlib `tomllib`), `config.py` (`python-dotenv` loads `.env` only in `load_settings` callers, not at import).
- [ ] **Step 6: Run** `uv run pytest -q`. Expected: PASS.
- [ ] **Step 7: Commit** `git commit -m "feat: scaffold, settings, fail-closed source registry"`

---

### Task 2: Store and scope

**Files:**
- Create: `desk/store.py`, `desk/scope.py`
- Test: `tests/test_store.py`, `tests/test_scope.py`

**Interfaces:**
- Consumes: `Event`, `MACRO_CATEGORIES` (Task 1)
- Produces:
  - `class Store: def __init__(self, path: Path)` (creates schema, `PRAGMA journal_mode=WAL`)
  - `upsert(self, events: Iterable[Event]) -> int`: inserts new ids only, returns the count inserted (an existing id is left untouched)
  - `query(self, *, since: datetime | None = None, until: datetime | None = None, limit: int = 500) -> list[Event]`: newest `published_at` first
  - `known_ids(self, ids: Iterable[str]) -> set[str]`
  - `breaker_get(self, host: str) -> tuple[datetime, str] | None` and `breaker_set(self, host: str, until: datetime, reason: str) -> None`
  - `mark_ok(self, source_id: str, at: datetime) -> None` and `last_ok(self) -> dict[str, datetime]`
  - `scope.in_scope(event: Event, universe: frozenset[str]) -> bool`: true if the category is in `MACRO_CATEGORIES`, or `event.ticker` is in the universe, or any of `event.features.get("symbols", [])` is in the universe

- [ ] **Step 1: Write failing tests:**

```python
def test_upsert_dedupes_and_counts(tmp_path):      # upsert([a, b]) == 2; upsert([a, c]) == 1; len(query()) == 3
def test_query_newest_first_and_window(tmp_path):   # since/until inclusive-exclusive; order by published_at desc
def test_roundtrip_preserves_features_and_tz(tmp_path)  # features dict and UTC tz survive
def test_breaker_persists_across_instances(tmp_path):   # Store(p).breaker_set(...); Store(p).breaker_get(host) == same
def test_wal_mode(tmp_path)                          # PRAGMA journal_mode returns "wal"
def test_scope_macro_always_in(): ...                # category="fed", ticker=None → True
def test_scope_company_needs_universe_ticker(): ...  # ticker "ZZZZ" not in universe → False; None → False
def test_scope_symbols_feature(): ...                # ticker None, features {"symbols": ["AAPL"]}, universe {"AAPL"} → True
```
- [ ] **Step 2: Run** `uv run pytest tests/test_store.py tests/test_scope.py -q`. Expected: FAIL.
- [ ] **Step 3: Implement.** Schema: `events(id TEXT PRIMARY KEY, source TEXT, category TEXT, ticker TEXT, headline TEXT, url TEXT, published_at TEXT, captured_at TEXT, features TEXT)` with an index on `published_at`; `breakers(host TEXT PRIMARY KEY, until TEXT, reason TEXT)`; `source_health(source TEXT PRIMARY KEY, last_ok TEXT)`. One connection per `Store`, `check_same_thread=False`, guarded by a `threading.Lock`.
- [ ] **Step 4: Run.** Expected: PASS.
- [ ] **Step 5: Commit** `git commit -m "feat: sqlite store with persisted breakers and scope filter"`

---

### Task 3: FetchClient (rate limit, headers, circuit breaker)

**Files:**
- Create: `desk/fetch.py`
- Test: `tests/test_fetch.py`, `tests/test_no_stray_network.py`

**Interfaces:**
- Consumes: `Registry`, `HostSpec` (Task 1); `Store.breaker_get/breaker_set` (Task 2)
- Produces:
  - `class UnregisteredHost(Exception)`, `class MissingUserAgent(Exception)`, `class BreakerOpen(Exception): host: str; until: datetime`
  - `class FetchClient: def __init__(self, registry: Registry, store: Store, *, env: Mapping[str, str] = os.environ, on_trip: Callable[[str, str, datetime], Awaitable[None]] | None = None, transport: httpx.AsyncBaseTransport | None = None)`
  - `async get(self, url: str, *, params: dict | None = None) -> httpx.Response`
  - `async post_json(self, url: str, payload: dict) -> httpx.Response`
  - `async aclose(self) -> None`

**Behaviour the tests pin:**
- An unregistered host raises `UnregisteredHost` before any request is made.
- If the host's `user_agent_env` is set but the env var is empty or missing, it raises `MissingUserAgent` with no request made.
- Requests per host are spaced at ≥ `1 / rate_per_sec` seconds, using an `asyncio.Lock` per host plus a monotonic clock.
- A **403** trips the breaker for **6 h**. A **429** trips it for `max(Retry-After seconds, 15 min)`. Either way it persists via `Store.breaker_set`, calls `on_trip(host, reason, until)` once, and raises `BreakerOpen`.
- Any call while the breaker is open (including from a fresh `FetchClient` on the same DB) raises `BreakerOpen` without making a request.
- 5xx responses and timeouts retry up to 3 times with exponential backoff (1 s, 2 s, 4 s), then raise `httpx.HTTPStatusError` or the timeout. They never trip the breaker.
- The default timeout is 20 s.

- [ ] **Step 1: Write failing tests** (respx for responses, a fake monotonic clock injected via a module-level `_now` you can monkeypatch):

```python
async def test_unregistered_host_refused()
async def test_sec_requires_user_agent()               # env without EDGAR_USER_AGENT → MissingUserAgent, respx route not called
async def test_sec_sends_user_agent()                  # request.headers["User-Agent"] == env value
async def test_rate_spacing_sec()                      # 3 calls → ≥ 0.2 s between starts (rate 5)
async def test_403_trips_6h_and_notifies_once()
async def test_429_uses_retry_after_floor_15min()      # Retry-After: 5 → until ≈ now + 15 min
async def test_breaker_survives_new_client(tmp_path)   # Review Focus 4: trip with client A, new client B on same Store → BreakerOpen, route call count unchanged
async def test_5xx_retries_then_raises_without_trip()
async def test_alpaca_extra_headers_from_env()
```
  and `tests/test_no_stray_network.py`:

```python
def test_only_fetch_py_imports_http_libraries():
    # walk desk/**/*.py; any file other than desk/fetch.py whose source matches
    # r"^\s*(import|from)\s+(httpx|requests|urllib\.request|aiohttp|socket|http\.client)\b" (re.M) fails the test
```
- [ ] **Step 2: Run** `uv run pytest tests/test_fetch.py tests/test_no_stray_network.py -q`. Expected: FAIL.
- [ ] **Step 3: Implement `FetchClient`** in `desk/fetch.py`, wrapping a single `httpx.AsyncClient`.
- [ ] **Step 4: Run.** Expected: PASS.
- [ ] **Step 5: Commit** `git commit -m "feat: FetchClient with per-host limits, mandatory UA, persisted circuit breaker"`

---

### Task 4: Market clock

**Files:**
- Create: `desk/clock.py`
- Test: `tests/test_clock.py`

**Interfaces:**
- Produces: `CT = ZoneInfo("America/Chicago")`; `is_trading_day(d: date) -> bool`; `previous_trading_day(d: date) -> date`; `brief_window(now: datetime) -> tuple[datetime, datetime]`, which returns (previous trading day 15:00 CT, `now`) as tz-aware UTC; `fmt_ct(dt: datetime) -> str`, which returns `"HH:MM"` in CT.

- [ ] **Step 1: Write failing tests:**

```python
def test_thanksgiving_closed():          assert not is_trading_day(date(2026, 11, 26))
def test_black_friday_open():            assert is_trading_day(date(2026, 11, 27))   # early close is still a trading day
def test_weekend_closed():               assert not is_trading_day(date(2026, 11, 14))
def test_monday_window_starts_friday():  # now = 2026-11-30 08:15 CT → start == 2026-11-27 15:00 CT
def test_dst_monday_window():            # Review Focus 5: now = 2026-11-02 08:15 CT → start == 2026-10-30 15:00 CT (== 20:00Z, CDT)
def test_window_is_utc():                # both ends .tzinfo == UTC
```
- [ ] **Step 2: Run.** Expected: FAIL.
- [ ] **Step 3: Implement** using `holidays.financial_holidays("NYSE")` for the holiday set.
- [ ] **Step 4: Run.** Expected: PASS.
- [ ] **Step 5: Commit** `git commit -m "feat: CT market clock and brief window"`

---

### Task 5: Universe (index constituents + watchlist)

**Files:**
- Create: `desk/universe.py`
- Test: `tests/test_universe.py`, `tests/fixtures/wiki_sp500.json`, `tests/fixtures/wiki_ndx.json`, `tests/fixtures/wiki_dow.json`

**Interfaces:**
- Consumes: `FetchClient.get` (Task 3)
- Produces:
  - `normalize_ticker(s: str) -> str`: uppercase, strip, `.` → `-`
  - `parse_constituents(html: str) -> list[str]`: the symbol column of the first `wikitable` whose header row contains `Symbol` or `Ticker`
  - `MIN_COUNTS = {"sp500": 490, "ndx": 95, "dow": 30}`
  - `async refresh_universe(client: FetchClient, data_dir: Path, notify: Callable[[str], Awaitable[None]] | None = None) -> bool`: fetches the three pages through the Wikipedia API (`https://en.wikipedia.org/w/api.php?action=parse&format=json&prop=text&page=<title>` with titles `List of S&P 500 companies`, `Nasdaq-100`, `Dow Jones Industrial Average`). Writes `data/universe.json` (`{"refreshed_at":…, "sp500":[…], "ndx":[…], "dow":[…]}`) **only if every count meets `MIN_COUNTS`**. Otherwise it keeps the old file, calls `notify` with which index fell short, and returns `False`.
  - `load_universe(data_dir: Path) -> frozenset[str]`: the union of `universe.json` lists and the non-blank, non-`#` lines of `watchlist.txt` (both optional; missing files contribute nothing)

- [ ] **Step 1: Capture fixtures.** Fetch the three API responses once by hand with curl and save them to `tests/fixtures/` (this is the only live fetch; the tests stay offline).
- [ ] **Step 2: Write failing tests:**

```python
def test_parse_sp500_fixture():        # len >= 490, "AAPL" in result, "BRK-B" in result
def test_parse_dow_fixture():          # len == 30
def test_normalize():                  # normalize_ticker(" brk.b ") == "BRK-B"
async def test_refresh_rejects_short_list(tmp_path):  # Review Focus 1: existing universe.json + mocked sp500 page with 40 rows
                                                       # → returns False, file unchanged, notify called with "sp500"
async def test_refresh_writes_when_complete(tmp_path)
def test_load_includes_watchlist(tmp_path):   # watchlist "pltr\n# comment\n" → "PLTR" in universe
```
- [ ] **Step 3: Run.** Expected: FAIL.
- [ ] **Step 4: Implement** with BeautifulSoup (`html.parser`).
- [ ] **Step 5: Run.** Expected: PASS.
- [ ] **Step 6: Commit** `git commit -m "feat: index-constituent universe with sanity floor, plus watchlist"`

---

### Task 6: EDGAR collector

Port from whatupwolf commit `481e480` (`src/lib/feed/{edgar,forms,items,tickers}.ts`), reading them with `git show 481e480:<path>` in the whatupwolf repo. Keep the parsing rules but **drop the hot/routine flag**: no interpretation.

**Files:**
- Create: `desk/sources/__init__.py`, `desk/sources/edgar.py`
- Test: `tests/sources/test_edgar.py`, `tests/fixtures/edgar_getcurrent.xml`, `tests/fixtures/edgar_8k_index.htm`, `tests/fixtures/company_tickers.json` (≈5 entries)

**Interfaces:**
- Consumes: `FetchClient` (Task 3), `Store.known_ids/upsert` (Task 2), `Event` (Task 1)
- Produces:
  - `FORM_ALLOWLIST`: exactly the old list (`8-K`, `8-K/A`, `SCHEDULE 13D`, `SCHEDULE 13D/A`, `SC 13D`, `SC 13D/A`, `S-3`, `S-3/A`, `424B5`, `NT 10-K`, `NT 10-Q`, `25`, `25-NSE`)
  - `ITEM_LABELS: dict[str, str]`: the old ten codes → labels (`"2.02": "Earnings release"`, …)
  - `@dataclass class EdgarEntry: id: str; form: str; company: str; cik: str; filed_at: datetime; url: str`
  - `parse_atom(xml: str) -> list[EdgarEntry]`: same tolerance rules as the TS version (a malformed entry is dropped, never raised); the CIK is zero-padded to 10 digits
  - `parse_item_codes(html: str) -> list[str]`: same regex behaviour as the TS `parseItemCodes`
  - `GETCURRENT = "https://www.sec.gov/cgi-bin/browse-edgar?action=getcurrent&output=atom&count=100"`; `TICKERS_URL = "https://www.sec.gov/files/company_tickers.json"`
  - `async load_ticker_map(client, data_dir: Path) -> dict[str, str]`: CIK → ticker (normalised), cached at `data/company_tickers.json`, refetched when older than 24 h; on failure it uses the stale cache, else `{}`
  - `to_event(entry: EdgarEntry, items: list[str], ticker: str | None) -> Event`: id `edgar:<accession id>`; category `earnings` if `"2.02" in items`, else `company`; headline `f"{form}{' · ' + '; '.join(labels) if labels else ''} · {company}"` (unknown codes are shown as `Item <code>`); features `{"form", "cik", "company", "items"}`
  - `async collect(client: FetchClient, store: Store, data_dir: Path) -> list[Event]`

**Behaviour the tests pin:**
- It pages `GETCURRENT&start=0|100|200` and stops at the first page containing an already-known id. The maximum is 3 pages.
- Only allowlisted forms become events.
- Each *new* 8-K / 8-K/A gets its index page fetched for items, through the client's rate limit. A failed index fetch gives `items=[]` and the event is still kept.

- [ ] **Step 1: Capture fixtures.** Save one live getcurrent page and one real 8-K `-index.htm`, using a curl with your UA, by hand, once.
- [ ] **Step 2: Write failing tests:**

```python
def test_parse_atom_fixture()                  # non-empty; every entry has 10-digit cik or ""; filed_at tz-aware
def test_parse_atom_drops_malformed()          # entry missing <link> skipped, others kept
def test_allowlist_includes_schedule_13d()     # regression from 481e480: "SCHEDULE 13D" passes
def test_item_codes_both_shapes()              # "Item 5.02: …" and "items 2.02 and 9.01" → ["2.02","9.01"] etc.
def test_to_event_earnings_category()          # items ["2.02","9.01"] → category "earnings"
def test_to_event_no_hot_flag()                # "hot" not in features and not in headline
async def test_pages_until_known(tmp_path)     # Review Focus 2: page0 all new, page1 contains a known id → 2 page fetches, not 3
async def test_page_cap_three(tmp_path)        # all pages new → exactly 3 page fetches
async def test_item_fetch_failure_keeps_event(tmp_path)
async def test_ticker_join(tmp_path)           # cik in company_tickers fixture → ticker set
```
- [ ] **Step 3: Run.** Expected: FAIL.
- [ ] **Step 4: Implement.**
- [ ] **Step 5: Run.** Expected: PASS.
- [ ] **Step 6: Commit** `git commit -m "feat: EDGAR collector (allowlist, 8-K items, tickers, paging)"`

---

### Task 7: Fed and Treasury collectors

**Files:**
- Create: `desk/sources/fed.py`, `desk/sources/treasury.py`
- Test: `tests/sources/test_fed.py`, `tests/sources/test_treasury.py`, plus fixtures captured live once

**Interfaces:**
- Consumes: `FetchClient`, `Event`
- Produces (each module): `parse(...) -> list[Event]` (pure) and `async collect(client: FetchClient, store: Store, data_dir: Path) -> list[Event]` (same signature as EDGAR's, which the runner relies on)
  - **fed:** feeds `https://www.federalreserve.gov/feeds/press_all.xml` and `https://www.federalreserve.gov/feeds/speeches.xml`, parsed with `feedparser.parse(text)`. Category `fed`, ticker `None`, id `fed:<entry link>`, headline is the entry title, published time from `published_parsed`, features `{"feed": "press"|"speeches"}`.
  - **treasury:** `https://www.treasurydirect.gov/TA_WS/securities/announced?format=json&days=7` and `.../auctioned?format=json&days=7`. Category `treasury`, ticker `None`. Ids are `treasury:<cusip>:announced` and `treasury:<cusip>:auctioned`, so an announcement and its result are two events.
    - Announced headline: `"Treasury to auction {securityTerm} {securityType} · ${offeringAmount/1e9:.0f}B · {auctionDate:%a %b %d}"`.
    - Auctioned headline: `"{securityTerm} {securityType} auction · high {highYield or highDiscountRate}% · bid-to-cover {bidToCoverRatio}"`.
    - URL: `https://www.treasurydirect.gov/auctions/announcements-data-results/`.
    - Features: the raw numeric fields used.

- [ ] **Step 1: Capture fixtures** (two Fed feeds, two TreasuryDirect responses). If the TreasuryDirect field names differ from the ones above, use the real ones and note it in the module docstring.
- [ ] **Step 2: Write failing tests:** `test_fed_parse_fixture` (category, tz-aware UTC, id prefix), `test_fed_entry_without_date_skipped`, `test_treasury_announced_headline` (e.g. contains `"B ·"` and the term), `test_treasury_results_separate_id`, `test_treasury_missing_yield_field_tolerated` (bills report a discount rate, not a yield).
- [ ] **Step 3: Run.** Expected: FAIL.
- [ ] **Step 4: Implement.**
- [ ] **Step 5: Run.** Expected: PASS.
- [ ] **Step 6: Commit** `git commit -m "feat: Fed and Treasury collectors"`

---

### Task 8: Halts and Federal Register collectors

**Files:**
- Create: `desk/sources/halts.py`, `desk/sources/fedreg.py`
- Test: `tests/sources/test_halts.py`, `tests/sources/test_fedreg.py`, plus fixtures captured live once

**Interfaces:** same `parse` / `collect` shape as Task 7.
- **halts:** `https://www.nasdaqtrader.com/rss.aspx?feed=tradehalts`.
  - Fields: `ndaq:IssueSymbol`, `ndaq:IssueName`, `ndaq:HaltDate`, `ndaq:HaltTime` (Eastern), `ndaq:ReasonCode`, `ndaq:ResumptionTradeTime`.
  - Category `halt`, ticker = symbol (normalised), id `halts:<symbol>:<HaltDate>:<HaltTime>`.
  - Headline: `"Halted ({ReasonCode}) · {IssueName}"`. When there is a resumption time, also emit `halts:<…>:resumed` with `"Resumed {time} ET · {IssueName}"`.
  - Times are parsed as `America/New_York`.
- **fedreg:** `https://www.federalregister.gov/api/v1/public-inspection-documents/current.json`.
  - Category `policy`, ticker `None`, id `fedreg:<document_number>`, headline `"{agency names joined '; '}: {title}"`, URL `html_url`.
  - Keep a document only if its `type` is `"Presidential Document"` **or** any agency slug is in `AGENCY_ALLOWLIST = {"treasury-department", "commerce-department", "trade-representative-office-of-united-states", "securities-and-exchange-commission", "commodity-futures-trading-commission", "federal-reserve-system", "federal-deposit-insurance-corporation", "comptroller-of-the-currency", "energy-department", "executive-office-of-the-president"}`. This is capture scope, not ranking.

- [ ] **Step 1: Capture fixtures.**
- [ ] **Step 2: Write failing tests:** `test_halt_parse_fixture`, `test_halt_resumption_is_second_event`, `test_halt_time_eastern_to_utc` (09:45 ET in November → 14:45Z), `test_fedreg_keeps_presidential`, `test_fedreg_drops_unlisted_agency`.
- [ ] **Step 3: Run.** Expected: FAIL.
- [ ] **Step 4: Implement.**
- [ ] **Step 5: Run.** Expected: PASS.
- [ ] **Step 6: Commit** `git commit -m "feat: trading-halt and Federal Register collectors"`

---

### Task 9: Collector runner and CLI

**Files:**
- Create: `desk/collect.py`, `desk/cli.py`
- Modify: `pyproject.toml` (`[project.scripts] desk = "desk.cli:main"`)
- Test: `tests/test_collect.py`

**Interfaces:**
- Consumes: every `sources/*.collect`, `Registry`, `FetchClient`, `Store.upsert/mark_ok`, `refresh_universe`
- Produces:
  - `COLLECTORS: dict[str, Callable[[FetchClient, Store, Path], Awaitable[list[Event]]]]`, keyed by registry source id
  - `async run_source(spec: SourceSpec, fn, client, store, data_dir, *, stop: asyncio.Event) -> None`: loops `fn`, then `upsert`, then `mark_ok`, then sleeps `interval_s`. Any exception is logged (stdlib `logging`) and the loop continues. On `BreakerOpen` it sleeps until `until`.
  - `async run_all(settings, registry, *, stop: asyncio.Event) -> None`: one task per enabled source, plus a daily universe refresh at 06:00 CT. A source is enabled when it is in `COLLECTORS` and its required env is present (benzinga needs `APCA_API_KEY_ID`).
  - `stale_sources(last_ok: dict[str, datetime], enabled: Iterable[str], now: datetime, max_age: timedelta = timedelta(hours=6)) -> list[str]`: enabled sources that have never succeeded count as stale
  - CLI subcommands: `desk collect`, `desk serve`, `desk brief [--dry-run]`, `desk refresh-universe`, `desk probe-benzinga`, `desk recent [-n 20]` (prints recent in-scope events to the terminal; a quick check over SSH)
  - The FetchClient's `on_trip` sends a Telegram alert `"⛔ {host} returned {reason}; paused until {until CT}"` when Telegram is configured (Task 10 provides the sender; wire it in Task 10's last step)

- [ ] **Step 1: Write failing tests:**

```python
async def test_one_source_crash_does_not_stop_others()  # fn A raises every call, fn B returns events → B's events stored, mark_ok(B)
async def test_breaker_open_sleeps_until()              # fn raises BreakerOpen(until=now+1s) → no call before until
def test_stale_sources()                                # Review Focus 3: fed last_ok 7h ago, edgar 1 min ago, halts never → ["fed", "halts"]
def test_benzinga_disabled_without_keys()
```
- [ ] **Step 2: Run.** Expected: FAIL.
- [ ] **Step 3: Implement.** Handle SIGTERM by setting `stop`.
- [ ] **Step 4: Run.** Expected: PASS. Then run a live smoke test on the Mac: `cp .env.example .env`, fill in both UA vars, run `uv run desk refresh-universe && timeout 180 uv run desk collect; uv run desk recent -n 15`. Expected: recent EDGAR/halt/Fed lines with tickers.
- [ ] **Step 5: Commit** `git commit -m "feat: per-source collector loops, staleness, CLI"`

---

### Task 10: Telegram sender

**Files:**
- Create: `desk/telegram.py`
- Modify: `desk/cli.py`, `desk/collect.py` (wire `on_trip` and the universe-refresh `notify`)
- Test: `tests/test_telegram.py`

**Interfaces:**
- Consumes: `FetchClient.post_json`, `Registry.tier`, `fmt_ct`
- Produces:
  - `class Telegram: def __init__(self, client: FetchClient, token: str, chat_id: str)`; `async send(self, text: str) -> None`: `sendMessage` with `disable_web_page_preview=True` and **no `parse_mode`** (plain text, so headline characters cannot break or inject formatting)
  - `pack(header: str, lines: list[str], *, limit: int = 4000, max_messages: int = 3) -> list[str]`: packs lines into messages of at most `limit` chars. If they don't fit in `max_messages`, the last message ends with `"…and {n} more"`.
  - `ping_lines(events: list[Event], registry: Registry) -> list[str]`: keeps **only** events whose `registry.tier(event.source) == "public"`, formatted `"{HH:MM} {ticker or category.upper()} · {headline} {url}"`
  - `notifier(settings, client) -> Callable[[str], Awaitable[None]] | None`: returns `None` when Telegram isn't configured

- [ ] **Step 1: Write failing tests:**

```python
def test_ping_excludes_private_tier()        # benzinga event dropped, edgar kept
def test_ping_excludes_unknown_source()      # source "mystery" (not in registry) dropped — fail closed
def test_pack_respects_limit()               # every message <= 4000 chars
def test_pack_overflow_collapses()           # 500 lines → 3 messages, last ends with "…and N more" with correct N
async def test_send_plain_text()             # posted JSON has no "parse_mode" key; url host api.telegram.org
```
- [ ] **Step 2: Run.** Expected: FAIL.
- [ ] **Step 3: Implement**, then wire `on_trip` and the universe `notify` in `collect.py`/`cli.py`.
- [ ] **Step 4: Run.** Expected: PASS.
- [ ] **Step 5: Commit** `git commit -m "feat: Telegram sender with tier filter and overflow collapse"`

---

### Task 11: Morning brief

**Files:**
- Create: `desk/brief.py`
- Modify: `desk/cli.py`
- Test: `tests/test_brief.py`

**Interfaces:**
- Consumes: `brief_window`, `is_trading_day`, `fmt_ct` (Task 4); `Store.query/last_ok`; `in_scope`, `load_universe`; `stale_sources`; `Telegram`, `pack`, `ping_lines`
- Produces:
  - `render_brief(events: list[Event], *, day: date, start: datetime, stale: list[str]) -> str`
  - `async run_brief(settings, registry, store, *, now: datetime, telegram: Telegram | None, dry_run: bool = False) -> Path | None`: returns `None` on a non-trading day without writing or sending; otherwise writes `data/briefs/YYYY-MM-DD.md` (overwriting on re-run) and sends the ping unless `dry_run`

**Exact format:**

```markdown
# Market brief · Tue 2026-11-10

14 items since Mon 15:00 CT

⚠ No successful poll in 6h: fed

- 07:42 · XYZ · 8-K · Earnings release; Financial statements and exhibits · XYZ CORP · <url>
- 07:15 · FED · Speech by Governor … · <url>
```
  Lines are newest first and in scope only; the `⚠` line appears only when `stale` is non-empty. The ping header is `"Market brief · {Tue Nov 10} · {n} items\n{base_url}/briefs/{date}"`, followed by `ping_lines`. **A brief with zero items is still written and pinged**, so silence always means something is broken.

- [ ] **Step 1: Write failing tests:**

```python
def test_render_newest_first_flat_no_categories()   # no "##" headings; order by time desc
def test_render_stale_warning()                     # Review Focus 3
async def test_non_trading_day_noop(tmp_path)       # 2026-11-26 → None, no file, no send
async def test_zero_items_still_pinged(tmp_path)    # Review Focus 3
async def test_out_of_scope_excluded(tmp_path)      # company event ticker not in universe → not in file
async def test_ping_has_no_private_lines(tmp_path)  # benzinga event in file, absent from sent text
```
- [ ] **Step 2: Run.** Expected: FAIL.
- [ ] **Step 3: Implement**, then wire `desk brief`.
- [ ] **Step 4: Run.** Expected: PASS. Then run `uv run desk brief --dry-run` against the smoke DB from Task 9 and read the file.
- [ ] **Step 5: Commit** `git commit -m "feat: morning brief file and Telegram ping"`

---

### Task 12: Web server and live feed page

**Files:**
- Create: `desk/web.py`, `desk/static/feed.html`
- Modify: `desk/cli.py` (`desk serve` runs uvicorn on `settings.host:settings.port`)
- Test: `tests/test_web.py`

**Interfaces:**
- Consumes: `Store.query/last_ok`, `in_scope`, `load_universe` (reloaded when the file's mtime changes), `fmt_ct`
- Produces: `create_app(settings: Settings, store: Store) -> FastAPI` with these routes:
  - `GET /` → `feed.html`
  - `GET /api/events?since=<iso>&limit=<int ≤500, default 200>` → `{"events": [{id, source, category, ticker, headline, url, published_at, time_ct}], "server_time": iso}`, in scope, newest first
  - `GET /briefs/{day}` → `text/markdown; charset=utf-8`. `day` must match `^\d{4}-\d{2}-\d{2}$`, else 404 (no path traversal).
  - `GET /briefs` → newest-first list of brief dates (JSON)
  - `GET /export.jsonl?from=<iso>&to=<iso>` → every stored event in the window (not scope-filtered), one JSON object per line
  - `GET /health` → `{"last_ok": {source: iso}, "stale": [...]}`

**Page (`feed.html`):**
- Vanilla JS, no framework, no external assets. It's narrow-friendly so it fits a corner window.
- It polls `/api/events?since=<newest seen>` every **15 s** and prepends new rows, keeping the newest 300 in the DOM.
- Each row: `HH:MM` CT · ticker or category in caps · headline as a link (`target="_blank" rel="noopener"`) · source id.
- A text box filters by ticker and a select filters by category, both client-side.
- New rows briefly highlight.
- If a poll fails, a "disconnected" badge shows until the next success.
- **Rows are built with `textContent` / `createElement`, never `innerHTML` with data.** Link `href` is set only when the URL starts with `https://`.

- [ ] **Step 1: Write failing tests** (FastAPI `TestClient`):

```python
def test_events_in_scope_newest_first(tmp_path)
def test_events_since_filters(tmp_path)
def test_limit_capped_at_500(tmp_path)
def test_brief_path_traversal_404(tmp_path)          # /briefs/..%2F..%2Fetc%2Fpasswd → 404
def test_export_includes_out_of_scope(tmp_path)
def test_feed_html_never_uses_innerHTML_with_data()   # static check: "innerHTML" absent from feed.html
def test_feed_html_has_no_external_urls()             # no "http://" or "https://" src/href in the static file
```
- [ ] **Step 2: Run.** Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run.** Expected: PASS. Then run `uv run desk serve` against the smoke DB, open `http://127.0.0.1:8787` in a narrow window, and check that rows appear and links open their sources.
- [ ] **Step 5: Commit** `git commit -m "feat: live feed page, events API, briefs, export"`

---

### Task 13: Benzinga via Alpaca (optional, key-gated)

**Files:**
- Create: `desk/sources/benzinga.py`
- Modify: `desk/collect.py` (register in `COLLECTORS`), `desk/cli.py` (`probe-benzinga`)
- Test: `tests/sources/test_benzinga.py`, `tests/fixtures/alpaca_news.json` (hand-written from the documented shape: `news[]` with `id`, `headline`, `summary`, `url`, `symbols`, `created_at`, `updated_at`, `source`)

**Interfaces:**
- Produces:
  - `parse(payload: dict) -> list[Event]`:
    - id `benzinga:<id>`, source `benzinga`, `ticker` = the first symbol (normalised) or `None`, features `{"symbols": [...normalised], "summary": ...}`.
    - Category: `earnings` if the headline matches `r"\b(Q[1-4]|EPS|earnings|guidance|revenue)\b"` (case-insensitive), else `company` if it has symbols, else `policy`.
    - This is a capture category, not a judgement; the review should check the wording stays neutral.
  - `async collect(...)`: `GET https://data.alpaca.markets/v1beta1/news?limit=50&sort=desc`
  - `async probe(client) -> str`: makes one request and returns `"ok: N articles"`, `"no access: HTTP 403 (plan does not include news)"`, or `"not configured"`. It must **not** trip the breaker on a 401/403 here, because a probe is expected to fail when there's no access: call it with a `FetchClient` flag `probe=True` that skips tripping. Add that parameter to `FetchClient.get` with a test in `tests/test_fetch.py`.

- [ ] **Step 1: Write failing tests:** `test_parse_multi_symbol_any_in_universe_in_scope`, `test_parse_no_symbols_is_policy`, `test_benzinga_tier_private_in_repo_registry`, `test_probe_403_reports_no_access_without_trip`.
- [ ] **Step 2: Run.** Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run.** Expected: PASS.
- [ ] **Step 5: Commit** `git commit -m "feat: optional Benzinga collector via Alpaca (private tier)"`

---

### Task 14: Deploy to the box (WSL2) and runbook

**Files:**
- Create: `deploy/systemd/market-desk-collect.service`, `deploy/systemd/market-desk-web.service`, `deploy/systemd/market-desk-brief.service`, `deploy/systemd/market-desk-brief.timer`, `deploy/README.md`, `README.md`

**Unit requirements:**
- `collect` and `web` use `Restart=always`, `RestartSec=10`, `WorkingDirectory=` the checkout, `EnvironmentFile=` its `.env`, and `ExecStart=` `uv run desk collect` / `uv run desk serve`.
- `brief.timer`: `OnCalendar=Mon..Fri *-*-* 08:15:00 America/Chicago`, `Persistent=false` (a missed brief is not sent late).
- `brief.service`: `Type=oneshot`, `uv run desk brief`. Holidays are handled in code.

**`deploy/README.md` must cover, in order, as a checklist Wolf runs once:**
1. Enable systemd in WSL2 (`/etc/wsl.conf` → `[boot]\nsystemd=true`, then `wsl --shutdown`), and a Windows Task Scheduler task "At startup" running `wsl.exe -d <distro> --exec /bin/true` so WSL starts without a login.
2. Install Tailscale inside the WSL2 distro and set `DESK_HOST` to the WSL Tailscale IP. Check from the Mac with `curl http://<ip>:8787/health`.
3. Create the Telegram bot with @BotFather, send it any message, and get `chat_id` from `getUpdates`. Fill `.env`.
4. Optional: open a free Alpaca **paper** account, put its keys in `.env`, and run `uv run desk probe-benzinga`.
5. `uv sync`, `uv run desk refresh-universe`, copy units to `~/.config/systemd/user/` (with `loginctl enable-linger $USER`), `systemctl --user enable --now market-desk-collect market-desk-web market-desk-brief.timer`.
6. Verify: `systemctl --user list-timers` shows the brief, `uv run desk recent` shows events, `uv run desk brief --dry-run` writes a file, and the Mac browser shows the feed.

`README.md` covers what the desk is, the commands, where data lives, how to edit `data/watchlist.txt`, and how to pause (`systemctl --user stop market-desk-collect`).

- [ ] **Step 1: Write the units and both READMEs.**
- [ ] **Step 2: Verify the units parse:** `systemd-analyze verify deploy/systemd/*` (run on the box, or in any Linux container). Expected: no errors.
- [ ] **Step 3: Full suite:** `uv run pytest -q`. Expected: all pass.
- [ ] **Step 4: Commit** `git commit -m "chore: systemd units and box runbook"`
- [ ] **Step 5: Hand off to Wolf.** These steps are his: create the private GitHub repo and push; on the box, clone and work through `deploy/README.md`. Don't create the GitHub repo or any account on his behalf.

---

## After v1

When the brief has run for a few trading days, write **Plan 2: the builder loop** from the spec's "Self-building loop" and "Hard limits" sections:
- the separate Linux user and the merge step
- the protected paths
- the weekly Claude budget and `PAUSED`
- the changelog, with a per-source contribution count using `Store` grouped by source
- source discovery under the free + no-account + terms rule
- paid-source case files
- the first backlog item: deterministic earnings figures from the 8-K 2.02 exhibit and XBRL
