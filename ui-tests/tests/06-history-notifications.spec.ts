import { expect, test } from '@src/fixtures/trading.fixture';
import { matches } from '@src/api/capture';
import { endpoints } from '@src/api/endpoints';
import { instruments } from '@src/data/instruments';
import { NOTIFICATION_TEMPLATE, ORDER_STATE, ORDER_TYPE, type SymbolDetail } from '@src/domain/models';
import { formatPrice, offsetPercent } from '@src/domain/price';
import {
  closePosition,
  deletePendingOrder,
  placeMarketWithStops,
  placeOrder,
  placeRejectedOrder,
  waitForPending,
  waitForPosition,
} from '@src/flows/orders';

const STOP_DISTANCE_POINTS = 1000;
const PENDING_DISTANCE_PERCENT = 5;
const HOUR = 3_600_000;

test.describe('Scope 6 – history, transactions and notifications', () => {
  test.use({ oneClick: false });

  let spec: SymbolDetail;
  /** History queries are limited to this test's own time window; older records on the account are ignored. */
  let startedAt: number;
  const window = () => [startedAt - 60_000, Date.now() + HOUR] as const;

  test.beforeEach(async ({ trading }) => {
    startedAt = Date.now();
    spec = await trading.selectSymbol(instruments.primary);
  });

  test('HN-01 opening a position raises a "Position Created" notification with its details @live', async ({
    page,
    orderPanel,
    dialogs,
    api,
    created,
    notifications,
    recorder,
  }) => {
    const placed = await placeMarketWithStops(
      { page, orderPanel, dialogs, api, created },
      spec,
      'BUY',
      spec.minContractLotSize,
      STOP_DISTANCE_POINTS,
    );
    const position = await waitForPosition(api, placed.orderId);

    // Backend record of the notification.
    await expect.poll(() => api.notificationFor(placed.orderId, NOTIFICATION_TEMPLATE.CREATED)).toBeDefined();
    const record = (await api.notificationFor(placed.orderId, NOTIFICATION_TEMPLATE.CREATED))!;
    recorder.add('position', position);
    recorder.add('notification', record);
    expect(record.metadata).toMatchObject({ symbol: spec.symbol, cmd: ORDER_TYPE.BUY, lotSize: position.lotSize });
    expect(record.metadata.openPrice).toBeCloseTo(position.openPrice, spec.digits);

    // What the user sees in the bell menu.
    await notifications.open();
    const item = notifications.forOrder(placed.orderId, 'Position Created');
    await expect(item).toHaveCount(1);
    expect(await notifications.read(item)).toEqual({
      title: 'Position Created',
      profit: undefined,
      symbol: spec.symbol,
      orderId: placed.orderId,
      side: 'BUY',
      volume: position.lotSize,
      price: formatPrice(position.openPrice, spec.digits),
    });
    await notifications.close();
  });

  test('HN-02 closing a position raises a "Position Closed" notification with its P/L @live', async ({
    page,
    orderPanel,
    dialogs,
    api,
    created,
    assets,
    notifications,
    recorder,
  }) => {
    const placed = await placeMarketWithStops(
      { page, orderPanel, dialogs, api, created },
      spec,
      'BUY',
      spec.minContractLotSize,
      STOP_DISTANCE_POINTS,
    );
    const position = await waitForPosition(api, placed.orderId);
    await closePosition({ page, dialogs, openPositions: assets.openPositions }, placed.orderId, position.lotSize);

    await expect.poll(() => api.notificationFor(placed.orderId, NOTIFICATION_TEMPLATE.CLOSED)).toBeDefined();
    const record = (await api.notificationFor(placed.orderId, NOTIFICATION_TEMPLATE.CLOSED))!;
    const findHistory = async () =>
      (await api.positionsHistory(...window())).find((h) => h.positionId === placed.orderId);
    await expect.poll(findHistory).toBeDefined();
    const history = (await findHistory())!;
    recorder.add('notification', record);
    recorder.add('history', history);

    // The notification carries the same close price and P/L as Positions History.
    expect(record.metadata).toMatchObject({ symbol: spec.symbol, cmd: ORDER_TYPE.BUY, lotSize: position.lotSize });
    expect(record.metadata.closePrice).toBeCloseTo(history.closePrice, spec.digits);
    expect(record.metadata.profit).toBeCloseTo(history.profit, 2);

    await notifications.open();
    const item = notifications.forOrder(placed.orderId, 'Position Closed');
    await expect(item).toHaveCount(1);
    const shown = await notifications.read(item);
    expect(shown).toMatchObject({
      title: 'Position Closed',
      symbol: spec.symbol,
      orderId: placed.orderId,
      side: 'BUY',
      volume: position.lotSize,
      price: formatPrice(history.closePrice, spec.digits),
    });
    expect(shown.profit).toBeCloseTo(history.profit, 2);
    await notifications.close();
  });

  test('HN-03 Positions History shows the closed position with dates, prices, SL/TP and P/L @live', async ({
    page,
    orderPanel,
    dialogs,
    api,
    created,
    assets,
    recorder,
  }) => {
    const placed = await placeMarketWithStops(
      { page, orderPanel, dialogs, api, created },
      spec,
      'BUY',
      spec.minContractLotSize,
      STOP_DISTANCE_POINTS,
    );
    const position = await waitForPosition(api, placed.orderId);
    await closePosition({ page, dialogs, openPositions: assets.openPositions }, placed.orderId, position.lotSize);

    const findHistory = async () =>
      (await api.positionsHistory(...window())).find((h) => h.positionId === placed.orderId);
    await expect.poll(findHistory).toBeDefined();
    const record = (await findHistory())!;
    recorder.add('history', record);
    expect(record).toMatchObject({ symbol: spec.symbol, lotSize: position.lotSize, status: 'CLOSED' });
    expect(record.stopLoss).toBeCloseTo(placed.stopLoss, spec.digits);
    expect(record.takeProfit).toBeCloseTo(placed.takeProfit, spec.digits);
    expect(record.closeTime).toBeGreaterThanOrEqual(record.openTime);

    const tab = assets.positionsHistory;
    await tab.open();
    await expect(tab.cell(placed.orderId, 'symbol')).toHaveText(spec.symbol);
    await expect(tab.cell(placed.orderId, 'order-type')).toHaveText('BUY');
    await expect(tab.cell(placed.orderId, 'volume')).toHaveText(String(record.lotSize));
    await expect(tab.cell(placed.orderId, 'entry-price')).toHaveText(formatPrice(record.openPrice, spec.digits));
    await expect(tab.cell(placed.orderId, 'close-price')).toHaveText(formatPrice(record.closePrice, spec.digits));
    await expect(tab.cell(placed.orderId, 'stop-loss')).toHaveText(formatPrice(record.stopLoss, spec.digits));
    await expect(tab.cell(placed.orderId, 'take-profit')).toHaveText(formatPrice(record.takeProfit, spec.digits));
    expect(await tab.number(placed.orderId, 'profit')).toBeCloseTo(record.profit, 2);
    // Dates are shown in local time; both must be present.
    await expect(tab.cell(placed.orderId, 'open-date')).not.toHaveText(/^(--)?$/);
    await expect(tab.cell(placed.orderId, 'close-date')).not.toHaveText(/^(--)?$/);
  });

  test('HN-04 Orders & Deals lists the opening, closing and cancelled orders with their states @live', async ({
    page,
    orderPanel,
    dialogs,
    api,
    created,
    assets,
    recorder,
  }) => {
    const ctx = { page, orderPanel, dialogs, api, created };
    const opened = await placeMarketWithStops(ctx, spec, 'BUY', spec.minContractLotSize, STOP_DISTANCE_POINTS);
    const position = await waitForPosition(api, opened.orderId);
    await closePosition({ page, dialogs, openPositions: assets.openPositions }, opened.orderId, position.lotSize);

    await orderPanel.open();
    const quote = await orderPanel.quote();
    const pending = await placeOrder(ctx, spec.symbol, {
      side: 'BUY',
      type: 'Limit',
      volume: spec.minContractLotSize,
      price: offsetPercent(quote.ask, -PENDING_DISTANCE_PERCENT, spec),
    });
    await waitForPending(api, pending.orderId);
    await deletePendingOrder({ page, dialogs, pendingOrders: assets.pendingOrders }, pending.orderId);

    // Three orders from this test: BUY (filled, opens), SELL (filled, closes), BUY LIMIT (cancelled).
    const ours = async () => (await api.ordersAndDeals(...window())).filter((o) => o.symbol === spec.symbol);
    await expect
      .poll(async () => {
        const orders = await ours();
        return [
          orders.find((o) => o.orderId === opened.orderId)?.state,
          orders.some((o) => o.orderType === ORDER_TYPE.SELL && o.state === ORDER_STATE.FILLED),
          orders.find((o) => o.orderId === pending.orderId)?.state,
        ];
      })
      .toEqual([ORDER_STATE.FILLED, true, ORDER_STATE.CANCELED]);
    const orders = await ours();
    const opening = orders.find((o) => o.orderId === opened.orderId)!;
    const closing = orders.find((o) => o.orderType === ORDER_TYPE.SELL && o.state === ORDER_STATE.FILLED)!;
    const cancelled = orders.find((o) => o.orderId === pending.orderId)!;
    recorder.add('orders', { opening, closing, cancelled });

    expect(opening).toMatchObject({ lotSize: position.lotSize, lotSizeFilled: position.lotSize });
    expect(opening.deals).toHaveLength(1);
    expect(closing).toMatchObject({ lotSize: position.lotSize, lotSizeFilled: position.lotSize });
    expect(closing.deals).toHaveLength(1);
    expect(cancelled).toMatchObject({ orderType: ORDER_TYPE.BUY_LIMIT, lotSizeFilled: 0 });
    expect(cancelled.deals).toHaveLength(0);

    const tab = assets.ordersDeals;
    await tab.open();
    for (const [order, state, type] of [
      [opening, /filled/i, 'Buy'],
      [closing, /filled/i, 'Sell'],
      [cancelled, /cancel/i, 'Buy Limit'],
    ] as const) {
      await expect(tab.cell(order.orderId, 'state')).toHaveText(state);
      await expect(tab.cell(order.orderId, 'order-type')).toHaveText(type);
      // Volume is printed as "ordered / filled" (a cancelled order reads "0.1 / 0"), unlike Positions History's plain lot size.
      await expect(tab.cell(order.orderId, 'volume')).toHaveText(`${order.lotSize} / ${order.lotSizeFilled}`);
    }
  });

  test('HN-05 the date filter hides positions closed outside the chosen range @live', async ({
    page,
    orderPanel,
    dialogs,
    api,
    created,
    assets,
  }) => {
    const placed = await placeMarketWithStops(
      { page, orderPanel, dialogs, api, created },
      spec,
      'BUY',
      spec.minContractLotSize,
      STOP_DISTANCE_POINTS,
    );
    const position = await waitForPosition(api, placed.orderId);
    await closePosition({ page, dialogs, openPositions: assets.openPositions }, placed.orderId, position.lotSize);
    await expect
      .poll(async () => (await api.positionsHistory(...window())).some((h) => h.positionId === placed.orderId))
      .toBe(true);

    const tab = assets.positionsHistory;
    await tab.open();
    await expect(tab.row(placed.orderId)).toHaveCount(1);

    // "Last year" ends before today: the app asks for a range that excludes now, and the row disappears.
    const lastYear = page.waitForResponse((r) => matches(r, endpoints.positionsHistory));
    await assets.dateFilter.choose('Last year');
    const url = new URL((await lastYear).url());
    expect(Number(url.searchParams.get('to'))).toBeLessThan(startedAt);
    await expect(tab.row(placed.orderId)).toHaveCount(0);

    const lastWeek = page.waitForResponse((r) => matches(r, endpoints.positionsHistory));
    await assets.dateFilter.choose('Last 7 days');
    const weekUrl = new URL((await lastWeek).url());
    expect(Number(weekUrl.searchParams.get('to'))).toBeGreaterThanOrEqual(startedAt);
    await expect(tab.row(placed.orderId)).toHaveCount(1);

    // The chosen range is remembered by the app (local storage); leave the default behind.
    const defaultRange = page.waitForResponse((r) => matches(r, endpoints.positionsHistory));
    await assets.dateFilter.reset();
    const defaultUrl = new URL((await defaultRange).url());
    expect(Number(defaultUrl.searchParams.get('from'))).toBeLessThan(Number(weekUrl.searchParams.get('from')));
    await expect(tab.row(placed.orderId)).toHaveCount(1);
  });

  test('HN-06 a rejected order leaves no order, deal or notification behind @live', async ({
    page,
    orderPanel,
    dialogs,
    api,
  }) => {
    await orderPanel.open();
    const quote = await orderPanel.quote();
    const notificationsBefore = new Set((await api.orderNotifications()).map((n) => n.id));
    const pendingBefore = (await api.pendingOrders()).length;

    const rejection = await placeRejectedOrder(
      { page, orderPanel, dialogs },
      { side: 'BUY', type: 'Limit', volume: spec.minContractLotSize, price: offsetPercent(quote.ask, 5, spec) },
    );
    expect(rejection.status).toBe(400);

    // Proving that nothing appears needs a fixed wait: give the backend time to publish anything it would.
    // eslint-disable-next-line playwright/no-wait-for-timeout
    await page.waitForTimeout(3_000);
    const newOrders = (await api.ordersAndDeals(...window())).filter(
      (o) => o.symbol === spec.symbol && o.openTime >= startedAt,
    );
    expect(newOrders, 'orders recorded after a rejected request').toEqual([]);
    const newNotifications = (await api.orderNotifications()).filter((n) => !notificationsBefore.has(n.id));
    expect(newNotifications, 'notifications raised by a rejected request').toEqual([]);
    expect(await api.pendingOrders()).toHaveLength(pendingBefore);
  });
});
