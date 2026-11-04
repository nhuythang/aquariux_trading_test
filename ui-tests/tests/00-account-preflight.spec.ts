import { expect, test } from '@src/fixtures/trading.fixture';

/**
 * Runs first (files run in name order, one worker). Every test cleans up after itself, but a run that
 * was killed (Ctrl+C, crash) skips teardown. This check names any leftover so it is closed by hand
 * before the suite trusts the account; it never closes anything itself, since it cannot know who owns it.
 */
test('AC-00 account has no open positions or pending orders before the run @live', async ({ trading, api }) => {
  await trading.selectedSymbol.waitFor();
  const [positions, pending] = await Promise.all([api.openPositions(), api.pendingOrders()]);
  expect(
    {
      positions: positions.map((p) => `${p.orderId} ${p.symbol} ${p.lotSize}`),
      pending: pending.map((o) => `${o.orderId} ${o.symbol} ${o.lotSize}`),
    },
    'orders left on the demo account before the run; close them before running the suite',
  ).toEqual({ positions: [], pending: [] });
});
