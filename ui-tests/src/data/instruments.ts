/**
 * Symbols by role. Only names live here: digits, point step, lot limits and stop level
 * are read at run time from the platform (see TradingPage.selectSymbol).
 *
 * Only symbols with `tradableExeMode: true` accept orders from the web client; the others
 * keep the submit button on "STAY TUNED" even while their market is open.
 */
export const instruments = {
  /** Primary live symbol: live feed, 2 decimals, min/step 0.1 lot. */
  primary: 'XAUUSD',
  /** Extra tradable symbols for tests that need several positions on a netting account. */
  secondary: ['XAGUSD', 'XTIUSD'],
  /** Open market but not tradable from the web client (`tradableExeMode: false`). */
  notTradable: 'GBPJPY',
} as const;

/** Symbols with unreliable feeds on the demo server; never used by live tests. */
export const avoid = ['USDCAD', 'EURUSD', 'AUDJPY.Master', 'EURUSD.Master', 'EURUSD.USC'] as const;
