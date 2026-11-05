# Aquariux Web Trader – QA Automation Assessment

Automated end-to-end and API-level tests for the **Aquariux Web Trader** demo platform, built as a 2-day technical assessment.

- **UI E2E tests:** TypeScript + Playwright (Page Object Model)
- **API / data validation tests:** Python + pytest
- **Platform in scope:** Web Trader only (desktop browser)

> Status: <!-- TODO: update at end commit, e.g. "XX UI tests, YY API tests, all passing on 2026-11-05" -->

---

## 1. How I interpreted the requirements

No specification was provided, and the hiring team asked me to work from my own understanding. I explored the demo platform first (UI, network traffic, symbol metadata) and let what it actually does drive the scope, instead of testing a generic "trading app".

### 1.1 Decisions

| Area | Decision | Rationale |
| --- | --- | --- |
| Platform | Web Trader only, desktop Chromium | The web client exposes all 7 functional areas. Mobile and cross-browser runs add cost but no new business coverage in 2 days. |
| Languages | TypeScript + Playwright for UI E2E; Python + pytest for data validation | Each language where it is strongest: Playwright for browser + network control, Python/pydantic for schema and rule checks on the captured data. |
| Instruments | **XAUUSD** primary; XAGUSD and XTIUSD as extra symbols; an open-but-not-tradable symbol (GBPJPY preferred, looked up at run time since the flag changes); a symbol reporting `CLOSED` for market-closed checks | The demo account offers only Forex and Commodities (no crypto), and only symbols with `tradableExeMode: true` accept web orders. XAUUSD has a live feed, 2-decimal prices, no stop level and a 0.1-lot step that allows a clean partial close (0.2 → 0.1). |
| Instrument specs | Read at run time from `GET /api/market/v1/symbol/detail` | Tick size, min/step/max lot, stop level, order types and expiry types come from the platform itself, so tests survive configuration changes. |
| Account model | One demo account, **netting** (`horizonAccountType: NET`) | Same-symbol same-side orders merge. Tests that need several positions use different symbols. |
| Market closure | `@live` vs `@mocked` tags; `page.route` mocks symbol status and trade errors | FX and metals trade Mon–Fri only. Mocked tests run at any time; they still load the real app with a logged-in session. |
| Business rules | Observed behaviour first, MT5 conventions second | Every rule that the platform does not state is marked *assumed* in [docs/assumptions.md](docs/assumptions.md). |
| Execution | Serial (`workers: 1`) | All tests share one account. Bulk close/delete would otherwise remove another test's data. |

### 1.2 How the brief maps to the platform

| # | Brief | What the platform offers | Test focus |
| --- | --- | --- | --- |
| 1 | Market orders with SL/TP | Buy/Sell, SL/TP by price or points, confirmation dialog | Correct side/volume/SL/TP on the created position; wrong-side SL/TP and invalid volume rejected |
| 2 | One-Click Trading | Settings toggle (T&C on first use), **One Click** tab, no confirmation dialog | Order sent without dialog; dialog present when OCT is off; setting persists |
| 3 | Pending orders | Limit, Stop, Stop Limit; GTC, Good Till Day, Specified Date, Specified Date and Time | Each type on the correct side of the market; each expiry option saved; modify and delete |
| 4 | Positions | Edit SL/TP, close with any step-aligned volume | Partial close keeps the Order No. and leaves the right remainder |
| 5 | Bulk operations | Bulk Close All / Profitable / Loss (max 30), Bulk Delete | `closedOrderIds` in the response equals the IDs the test opened |
| 6 | History, transactions, notifications | Positions History (per position), Orders & Deals (per order with deals), Position Created/Closed notifications | Every action leaves the expected record; "transactions" = Orders & Deals |
| 7 | Cross-record consistency | One ID links everything: `clOrdId` = `orderId` = Order No. = `positionId` | Follow one ID through every view and compare all fields; deal P/L adds up to position P/L |

### 1.3 Prioritisation

48 test cases (20 P1, 17 P2, 11 P3), listed in [docs/test-cases.md](docs/test-cases.md). P1 covers the happy path of every area plus the negative cases with direct money impact (wrong-side SL/TP, wrong-side pending price). If time runs short, P3 is cut first; documentation is never cut.

## 2. Functional coverage

| # | Functional area (from brief) | Spec file | Tags |
| --- | --- | --- | --- |
| 1 | Buy/Sell market orders with Stop Loss and Take Profit | `ui-tests/tests/01-market-orders-sl-tp.spec.ts` | `@live` |
| 2 | Buy/Sell market orders with One-Click Trading | `ui-tests/tests/02-one-click-trading.spec.ts` | `@live` |
| 3 | Pending orders: types and expiry options | `ui-tests/tests/03-pending-orders.spec.ts` | `@live` |
| 4 | View, modify, partially close, close positions | `ui-tests/tests/04-position-management.spec.ts` | `@live` |
| 5 | Bulk close / bulk delete | `ui-tests/tests/05-bulk-operations.spec.ts` | `@live` |
| 6 | Transactions, notifications, order history | `ui-tests/tests/06-history-notifications.spec.ts` | `@live` |
| 7 | Order details and status across trading records | `ui-tests/tests/07-cross-record-consistency.spec.ts` | `@live` |
| – | Market-closed behaviour | `ui-tests/tests/08-market-closed.spec.ts` | `@mocked` (MC-01..03), `@live` (MC-04) |
| – | Smoke and account guards (empty before / after the run) | `ui-tests/tests/00-*.spec.ts`, `99-account-postflight.spec.ts` | `@live` |
| – | Schema, business-rule and cross-record validation of captured API responses | `api-tests/tests/` | pytest |

## 3. Architecture

### 3.1 Layers

```
tests/*.spec.ts            intent + assertions only, one file per functional area
        │
fixtures/                  auth state, One-Click state, tracked orders with automatic cleanup
        │
pages/  ── dialogs/        UI: what a user can see and do (no assertions, no test data)
api/                       network: capture the app's own requests/responses as typed records
        │
domain/                    pure logic: models, price maths, business rules (no Playwright imports)
config/  data/  mocks/     environment, symbols, mock payloads
        │
artifacts/records/*.json   ──►  api-tests (Python): schema + rule validation
```

Each layer only depends on the layers below it. That keeps the specs short and readable, and it means a UI change is fixed in one page object, not in many tests.

### 3.2 Design choices and why

| Choice | Why it matters here |
| --- | --- |
| **The network is the test oracle, the UI is the subject.** Every action waits for its own backend response (`waitForResponse`) and keeps the typed result. | The UI shows rounded and formatted values (`3,928.70`); the API returns the real values and the IDs. Tests compare UI ↔ API instead of UI ↔ a hard-coded guess. It also removes timing guesswork: the test continues when the backend has answered. |
| **One ID followed everywhere.** `clOrdId` from the order response is used to find the row in Open Positions, Pending, Positions History, Orders & Deals and Notifications. | Rows are located by ID, never by position in the table, so tests do not break when other records exist. This is the backbone of the cross-record scope. |
| **Specs read at run time.** A `SymbolDetail` is taken from the app's own `symbol/detail` response. | No hard-coded tick size, lot step or prices. SL/TP and pending prices are offsets from live Bid/Ask, rounded to `pointStep`. |
| **Page objects per screen area, dialogs as components.** Order panel, One Click panel, each asset tab, date filter, notification panel, settings menu; confirmation / edit position / edit order / close / delete / bulk dialogs are separate classes. Page objects hold no business assertions; a few retry an action with `expect(...).toPass()` where a list refresh can undo it. | Several dialogs reuse the same `data-testid`s (e.g. `trade-input-stoploss-price` in both the order panel and the Edit dialog). Each component scopes its locators to its own root, which removes that ambiguity. |
| **Selector policy:** `data-testid` → role/label → visible text inside a scoped component. No XPath, no CSS chains. | The app already exposes testids for most controls; dropdown options do not, so they are chosen by text inside the open dropdown only. |
| **Domain layer without Playwright.** Price rounding, side rules (SL/TP and pending price direction), volume validation, P/L reconciliation. | Pure functions can be reused by fixtures, page objects and tests, and are easy to review. |
| **Fixtures own state and cleanup.** `oneClick` sets the toggle to the state a test needs. `created` records every ID a test creates, also adopts any order that appeared during the test without being registered (snapshot before vs after), and closes/deletes only those in teardown, verified through the API. `AC-00` / `AC-99` check the account is empty before and after the whole run. | Tests are independent and leave the shared account clean, even on failure; a leak fails the test that caused it instead of a later one. |
| **REST client for setup, cleanup and reads.** `TraderApi` reuses the `Authorization: Bearer` header from the app's own requests and calls the same endpoints with `page.request`. | Tests verify UI actions, but read state and tidy up through the API: faster and independent of table rendering. No second login and no token handling in test code. |
| **Login once.** A setup project logs in from `.env` and saves `storageState` (the session token lives in `localStorage`). | Saves time and keeps credentials out of every spec. |
| **Typed config, fail fast.** `config/env.ts` loads `.env`; `BASE_URL` defaults to the demo site, and a missing `DEMO_USERNAME` / `DEMO_PASSWORD` stops the login setup with one clear message. | A missing variable fails in one clear line instead of a timeout deep in a test. |
| **Two Playwright projects: `live` and `mocked`.** Mocked specs intercept only the endpoints they change. | Closed-market behaviour is tested on any day, independent of market hours. Both projects use the saved login. Without a login, `make lint`, the unit tests and `make api-samples` (Python checks on the committed samples) still run. |
| **Python validates what the UI tests captured.** The TS suite writes the records it saw to `artifacts/records/*.json`; pytest + pydantic checks schema, rules R2–R7 and cross-record links, and a guard suite proves each check rejects a deliberately broken record. | Decouples the two languages through a JSON contract instead of duplicating the UI flow. The same records feed both layers, so a mismatch found in Python points to a concrete test run. |
| **No fixed waits.** Web-first assertions, `waitForResponse`, `expect.poll` for values that settle (P/L, counts). The one exception is HN-06, which must wait a fixed 3 s to show that nothing appears after a rejected order. | Live prices move every tick; polling with a tolerance is stable, sleeps are not. |

### 3.3 Repository structure

```
.
├── ui-tests/                          # TypeScript + Playwright
│   ├── playwright.config.ts           # setup / live / mocked projects, workers: 1, reporters
│   ├── src/
│   │   ├── config/env.ts              # typed .env loading, fail fast
│   │   ├── pages/
│   │   │   ├── LoginPage.ts
│   │   │   ├── BasePage.ts            # shared helpers: scoped testids, typing that survives re-renders
│   │   │   ├── TradingPage.ts         # symbol search, selected symbol, account bar
│   │   │   ├── OrderPanel.ts          # Trade tab: type, volume, price, SL/TP, expiry
│   │   │   ├── OneClickPanel.ts       # One Click tab
│   │   │   ├── SettingsMenu.ts        # One-Click toggle + T&C
│   │   │   ├── NotificationPanel.ts
│   │   │   ├── assets/                # bottom tabs, rows located by Order No.
│   │   │   │   ├── OpenPositionsTab.ts
│   │   │   │   ├── PendingOrdersTab.ts
│   │   │   │   ├── PositionsHistoryTab.ts
│   │   │   │   ├── OrdersDealsTab.ts
│   │   │   │   └── DateRangeFilter.ts # history date presets
│   │   │   └── dialogs/               # OrderConfirmation, EditPosition, EditPendingOrder,
│   │   │                              # ClosePosition, DeleteOrder, BulkConfirm
│   │   ├── api/
│   │   │   ├── endpoints.ts           # URL patterns from exploration
│   │   │   ├── client.ts              # REST client reusing the app's auth header
│   │   │   ├── capture.ts             # waitForResponse wrappers → typed results
│   │   │   └── recorder.ts            # writes captured records for the Python layer
│   │   ├── domain/
│   │   │   ├── models.ts              # OpenPosition, PendingOrder, HistoryPosition, HistoryOrder, Deal, SymbolDetail, ...
│   │   │   ├── price.ts               # rounding to pointStep, offsets from Bid/Ask
│   │   │   └── rules.ts               # SL/TP side, pending side, volume step, P/L reconciliation
│   │   ├── flows/orders.ts            # multi-step user actions reused by specs (place, edit, close, bulk, wait)
│   │   ├── fixtures/
│   │   │   ├── auth.setup.ts
│   │   │   └── trading.fixture.ts     # page objects, oneClick state, tracked orders + cleanup
│   │   ├── data/instruments.ts        # symbol names and roles only
│   │   └── mocks/market.ts            # page.route helpers: patch real responses to a closed market, fake trade errors
│   └── tests/                         # 00 preflight + smoke, 01 … 08 one spec per area, 99 postflight, unit/
├── api-tests/                         # Python + pytest + pydantic
│   ├── pyproject.toml                 # pytest + ruff config
│   ├── src/aqx/
│   │   ├── models.py                  # pydantic models: the schema contract for each record kind
│   │   ├── records.py                 # loads record files, routes each key to its model, scrubs samples
│   │   └── rules.py                   # business rules (R2–R7, R26, R28) as functions returning violations
│   └── tests/
│       ├── fixtures/records/          # scrubbed sample records from a real run (no account IDs)
│       ├── test_record_schema.py      # every record matches its model; record keys keep their contract
│       ├── test_business_rules.py     # single-record rules for every record of a kind
│       ├── test_cross_record_consistency.py  # one trade agrees across its records; each trade response names its order
│       └── test_checks_reject_bad_records.py # each check rejects a record broken the way it guards against
├── docs/
│   ├── test-cases.md
│   └── assumptions.md
├── Makefile                           # make test: UI suite, then pytest on its records
└── .env.example
```

## 4. Setup and running

### Prerequisites
- Node.js 20+
- Python 3.11+
- An Aquariux demo account (register at https://www.aquariux.com/solutions/trader/)

### Configuration
```bash
cp .env.example .env
# fill in BASE_URL, DEMO_USERNAME, DEMO_PASSWORD
```
`.env` is git-ignored. No credentials are stored in this repository.

### One command for both layers
```bash
make setup         # once: Node deps, Chromium, Python venv
make test          # UI (unit + live + mocked), then pytest on the records that run produced
```
`make test` clears `artifacts/records/` first, so Python validates this run only. pytest still runs when some UI
tests fail (the records of the passing ones are checked), and the command fails if either layer failed.
Other targets: `make ui`, `make api`, `make api-samples` (committed samples, no login or network),
`make lint`, `make report`; `make help` lists them. `UI_ARGS` passes extra options to Playwright,
e.g. `make ui UI_ARGS="--grep @mocked"`.

### UI tests
```bash
cd ui-tests
npm ci
npx playwright install --with-deps chromium
npx playwright test                 # all tests
npx playwright test --grep @live    # real backend only
npx playwright test --grep @mocked  # runs even when the market is closed
npx playwright show-report
```

### API tests (data validation)
```bash
cd api-tests
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
pytest                                              # records of the last UI run, else the committed samples
AQX_RECORDS_DIR=tests/fixtures/records pytest       # committed samples only (no credentials, no network)
pytest --html=reports/report.html --self-contained-html
ruff check . && ruff format --check .
```
The UI tests write what they observed to `artifacts/records/<testId>.json`. pytest validates those files, so
run the UI suite first to check a fresh run; `python -m aqx.records` (with `PYTHONPATH=src`) refreshes the
committed samples from the last run, with account identifiers removed.

**Endpoints covered** (responses captured by the UI tests, validated in Python): place market / pending order,
modify position / pending order, close position, delete pending order, Bulk Close, Bulk Delete, a refused order
(4xx error envelope), open positions, pending orders, order counts, symbol detail, Positions History, Orders & Deals
and order notifications.

**Why records, not direct REST calls.** The backend accepts only an `Authorization: Bearer` token that the app
obtains in the browser (E7); it is not the token stored after login, and reproducing it outside the browser would
mean reverse-engineering the login flow. Validating the records the UI tests capture gives the same schema and
rule checks on real backend data, needs no credentials in Python, and ties every finding to a concrete UI test.

## 5. Assumptions and environment limitations

Summary below; details in [docs/assumptions.md](docs/assumptions.md).

- Tests target the demo environment only; results depend on its availability and on live market prices.
- Order-type rules (SL/TP placement, pending price direction, expiry options, volume min/step) were inferred from the platform. Where the UI did not reveal a rule, the industry-standard rule was assumed and marked as such.
- <!-- TODO: list instruments actually used, observed market hours, any features not available in the demo account -->
- <!-- TODO: note any flaky areas observed (e.g. price feed latency) and how the tests handle them -->

## 6. Done, not done, and next steps

### Done
<!-- TODO: fill at end commit -->

### Not done (and why)
<!-- TODO: fill at end commit, be explicit about trade-offs -->

### With more time I would
- Run the suite across Chromium, Firefox and WebKit
- Add visual regression checks for the order ticket and positions grid
- Call the trading API directly from Python once the token flow is understood, to add negative API tests the UI cannot reach
- Run the suite in CI (GitHub Actions) with a dedicated demo account per job; this delivery is a local demo
- Isolate test data per run using a dedicated demo account per worker

## 7. Git history

The repository starts with an `initial commit` and ends with an `end commit`, as requested. Intermediate commits show progress by functional area.
