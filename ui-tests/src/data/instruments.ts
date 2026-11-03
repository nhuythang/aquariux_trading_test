/**
 * Symbols by role. Only names live here: digits, point step, lot limits and stop level
 * are read at run time from the platform (see TradingPage.selectSymbol).
 */
export const instruments = {
  /** Primary live symbol: live feed, 2 decimals, min/step 0.1 lot. */
  primary: 'XAUUSD',
  /** Extra symbols for tests that need several positions on a netting account. */
  secondary: ['XAGUSD', 'GBPJPY'],
} as const;

/** Symbols with unreliable feeds on the demo server; never used by live tests. */
export const avoid = ['USDCAD', 'EURUSD', 'AUDJPY.Master', 'EURUSD.Master', 'EURUSD.USC'] as const;
