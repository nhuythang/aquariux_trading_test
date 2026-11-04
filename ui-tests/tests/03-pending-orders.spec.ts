import { expect, test } from '@src/fixtures/trading.fixture';
import { instruments } from '@src/data/instruments';
import { ORDER_STATE, ORDER_TYPE, type ExpiryType, type Side, type SymbolDetail } from '@src/domain/models';
import { formatPrice, marketPrice, offsetPercent } from '@src/domain/price';
import { pendingPriceOnCorrectSide, type PendingKind } from '@src/domain/rules';
import {
  deletePendingOrder,
  editPendingOrder,
  placeOrder,
  placeRejectedOrder,
  waitForPending,
} from '@src/flows/orders';
import type { ExpiryLabel, OrderTypeLabel } from '@src/pages/OrderPanel';

/**
 * Pending prices sit 2% away from the market on the side their type requires,
 * far enough that they never trigger during a test.
 */
const DISTANCE_PERCENT = 2;

/** Direction of the price offset for each side/type (R3). */
const direction = (side: Side, kind: PendingKind): 1 | -1 => ((side === 'BUY') === (kind === 'LIMIT') ? -1 : 1);

const expiryType: Record<ExpiryLabel, ExpiryType> = {
  'Good Till Canceled': 'GTC',
  'Good Till Day': 'GTD',
  'Specified Date': 'SPECIFIED_DAY',
  'Specified Date and Time': 'SPECIFIED_TIMESTAMP',
};

/** Local calendar date as the UI prints it: YYYY-MM-DD. */
const isoDay = (date: Date): string =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

const daysFromNow = (days: number): Date => {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date;
};

test.describe('Scope 3 – pending orders', () => {
  test.use({ oneClick: false });

  let spec: SymbolDetail;

  test.beforeEach(async ({ trading }) => {
    spec = await trading.selectSymbol(instruments.primary);
  });

  const cases = [
    { id: 'PO-01', side: 'BUY', kind: 'LIMIT', label: 'Limit', code: ORDER_TYPE.BUY_LIMIT, text: 'BUY LIMIT' },
    { id: 'PO-02', side: 'SELL', kind: 'LIMIT', label: 'Limit', code: ORDER_TYPE.SELL_LIMIT, text: 'SELL LIMIT' },
    { id: 'PO-03', side: 'BUY', kind: 'STOP', label: 'Stop', code: ORDER_TYPE.BUY_STOP, text: 'BUY STOP' },
    { id: 'PO-04', side: 'SELL', kind: 'STOP', label: 'Stop', code: ORDER_TYPE.SELL_STOP, text: 'SELL STOP' },
  ] as const satisfies ReadonlyArray<{
    id: string;
    side: Side;
    kind: PendingKind;
    label: OrderTypeLabel;
    code: number;
    text: string;
  }>;

  for (const c of cases) {
    test(`${c.id} ${c.text} on the correct side of the market, Good Till Canceled @live`, async ({
      page,
      orderPanel,
      dialogs,
      api,
      created,
      assets,
      recorder,
    }) => {
      await orderPanel.open();
      const quote = await orderPanel.quote();
      const reference = marketPrice(c.side, quote);
      const price = offsetPercent(reference, direction(c.side, c.kind) * DISTANCE_PERCENT, spec);
      expect(pendingPriceOnCorrectSide(c.side, c.kind, price, quote), 'test data respects R3').toBe(true);

      const placed = await placeOrder({ page, orderPanel, dialogs, api, created }, spec.symbol, {
        side: c.side,
        type: c.label,
        volume: spec.minContractLotSize,
        price,
        expiry: 'Good Till Canceled',
      });

      const order = await waitForPending(api, placed.orderId);
      recorder.add('pending', order);
      expect(order).toMatchObject({
        symbol: spec.symbol,
        orderType: c.code,
        lotSize: spec.minContractLotSize,
        tradeExpiry: 'GTC',
      });
      expect(order.price).toBeCloseTo(price, spec.digits);

      const tab = assets.pendingOrders;
      await tab.open();
      await expect(tab.cell(placed.orderId, 'order-type')).toHaveText(c.text);
      await expect(tab.cell(placed.orderId, 'entry-price')).toHaveText(formatPrice(price, spec.digits));
      await expect(tab.cell(placed.orderId, 'expiry')).toHaveText('Good Till Canceled');
    });
  }

  test('PO-05 BUY STOP LIMIT keeps both the stop and the limit price @live', async ({
    page,
    orderPanel,
    dialogs,
    api,
    created,
    assets,
    recorder,
  }) => {
    await orderPanel.open();
    const quote = await orderPanel.quote();
    const stop = offsetPercent(quote.ask, DISTANCE_PERCENT, spec);
    const limit = offsetPercent(quote.ask, DISTANCE_PERCENT / 2, spec);

    const placed = await placeOrder({ page, orderPanel, dialogs, api, created }, spec.symbol, {
      side: 'BUY',
      type: 'Stop Limit',
      volume: spec.minContractLotSize,
      price: stop,
      stopLimitPrice: limit,
    });

    // The form's "Price" is saved as `price`, its "Stop Limit Price" as `priceTrigger`.
    const order = await waitForPending(api, placed.orderId);
    recorder.add('pending', order);
    expect(order).toMatchObject({ orderType: ORDER_TYPE.BUY_STOP_LIMIT, price: stop, priceTrigger: limit });

    await assets.pendingOrders.open();
    await expect(assets.pendingOrders.cell(placed.orderId, 'order-type')).toHaveText('BUY STOP LIMIT');
    // The grid has no column for the limit price; the Order Confirmation showed both.
    await expect(assets.pendingOrders.cell(placed.orderId, 'entry-price')).toHaveText(formatPrice(stop, spec.digits));
    expect(placed.confirmation['Price']).toBe(formatPrice(stop, spec.digits));
    expect(placed.confirmation['Stop Limit Price']).toBe(formatPrice(limit, spec.digits));
  });

  test('PO-06 BUY LIMIT above the Ask (wrong side) is rejected by the backend @live', async ({
    page,
    orderPanel,
    dialogs,
    api,
  }) => {
    await orderPanel.open();
    const quote = await orderPanel.quote();
    const wrongPrice = offsetPercent(quote.ask, DISTANCE_PERCENT, spec);
    const before = await api.pendingOrders();

    // The panel does not validate the side: the confirmation opens and the backend refuses it.
    const rejection = await placeRejectedOrder(
      { page, orderPanel, dialogs },
      { side: 'BUY', type: 'Limit', volume: spec.minContractLotSize, price: wrongPrice },
    );
    expect(rejection).toEqual({ status: 400, code: 'MT4_1009', message: 'Metatrader Invalid Price' });
    expect(await api.pendingOrders()).toHaveLength(before.length);
  });

  test('PO-07a expiry "Good Till Day" is saved and shown @live', async ({
    page,
    orderPanel,
    dialogs,
    api,
    created,
    assets,
    recorder,
  }) => {
    await orderPanel.open();
    const quote = await orderPanel.quote();
    const placed = await placeOrder({ page, orderPanel, dialogs, api, created }, spec.symbol, {
      side: 'BUY',
      type: 'Limit',
      volume: spec.minContractLotSize,
      price: offsetPercent(quote.ask, -DISTANCE_PERCENT, spec),
      expiry: 'Good Till Day',
    });

    const order = await waitForPending(api, placed.orderId);
    recorder.add('pending', order);
    expect(order.tradeExpiry).toBe(expiryType['Good Till Day']);

    await assets.pendingOrders.open();
    await expect(assets.pendingOrders.cell(placed.orderId, 'expiry')).toHaveText('Good Till Day');
  });

  test('PO-07b expiry "Specified Date" keeps the chosen day @live', async ({
    page,
    orderPanel,
    dialogs,
    api,
    created,
    assets,
    recorder,
  }) => {
    const expiryDate = daysFromNow(3);
    await orderPanel.open();
    const quote = await orderPanel.quote();
    const placed = await placeOrder({ page, orderPanel, dialogs, api, created }, spec.symbol, {
      side: 'BUY',
      type: 'Limit',
      volume: spec.minContractLotSize,
      price: offsetPercent(quote.ask, -DISTANCE_PERCENT, spec),
      expiry: 'Specified Date',
      expiryDate,
    });

    const order = await waitForPending(api, placed.orderId);
    recorder.add('pending', order);
    expect(order.tradeExpiry).toBe(expiryType['Specified Date']);
    expect(order.expiration, 'expiration timestamp is set').toBeGreaterThan(0);

    await assets.pendingOrders.open();
    await expect(assets.pendingOrders.cell(placed.orderId, 'expiry')).toHaveText('Specified Date');
    await expect(assets.pendingOrders.cell(placed.orderId, 'expiry-date')).toContainText(isoDay(expiryDate));
  });

  test('PO-08 a past expiry date cannot be selected @live', async ({ orderPanel }) => {
    await orderPanel.open();
    await orderPanel.selectOrderType('Limit');
    await orderPanel.selectExpiry('Specified Date');
    await orderPanel.openCalendar();

    await expect(orderPanel.calendarDay(daysFromNow(-1))).toBeDisabled();
    await expect(orderPanel.calendarDay(daysFromNow(1))).toBeEnabled();
  });

  test('PO-09 modifying price, SL and TP of a pending order updates it @live', async ({
    page,
    orderPanel,
    dialogs,
    api,
    created,
    assets,
  }) => {
    await orderPanel.open();
    const quote = await orderPanel.quote();
    const placed = await placeOrder({ page, orderPanel, dialogs, api, created }, spec.symbol, {
      side: 'BUY',
      type: 'Limit',
      volume: spec.minContractLotSize,
      price: offsetPercent(quote.ask, -DISTANCE_PERCENT, spec),
    });
    await waitForPending(api, placed.orderId);

    const newPrice = offsetPercent(quote.ask, -DISTANCE_PERCENT * 1.5, spec);
    const stopLoss = offsetPercent(newPrice, -1, spec);
    const takeProfit = offsetPercent(newPrice, 1, spec);
    await editPendingOrder({ page, dialogs, pendingOrders: assets.pendingOrders }, placed.orderId, {
      price: newPrice,
      stopLoss,
      takeProfit,
    });

    await expect
      .poll(async () => {
        const o = await api.pendingOrder(placed.orderId);
        return o && [o.price, o.stopLoss, o.takeProfit];
      })
      .toEqual([newPrice, stopLoss, takeProfit]);
    await expect(assets.pendingOrders.cell(placed.orderId, 'entry-price')).toHaveText(
      formatPrice(newPrice, spec.digits),
    );
    await expect(assets.pendingOrders.cell(placed.orderId, 'stop-loss')).toHaveText(formatPrice(stopLoss, spec.digits));
    await expect(assets.pendingOrders.cell(placed.orderId, 'take-profit')).toHaveText(
      formatPrice(takeProfit, spec.digits),
    );
  });

  test('PO-10 deleting a pending order removes it and records it as cancelled @live', async ({
    page,
    orderPanel,
    dialogs,
    api,
    created,
    assets,
    recorder,
  }) => {
    await orderPanel.open();
    const quote = await orderPanel.quote();
    const price = offsetPercent(quote.ask, -DISTANCE_PERCENT, spec);
    const placed = await placeOrder({ page, orderPanel, dialogs, api, created }, spec.symbol, {
      side: 'BUY',
      type: 'Limit',
      volume: spec.minContractLotSize,
      price,
    });
    await waitForPending(api, placed.orderId);

    await deletePendingOrder({ page, dialogs, pendingOrders: assets.pendingOrders }, placed.orderId);
    expect(await api.pendingOrder(placed.orderId)).toBeUndefined();

    // Orders & Deals keeps the order with state CANCELED and no deal (R7).
    const from = Date.now() - 24 * 3600_000;
    let cancelled: Awaited<ReturnType<typeof api.ordersAndDeals>>[number] | undefined;
    await expect
      .poll(async () => {
        cancelled = (await api.ordersAndDeals(from, Date.now() + 3600_000)).find((o) => o.orderId === placed.orderId);
        return cancelled?.state;
      })
      .toBe(ORDER_STATE.CANCELED);
    recorder.add('cancelled', cancelled);
    expect(cancelled!.deals).toHaveLength(0);

    await assets.ordersDeals.open();
    await expect(assets.ordersDeals.cell(placed.orderId, 'state')).toHaveText(/canceled/i);
    await expect(assets.ordersDeals.cell(placed.orderId, 'entry-price')).toHaveText(formatPrice(price, spec.digits));
  });
});
