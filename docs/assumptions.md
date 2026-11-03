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

## 3. Interpretation of the brief

| # | Brief wording | Interpretation | Reason |
| --- | --- | --- | --- |
| I1 | "Trading transactions" | The **Orders & Deals** tab (orders with their executions) plus the BALANCE entry in Positions History | The platform has no separate "transactions" screen; deals are the transaction records. |
| I2 | "Order notifications" | The notification panel, **Positions** tab: "Position Created" / "Position Closed" | These are the order-related notifications the platform produces. SL/TP changes and pending orders produced none during exploration. |
| I3 | "Supported order types and expiry options" | The lists the platform returns per symbol (`orderTypes`, `expirationTypes`) and shows in the UI | Coverage follows what the platform declares, not a generic list. |
| I4 | "Bulk close or delete" | Bulk Close (All / Profitable / Loss) on positions, Bulk Delete on pending orders | Both exist in the UI. |
| I5 | "If market close…" | Mocked tests for closed-market behaviour that run at any time, plus one live check skipped when no symbol is closed | Keeps the suite runnable at weekends and in CI. |

## 4. Known limitations

- `@live` results depend on demo-server availability and market hours (E3).
- Profitable / Loss bulk close depends on live P/L at click time, so the expected set is read from the API just before the action.
- Rules marked *Assumed* may differ from the platform's real behaviour. Where a test observes something different, the test records the actual behaviour and this file is updated.
