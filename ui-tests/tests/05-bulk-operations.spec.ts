import { expect, test } from '@src/fixtures/trading.fixture';
import { requestsDuring } from '@src/api/capture';
import { instruments } from '@src/data/instruments';
import { ORDER_STATE, type Side } from '@src/domain/models';
import { offsetPercent } from '@src/domain/price';
import {
  bulkClose,
  bulkCloseBracketed,
  bulkDeletePending,
  placeOrder,
  waitForPending,
  waitForPosition,
  type FlowContext,
} from '@src/flows/orders';
import type { TradingPage } from '@src/pages/TradingPage';

/**
 * Bulk actions act on the whole account, so every test starts from an empty account
 * and opens its positions on different symbols (the account is netting: same symbol and
 * side would merge into one position).
 */
const symbols = [instruments.primary, ...instruments.secondary];

async function openPositions(
  ctx: FlowContext & { trading: TradingPage },
  legs: ReadonlyArray<{ symbol: string; side: Side }>,
): Promise<string[]> {
  const ids: string[] = [];
  for (const leg of legs) {
    const spec = await ctx.trading.selectSymbol(leg.symbol);
    const placed = await placeOrder(ctx, leg.symbol, {
      side: leg.side,
      type: 'Market',
      volume: spec.minContractLotSize,
    });
    await waitForPosition(ctx.api, placed.orderId);
    ids.push(placed.orderId);
  }
  return ids;
}

test.describe('Scope 5 – bulk close and bulk delete', () => {
  test.use({ oneClick: false });

  test.beforeEach(async ({ trading, api }) => {
    await trading.selectedSymbol.waitFor();
    expect(await api.counts(), 'bulk tests need an empty account').toEqual({
      marketOrderCounts: 0,
      pendingOrderCounts: 0,
    });
  });

  test('BO-01 Bulk Close "All Positions" closes every open position @live', async ({
    page,
    trading,
    orderPanel,
    dialogs,
    api,
    created,
    assets,
    recorder,
  }) => {
    const ids = await openPositions(
      { page, trading, orderPanel, dialogs, api, created },
      symbols.map((symbol) => ({ symbol, side: 'BUY' as const })),
    );

    const result = await bulkClose({ page, dialogs, openPositions: assets.openPositions }, 'All Positions');
    recorder.add('bulkClose', result);
    expect(result.closedOrderIds.map(String).sort()).toEqual([...ids].sort());

    await expect.poll(async () => (await api.openPositions()).length).toBe(0);
    await expect(assets.openPositions.rows).toHaveCount(0);

    const from = Date.now() - 24 * 3_600_000;
    const history = await api.positionsHistory(from, Date.now() + 3_600_000);
    expect(ids.every((id) => history.some((h) => h.positionId === id && h.status === 'CLOSED'))).toBe(true);
  });

  test('BO-02 Bulk Delete removes every pending order and records them as cancelled @live', async ({
    page,
    trading,
    orderPanel,
    dialogs,
    api,
    created,
    assets,
    recorder,
  }) => {
    const spec = await trading.selectSymbol(instruments.primary);
    await orderPanel.open();
    const quote = await orderPanel.quote();
    const ids: string[] = [];
    for (const percent of [-2, -2.5, -3]) {
      const placed = await placeOrder({ page, orderPanel, dialogs, api, created }, spec.symbol, {
        side: 'BUY',
        type: 'Limit',
        volume: spec.minContractLotSize,
        price: offsetPercent(quote.ask, percent, spec),
      });
      await waitForPending(api, placed.orderId);
      ids.push(placed.orderId);
    }

    const result = await bulkDeletePending({ page, dialogs, pendingOrders: assets.pendingOrders });
    expect(result.deletedOrderIds.map(String).sort()).toEqual([...ids].sort());

    await expect.poll(async () => (await api.pendingOrders()).length).toBe(0);
    await expect(assets.pendingOrders.rows).toHaveCount(0);

    const from = Date.now() - 24 * 3_600_000;
    const states = async () =>
      (await api.ordersAndDeals(from, Date.now() + 3_600_000))
        .filter((o) => ids.includes(o.orderId))
        .map((o) => o.state);
    await expect.poll(states).toEqual(ids.map(() => ORDER_STATE.CANCELED));
    recorder.add('cancelledIds', ids);
  });

  test('BO-03 Bulk Close "Loss Positions" closes only positions in loss @live', async ({
    page,
    trading,
    orderPanel,
    dialogs,
    api,
    created,
    assets,
    recorder,
  }) => {
    const ids = await openPositions({ page, trading, orderPanel, dialogs, api, created }, [
      { symbol: instruments.primary, side: 'BUY' },
      { symbol: instruments.secondary[0], side: 'SELL' },
    ]);
    // The spread puts a fresh position in loss, but live P/L can flip; wait for at least one in loss.
    await expect.poll(async () => (await api.openPositions()).some((p) => p.profit < 0)).toBe(true);

    // P/L moves with every tick, so the check brackets the click: every closed position was in loss right
    // before it, and none that was in loss both right before and right after the click may be left open.
    const { before, result, after } = await bulkCloseBracketed(
      { page, dialogs, api, openPositions: assets.openPositions },
      'Loss Positions',
    );
    recorder.add('bulkClose', { before, result, after });

    const closed = result.closedOrderIds.map(String);
    expect(closed.length, 'something was closed').toBeGreaterThan(0);
    expect(ids).toEqual(expect.arrayContaining(closed));
    const losingBefore = before.filter((p) => p.profit < 0).map((p) => p.orderId);
    expect(losingBefore).toEqual(expect.arrayContaining(closed));

    const stillLosing = after
      .filter((p) => p.profit < 0 && before.some((b) => b.orderId === p.orderId && b.profit < 0))
      .map((p) => p.orderId);
    expect(stillLosing, 'positions in loss were left open').toEqual([]);
  });

  test('BO-04 Bulk Close with no open positions offers nothing to close @live', async ({ page, dialogs, assets }) => {
    await assets.openPositions.open();
    const sent = await requestsDuring(page, 'bulkClose', async () => {
      await assets.openPositions.bulkClose.click();
      await expect(assets.openPositions.bulkCloseOption('All Positions')).toBeHidden();
      await expect(dialogs.bulk.root).toBeHidden();
    });
    expect(sent, 'no bulk request for an empty list').toBe(0);
  });

  test('BO-05 cancelling the Bulk Close confirmation closes nothing @live', async ({
    page,
    trading,
    orderPanel,
    dialogs,
    api,
    created,
    assets,
  }) => {
    const ids = await openPositions({ page, trading, orderPanel, dialogs, api, created }, [
      { symbol: instruments.primary, side: 'BUY' },
    ]);

    const sent = await requestsDuring(page, 'bulkClose', async () => {
      await assets.openPositions.open();
      await assets.openPositions.chooseBulkClose('All Positions');
      await dialogs.bulk.cancel();
      await expect(dialogs.bulk.cancelButton).toBeHidden();
    });
    expect(sent).toBe(0);
    expect((await api.openPositions()).map((p) => p.orderId)).toEqual(ids);
  });
});
