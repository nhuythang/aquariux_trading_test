# Aquariux Web Trader – QA Automation Assessment

Automated end-to-end and API-level tests for the **Aquariux Web Trader** demo platform, built as a 2-day technical assessment.

- **UI E2E tests:** TypeScript + Playwright (Page Object Model)
- **API / data validation tests:** Python + pytest
- **Platform in scope:** Web Trader only (desktop browser)

> Status: <!-- TODO: update at end commit, e.g. "XX UI tests, YY API tests, all passing on 2026-11-05" -->

---

## 1. How I interpreted the requirements

The hiring team asked me to complete the test according to my own understanding. These are the decisions I made and why.

| Area | Decision | Rationale |
| --- | --- | --- |
| Platform | Web Trader only | Mobile apps are out of scope for a 2-day exercise; the web client covers every functional area in the brief. |
| Languages | TypeScript + Playwright for UI E2E; Python + pytest for API / data validation | Shows both languages, each used where it is strongest. Playwright TS is the primary layer and covers all 7 functional areas. |
| Instruments | XAUUSD (gold) for live tests; GBPJPY as FX fallback; a symbol reported `CLOSED` (e.g. AUDCAD) for market-closed behaviour | The demo account offers only Forex and Commodities (no crypto). XAUUSD is liquid with a live feed and 2-decimal prices. Instruments trade Mon–Fri only, so live tests must run on weekdays. |
| Market closure | Network mocking with `page.route`; tests tagged `@live` or `@mocked` | Keeps tests deterministic and runnable at any time, and makes it explicit which tests hit the real backend. |
| Business rules | Derived from observed platform behaviour plus industry conventions (MT4/MT5-style) | No specification was provided. Every assumed rule is listed in [docs/assumptions.md](docs/assumptions.md). |
| Account | One demo account with virtual funds | Tests run serially (`workers: 1`) because all tests share one account state. |

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
| – | Market-closed behaviour (mocked) | `ui-tests/tests/08-market-closed.spec.ts` | `@mocked` |
| – | API / data validation | `api-tests/tests/` | – |

Full test case list with IDs, priorities and expected results: [docs/test-cases.md](docs/test-cases.md).

## 3. Framework design

- **Page Object Model.** One class per screen area (login, order panel, positions, pending orders, history, notifications). Tests contain intent and assertions only; selectors live in page objects.
- **Login once.** A Playwright setup project logs in and saves `storageState`; all specs reuse it.
- **No hard-coded prices.** Tests read the current Bid/Ask and compute SL, TP and pending prices as offsets, rounded to the instrument's tick size.
- **Order ID from the network.** Each order action captures the backend response (`page.waitForResponse`) to get the order/position ID. That ID is then used to locate and verify the record in every view.
- **Independent tests.** Each test creates its own data and cleans up (closes positions, deletes pending orders) in teardown.
- **Serial execution.** One shared demo account means bulk operations would interfere with parallel tests, so `workers: 1`.
- **Reports.** Playwright HTML report with traces/screenshots on failure; pytest HTML report for API tests.

```
.
├── ui-tests/                 # TypeScript + Playwright
│   ├── playwright.config.ts
│   ├── src/
│   │   ├── pages/            # Page objects
│   │   ├── fixtures/         # Auth setup, trading fixtures, cleanup
│   │   ├── utils/            # Price maths, order capture, waits
│   │   ├── data/             # Instruments and test data
│   │   └── mocks/            # Mocked responses for @mocked tests
│   └── tests/                # Spec files, one per functional area
├── api-tests/                # Python + pytest
│   ├── src/                  # API client, models (pydantic)
│   ├── tests/
│   └── conftest.py
├── docs/
│   ├── test-cases.md
│   └── assumptions.md
├── .github/workflows/ci.yml
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

### API tests
```bash
cd api-tests
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
pytest -v
```

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
- Add contract tests for the trading API responses
- Isolate test data per run using a dedicated demo account per CI job

## 7. Git history

The repository starts with an `initial commit` and ends with an `end commit`, as requested. Intermediate commits show progress by functional area.
