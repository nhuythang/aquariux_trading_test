import { expect, test } from '@src/fixtures/trading.fixture';

/**
 * Runs last (files run in name order, one worker): proves the suite as a whole left the shared
 * demo account as it found it. Reports leftovers by ID; it does not close them.
 */
test('AC-99 account has no open positions or pending orders after the run @live', async ({ trading, api }) => {
  await trading.selectedSymbol.waitFor();
  const [positions, pending] = await Promise.all([api.openPositions(), api.pendingOrders()]);
  expect(
    {
      positions: positions.map((p) => `${p.orderId} ${p.symbol} ${p.lotSize}`),
      pending: pending.map((o) => `${o.orderId} ${o.symbol} ${o.lotSize}`),
    },
    'orders left on the demo account after the run',
  ).toEqual({ positions: [], pending: [] });
});
