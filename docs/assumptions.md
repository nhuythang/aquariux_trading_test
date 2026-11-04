# Assumptions and environment limitations

No functional specification was provided. This file lists what the tests rely on, where each rule comes from, and what limits the test environment.

Source key: **Observed** = seen on the demo platform (UI or its own API responses) during exploration on 2026-11-03/04. **Assumed** = industry convention (MetaTrader 5 style), not confirmed by the platform.

## 1. Environment

| # | Item | Source | Detail |
| --- | --- | --- | --- |
| E1 | Target | Observed | Demo Web Trader at `https://aqxtrader.aquariux.com/web`, one demo account with $1,000,000 virtual funds. Backend is an MT5 bridge (`/api/auth/v2/metatrader5/demo/login`). |
| E2 | Instruments | Observed | The account offers **Forex and Commodities only** (`symbol/category` → `FOREX`, `COM`). No crypto, so nothing trades 24/7. |
| E3 | Trading hours | Observed | XAUUSD: Mon–Fri 01:00–24:00 server time; FX pairs Mon–Fri 00:00–24:00. `@live` tests must run on a weekday inside these hours. |
| E4 | Symbol quality | Observed | Some symbols are unusable for live tests: USDCAD (frozen feed, bid = ask), `*.Master` (OFFQUOTES), EURUSD (described as "test"). |
| E5 | Account type | Observed | Netting account (`horizonAccountType: "NET"`). |
| E6 | Shared state | Observed | One account for all tests; One-Click Trading is a per-account setting that persists. Tests run serially and set the state they need. |
| E7 | API access | Observed | The app authenticates every `/api/` call with `Authorization: Bearer <jwt>` (not the value stored in `localStorage.token`). Calls without that header return 401. The UI suite reuses the header from the app's own traffic for setup, cleanup and data reads. |
| E8 | Network | Observed | Some ISP DNS resolvers (seen on VNPT) do not resolve `*.aquariux.com`. Using a public resolver (8.8.8.8 / 1.1.1.1) fixes it. |
| E9 | Live prices | Observed | Prices move every tick. Entry-price checks use a tolerance (spread plus a small slippage margin), never exact equality with the price seen before submit. |
| E10 | Web-tradable symbols | Observed | Only symbols with `tradableExeMode: true` accept orders from the web client (e.g. XAUUSD, XAGUSD, XTIUSD, UKOIL, several FX pairs). Others, such as GBPJPY, show an open market but keep the submit button on "STAY TUNED". |

## 2. Business rules

| # | Rule | Source | Used in |
| --- | --- | --- | --- |
| R1 | Buy opens at Ask, Sell at Bid (within tolerance, E9). | Assumed | MO-01, MO-02 |
| R2 | Buy: SL < entry < TP. Sell: TP < entry < SL. The platform should reject the wrong side. | Assumed (rejection behaviour to be observed) | MO-03, MO-04, PM-03 |
| R3 | Buy Limit < Ask, Buy Stop > Ask, Sell Limit > Bid, Sell Stop < Bid. | Assumed | PO-01…PO-06 |
| R4 | Volume must satisfy min ≤ v ≤ max and be a multiple of the step. XAUUSD: min 0.1, step 0.1, max 100. | Observed (`symbol/detail`) | MO-05, PM-05 |
| R5 | Partial close: 0 < closed < open volume, step-aligned. The remainder stays open with the same Order No. | Observed | PM-04, CR-02 |
| R6 | Position P/L in Positions History = sum of the closing deals' profit in Orders & Deals. | Observed (−2.20 + −3.10 = −5.30) | CR-02, CR-04 |
| R7 | A deleted pending order appears in Orders & Deals as CANCELED with no deals. | Observed | PO-10, CR-03 |
| R8 | On the netting account, a same-symbol same-side order merges into the existing position. | Assumed from E5 (to confirm) | BO-01 design |
| R9 | Minimum SL/TP distance = `stopsLevel` points (XAUUSD: 0, GBPJPY: 80). | Observed (`symbol/detail`) | Price offsets |
| R10 | Pending orders use Fill Policy **Return**; market orders default to **Fill or Kill**. | Observed | Order panel defaults |
| R11 | Invalid SL/TP or volume shows an inline message ("Stop Loss must be less than Sell Price.", "Minimum volume is 0.1."). The submit button is **not** disabled, so the tests check that the order cannot reach the confirmation step and that no trade request is sent. | Observed | MO-03, MO-04, MO-05a |
| R12 | The volume input rounds a value that is not a multiple of the step when it loses focus (0.15 → 0.1). | Observed | MO-05b |
| R13 | All pending types (Limit, Stop, Stop Limit) are placed with `POST /api/trade/trade/v1/limit` and modified with `PATCH` on the same path; `orderType` tells them apart (2 buy limit, 3 sell limit, 4 buy stop, 5 sell stop, 8 buy stop limit). | Observed | PO-01…05, PO-09 |
| R14 | The panel does not check the side of a pending price: a Buy Limit above the Ask reaches the confirmation and the backend rejects it with HTTP 400, code `MT4_1009` "Metatrader Invalid Price". | Observed | PO-06 |
| R15 | Stop Limit: the form's "Price" is the stop (trigger) price and "Stop Limit Price" is the limit price, sent as `priceTrigger`. The Pending Orders grid shows only the stop price. | Observed | PO-05 |
| R16 | Expiry types: Good Till Canceled → `GTC`, Good Till Day → `GTD`, Specified Date → `SPECIFIED_DAY` (with an `expiration` timestamp). Past days are disabled in the calendar. | Observed | PO-07, PO-08 |
| R17 | Edit Position: a Stop Loss on the wrong side shows the inline message ("Stop Loss must be less than Sell Price." for a BUY). Update Position stays enabled but clicking it does nothing: no confirmation, no request. | Observed | PM-03 |
| R18 | Close Position: Confirm is disabled when the close volume is larger than the position. | Observed | PM-05 |
| R19 | Bulk Delete menu: All Orders / Limit Orders / Stop Orders / Stop Limit Orders (empty categories greyed out). It sends `PUT /api/trade/trade/v1/limit/bulk` with `[{orderId, symbol}]` and returns `deletedOrderIds`; the orders appear as CANCELED in Orders & Deals. | Observed | BO-02 |
| R20 | Bulk Close: the client builds the list (`PUT /api/trade/trade/v1/bulk`, `orderList`) from its own price feed. When none of the sent positions still qualifies, the backend answers HTTP 400 `MT5_1002` "No orders are closed". With no open positions the menu opens empty: no dialog, no request. | Observed | BO-03, BO-04 |
| R21 | The account is **netting**: a second order on the same symbol changes the existing position, so tests that need several positions use different symbols. | Observed | BO-01, BO-03 |
| R22 | Order notifications (`GET /api/notification/v2?notificationType=ORDER`, newest first): `NT_ORDER_CREATE` / `NT_ORDER_CLOSE`; `metadata.orderId` is the position's Order No. and `metadata.profit` of a close equals the Positions History `profit`. The bell shows "Position Created" / "Position Closed" with symbol, Order No., side, volume and price. | Observed | HN-01, HN-02, CR-01 |
| R23 | Orders & Deals prints the order type in title case ("Buy", "Sell", "Buy Limit") and the volume as "ordered / filled" ("0.1 / 0.1" filled, "0.1 / 0" cancelled). Positions History prints the side in upper case ("BUY"). | Observed | HN-04 |
| R24 | History date filter: presets All / Last 7 days / Last 30 days / Last 90 days / This year / Last year / Custom. Applying one re-sends the history request with epoch-ms `from` / `to`; the default is about the last 30 days. The choice is stored in the browser's local storage, not on the server. | Observed | HN-05 |
| R25 | A request rejected by the backend (HTTP 400) creates no order, deal, pending order or notification. | Observed | HN-06 |
| R26 | A closed symbol (backend: `status: CLOSED`, `tradable: false`, `online: false`, `closable: false`, `holiday: true`; seen on USDJPY) locks the whole order panel: an overlay reads "This symbol is currently restricted for trading.", the submit button reads "Market Closed" and is disabled, and the order type cannot be changed, so neither market nor pending orders can be placed. | Observed | MC-01, MC-03, MC-04 |
| R27 | A trade request refused by the backend is reported in a toast (`notification-box-description`) with the backend's message; no dialog. | Observed (with a mocked 400) | MC-02 |
| R28 | Trade responses are `{clOrdId, positionId, positionReference, traceId}`. Placing a pending order returns the new Order No. in `clOrdId` and `"0"` as position; modify, close and delete return the Order No. they acted on in all three ids. Bulk Delete returns `deletedOrderIds`, Bulk Close `closedOrderIds`; a closing order gets its own, later Order No. | Observed | CR-04 |

## 3. Interpretation of the brief

| # | Brief wording | Interpretation | Reason |
| --- | --- | --- | --- |
| I1 | "Trading transactions" | The **Orders & Deals** tab (orders with their executions) plus the BALANCE entry in Positions History | The platform has no separate "transactions" screen; deals are the transaction records. |
| I2 | "Order notifications" | The notification panel, **Positions** tab: "Position Created" / "Position Closed" | These are the order-related notifications the platform produces. SL/TP changes and pending orders produced none during exploration. |
| I3 | "Supported order types and expiry options" | The lists the platform returns per symbol (`orderTypes`, `expirationTypes`) and shows in the UI | Coverage follows what the platform declares, not a generic list. |
| I4 | "Bulk close or delete" | Bulk Close (All / Profitable / Loss) on positions, Bulk Delete on pending orders | Both exist in the UI. |
| I5 | "If market close…" | Mocked tests for closed-market behaviour that run at any time, plus one live check skipped when no symbol is closed | Keeps the suite runnable at weekends and in CI. |

## 4. Known limitations

- After every trade the app refetches the order lists for about 1.5 s; a refetch can reset or close an open Edit Order / Edit Position dialog or swallow a click on the Close Position Confirm. The edit flow retries until the Order Confirmation shows the entered values (observed as a usability issue: slow typing can lose edits).

- `@live` results depend on demo-server availability and market hours (E3).
- Profitable / Loss bulk close depends on live P/L at click time, so BO-03 takes an API snapshot right before and right after the click and asserts the closed IDs are a subset of the positions in loss before, and that nothing in loss both before and after is left open. Positions History `profit` is the realised P/L, not the P/L at click time.
- Close Position retries typing and Confirm only until the close request has been sent, so a partial close is never submitted twice; teardown dismisses a leftover close dialog before cleaning up.
- Cleanup (`created` fixture): flows register each order from its trade response; teardown also adopts any position or pending order that appeared during the test without being registered (snapshot of the account before the test vs after), which covers a timed-out response or a pending order filling into a position. This relies on one test at a time on the account (`workers: 1`) and on nobody trading on it by hand during a run.
- History checks look only at records created after the test (or after its position) opened, and find closing orders by symbol, side and time: closing orders get their own Order No., so time is what separates them from earlier tests' closes on the same symbol.
- Notification messages print prices without trailing zeros ("@ 4,040.5" for 4040.50) while the bell shows fixed decimals; the Python check compares the message price as a number.
- Observed oddities, reported rather than asserted: `NT_ORDER_CLOSE` notifications carry `metadata.openTime = -7200000`; the Orders & Deals volume cell has no label saying which number is ordered and which filled; order-type casing differs between Positions History and Orders & Deals.
- Market-closed tests mock only `symbol/detail` and `symbols/all` (real responses with the closed flags patched in); that is enough for the UI to show the closed state. MC-02's error is answered in the browser, so the order never reaches the backend; the cleanup fixture stays on as a safety net. MC-04 runs against a really closed symbol and is skipped when none is closed.
- `@mocked` tests still load the real app with the saved session; only the listed responses are replaced.
- The demo server is sometimes slow to list a new order (once more than 15 s after the trade response), so the wait for a new position or pending order allows 30 s.
- The Python layer validates records captured by the UI tests instead of calling the REST API itself (E7: the Bearer token is issued in the browser). Committed samples in `api-tests/tests/fixtures/records` come from a real run with `account`, `metatraderId` and `tenantId` removed.
- Observed in the records, not asserted as a rule: after a partial close, Positions History `realizedProfitLoss` holds only the last closing deal's profit, while `profit` is the full P/L (R6 uses `profit`); history `volume` is not lots × contract size (2000 for 0.2 lot of XAUUSD), so checks use `lotSize` and `units`.
- A killed run (Ctrl+C, crash) can skip teardown. `AC-00` (first spec) reports leftovers before the suite relies on the account and `AC-99` (last spec) proves the run left it empty; both only report by ID and never close orders they did not create. Running a single spec skips them, so they matter for full runs.
- The repository sits in an iCloud-synced folder on the author's machine; iCloud occasionally evicts `node_modules` files or returns an empty read of `.auth/demo-user.json`. These are local-environment flakes (fixed by `npm ci` / a rerun), not product behaviour.
- Rules marked *Assumed* may differ from the platform's real behaviour. Where a test observes something different, the test records the actual behaviour and this file is updated.
