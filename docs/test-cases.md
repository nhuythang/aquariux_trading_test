# Test cases – Aquariux Web Trader

Status: **draft for review** (2026-11-04). The "Auto" column will be filled in as specs are written.

## 1. Scope analysis

The brief lists 7 functional areas. Exploration of the demo account (MT5 bridge, netting account) shaped how each one is tested.

| # | Brief | What the platform actually offers | Consequence for the tests |
| --- | --- | --- | --- |
| 1 | Market orders with SL/TP | Market Buy/Sell; SL/TP by **price** or **points**; confirmation dialog when One-Click is off | Enter SL/TP as **price** computed from live Bid/Ask (points are recomputed from the price at typing time). Verify on the position row **and** the API record. |
| 2 | One-Click Trading | Toggle in Settings; first enable needs T&C; adds a **One Click** tab with direct BUY/SELL buttons; no confirmation dialog | OCT state is per account, so a fixture sets it explicitly per test. Bulk Close still confirms even with OCT on. |
| 3 | Pending orders, types, expiry | **Limit, Stop, Stop Limit**; expiry **Good Till Canceled, Good Till Day, Specified Date, Specified Date and Time**; Fill Policy fixed to **Return** for pending | Prices placed far from market (e.g. ±2% for XAUUSD) so they never trigger. One case per type and per expiry option. |
| 4 | View / modify / partial close / close | Edit dialog (SL/TP), Close dialog with volume; partial close keeps the same Order No. | XAUUSD min/step = **0.1** lot, so the base position is 0.2 lot (partial = 0.1). |
| 5 | Bulk close / delete | Bulk Close: **All / Profitable / Loss**; Bulk Delete for pending; max 30 positions; `closedOrderIds` in response | **Netting account**: same symbol + side merges into one position → bulk tests open positions on **different symbols**. Profit/Loss variants depend on live prices → asserted against what the API returns, not a fixed expectation. |
| 6 | Transactions, notifications, history | Notifications: Position Created / Position Closed (30 days). History: **Positions History** (aggregated per position) and **Orders & Deals** (per order, with deals, states FILLED / CANCELED) | "Transactions" is mapped to **Orders & Deals** (deals = executions) plus the BALANCE row. Assumption documented. |
| 7 | Consistency across records | One ID (`clOrdId` = `orderId` = Order No. = `positionId`) links every view | Core cross-record test follows that ID from the API response through notification, positions, and both history tabs. |
| – | Market closure | Symbols report `status` (`TRADING`, `CLOSED`, `OFFQUOTES`); FX/metals trade Mon–Fri only | `@mocked` tests rewrite `symbol/detail` / `symbols/all` to `CLOSED` and the trade endpoint to an error; one `@live` check uses a symbol that is really closed if one exists at run time (skipped otherwise). |

### Instruments and test data

| Role | Symbol | Why |
| --- | --- | --- |
| Primary | **XAUUSD** | Live feed, 2 decimals, `stopsLevel` 0, min/step 0.1 lot |
| Second / third symbol (bulk, netting) | XAGUSD, XTIUSD | Live and tradable from the web (`tradableExeMode: true`); different symbols avoid netting |
| Not tradable from the web | GBPJPY | Market open but `tradableExeMode: false`: submit stays on "STAY TUNED" |
| Market closed (live, optional) | first symbol with `status: CLOSED` at run time (AUDCAD at exploration) | Real closed-market behaviour |
| Avoid | USDCAD (frozen feed), EURUSD ("test" symbol), `*.Master` | Unreliable prices |

Specs (digits, `pointStep`, min/step/max lot, `stopsLevel`, order types, expiry types) are **read at run time** from `GET /api/market/v1/symbol/detail` by intercepting the app's own request — nothing is hard-coded.

### Business rules used as oracles

Rules marked *(assumed)* are not stated by the platform and are listed in `docs/assumptions.md`.

- R1 Buy opens at Ask, Sell at Bid (within slippage tolerance). *(assumed, MT5 convention)*
- R2 Buy: SL < entry < TP. Sell: TP < entry < SL. *(assumed; platform enforcement to be observed in MO-03/04)*
- R3 Buy Limit < Ask, Buy Stop > Ask, Sell Limit > Bid, Sell Stop < Bid. *(assumed, MT5 convention)*
- R4 Volume: min ≤ v ≤ max and v is a multiple of step (from symbol detail).
- R5 Partial close: 0 < closed < open volume, step-aligned; remaining volume = open − closed; Order No. unchanged.
- R6 Position P/L in Positions History = sum of closing deal profits in Orders & Deals.
- R7 A cancelled pending order appears in Orders & Deals with state CANCELED and no deal.
- R8 Netting: same-symbol same-side orders merge into one position. *(observed: account type NET; merge behaviour to confirm)*

## 2. Test cases

Priority: **P1** must have (core of the brief), **P2** should have, **P3** nice to have.
Layer: **UI** = Playwright E2E, **API** = Python validation, **M** = mocked (`@mocked`).

### Scope 1 – Market orders with SL/TP

| ID | Scenario | Type | Pri | Layer | Expected |
| --- | --- | --- | --- | --- | --- |
| MO-01 | Buy XAUUSD 0.2 lot with SL below / TP above entry | Positive | P1 | UI | Position row and API record: symbol, BUY, 0.2 lot, SL, TP match input; entry ≈ Ask at submit |
| MO-02 | Sell XAUUSD 0.2 lot with SL above / TP below entry | Positive | P1 | UI | Same checks for SELL; entry ≈ Bid |
| MO-03 | Buy with SL above current price (wrong side) | Negative | P1 | UI | Inline message shown; no confirmation step; no trade request |
| MO-04 | Sell with TP above current price (wrong side) | Negative | P2 | UI | As MO-03 |
| MO-05 | Volume below min (0.05) → message, no confirmation, no request (05a); not step-aligned (0.15) → rounded to the step on blur (05b) | Boundary | P2 | UI | See R11, R12 |
| MO-06 | Market order without SL/TP | Positive | P3 | UI | Position with empty SL/TP (`0` in API, `--` in UI) |
| MO-07 | Confirmation dialog shows the same values as the form; Cancel places nothing | Positive | P2 | UI | Dialog symbol/side/volume/SL/TP = form; after Cancel, counts unchanged |

### Scope 2 – One-Click Trading

| ID | Scenario | Type | Pri | Layer | Expected |
| --- | --- | --- | --- | --- | --- |
| OC-01 | OCT on → One Click BUY | Positive | P1 | UI | POST market sent with no confirmation dialog; BUY position with chosen volume |
| OC-02 | OCT on → One Click SELL | Positive | P1 | UI | As OC-01 for SELL |
| OC-03 | OCT off → Place order shows confirmation dialog; One Click tab absent | Positive | P2 | UI | Dialog visible; `tab-one-click-trading` not present |
| OC-04 | OCT setting persists after reload | Positive | P3 | UI | Toggle and One Click tab still present after reload |

### Scope 3 – Pending orders

| ID | Scenario | Type | Pri | Layer | Expected |
| --- | --- | --- | --- | --- | --- |
| PO-01 | Buy Limit below Ask, GTC | Positive | P1 | UI | Pending row + API: type BUY LIMIT, price, volume, expiry Good Till Canceled |
| PO-02 | Sell Limit above Bid, GTC | Positive | P1 | UI | As PO-01 |
| PO-03 | Buy Stop above Ask | Positive | P2 | UI | Type BUY STOP |
| PO-04 | Sell Stop below Bid | Positive | P2 | UI | Type SELL STOP |
| PO-05 | Buy Stop Limit (stop + limit price) | Positive | P3 | UI | Type BUY STOP LIMIT; API `price` = stop, `priceTrigger` = limit; confirmation shows both (grid shows only the stop price) |
| PO-06 | Buy Limit above Ask (wrong side) | Negative | P1 | UI | Backend rejects: HTTP 400 `MT4_1009` "Metatrader Invalid Price"; pending list unchanged (the panel itself does not block it) |
| PO-07 | Expiry Good Till Day (07a) and Specified Date (07b) | Positive | P2 | UI | `tradeExpiry` GTD / SPECIFIED_DAY; expiry and expiry date shown as chosen |
| PO-08 | Specified Date in the past | Negative | P2 | UI | Past days disabled in the calendar |
| PO-09 | Modify pending price and SL/TP | Positive | P2 | UI | New values in row and API |
| PO-10 | Delete pending order | Positive | P1 | UI | Removed from Pending; Orders & Deals shows CANCELED |

### Scope 4 – Position management

| ID | Scenario | Type | Pri | Layer | Expected |
| --- | --- | --- | --- | --- | --- |
| PM-01 | View open position: every column matches the API record | Positive | P1 | UI | Symbol, side, volume, units, entry, SL, TP, P/L sign consistent |
| PM-02 | Modify SL/TP | Positive | P1 | UI | Row and API updated; Order No. unchanged |
| PM-03 | Modify SL to wrong side | Negative | P2 | UI | Inline message; no confirmation and no request; old SL kept |
| PM-04 | Partial close 0.1 of 0.2 | Positive | P1 | UI | Remaining 0.1, same Order No.; a SELL 0.1 FILLED order in Orders & Deals |
| PM-05 | Partial close volume > position or below min | Boundary | P2 | UI | Confirm disabled; volume unchanged |
| PM-06 | Full close | Positive | P1 | UI | Removed from Open Positions; in Positions History with close price and P/L |

### Scope 5 – Bulk operations

| ID | Scenario | Type | Pri | Layer | Expected |
| --- | --- | --- | --- | --- | --- |
| BO-01 | Open 3 positions on 3 symbols → Bulk Close All | Positive | P1 | UI | `closedOrderIds` = the 3 IDs; Open Positions empty; 3 entries in history |
| BO-02 | Create 3 pending orders → Bulk Delete | Positive | P1 | UI | Pending empty; 3 CANCELED in Orders & Deals |
| BO-03 | Bulk Close Profitable / Loss | Positive | P3 | UI | Closed IDs ⊆ positions in loss just before the click; none left that were in loss before and after |
| BO-04 | Bulk Close with no positions | Negative | P3 | UI | Menu opens empty; no dialog, no request |
| BO-05 | Bulk Close confirmation Cancel | Negative | P3 | UI | Nothing closed |

### Scope 6 – History, transactions, notifications

| ID | Scenario | Type | Pri | Layer | Expected |
| --- | --- | --- | --- | --- | --- |
| HN-01 | Open position → notification "Position Created" | Positive | P1 | UI | Symbol, Order No., side, volume, price match |
| HN-02 | Close position → "Position Closed" with P/L | Positive | P1 | UI | Volume, price, P/L match the deal |
| HN-03 | Positions History row after close | Positive | P1 | UI | Open/close dates, entry/close price, SL/TP, P/L |
| HN-04 | Orders & Deals lists every order with state and deals | Positive | P2 | UI | FILLED/CANCELED, volume filled/total |
| HN-05 | History date filter | Positive | P3 | UI | Rows outside range hidden |
| HN-06 | Rejected order produces no FILLED record | Negative | P2 | UI | No new order in history |

### Scope 7 – Cross-record consistency

| ID | Scenario | Type | Pri | Layer | Expected |
| --- | --- | --- | --- | --- | --- |
| CR-01 | Trace one order ID: POST response → open position → notification → Positions History → Orders & Deals | Positive | P1 | UI | Symbol, side, volume, entry, SL, TP equal everywhere |
| CR-02 | Partial close reconciliation | Positive | P2 | UI + API | Closed + remaining = original; deal profits sum = position P/L (R6) |
| CR-03 | Cancelled pending: Pending list ↔ Orders & Deals | Positive | P2 | UI | Same ID, price, volume; state CANCELED |
| CR-04 | Record schema and business-rule validation of captured records | Positive | P1 | API | All records match pydantic models; R2–R7 hold |

### Scope 8 – Market closed

| ID | Scenario | Type | Pri | Layer | Expected |
| --- | --- | --- | --- | --- | --- |
| MC-01 | Symbol mocked as CLOSED | Negative | P2 | M | Order buttons disabled or clear message; no trade request sent |
| MC-02 | Trade endpoint mocked to return a market-closed error | Negative | P2 | M | Error message shown; no position added |
| MC-03 | Pending order on a closed market (if allowed) | Positive | P3 | M | Pending created or rejected, as the UI indicates |
| MC-04 | Real closed symbol at run time | Negative | P3 | UI | As MC-01; skipped when no symbol is closed |

### Account guards (not counted below)

| ID | Title | Expected |
| --- | --- | --- |
| AC-00 | First spec of a full run: the demo account has no open positions or pending orders | Empty; otherwise the leftovers are listed by ID (never closed automatically) |
| AC-99 | Last spec of a full run: the suite left the account empty | Empty; otherwise the leftovers are listed by ID |

## 3. Out of scope

- Mobile apps, other browsers (Chromium only)
- Stop Limit edge cases beyond PO-05, trailing stops, price ladder, chart trading
- Copy Trade, Signals, News, Calendar
- Performance and security testing

## 4. Summary

| Priority | Count |
| --- | --- |
| P1 | 20 |
| P2 | 17 |
| P3 | 9 |
| Total | 46 |
