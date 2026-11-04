import { expect, test } from '@src/fixtures/trading.fixture';
import { instruments } from '@src/data/instruments';
import { NOTIFICATION_TEMPLATE, ORDER_STATE, ORDER_TYPE, type SymbolDetail } from '@src/domain/models';
import { formatPrice, offsetPercent } from '@src/domain/price';
import { closingDealsProfit } from '@src/domain/rules';
import {
  closePosition,
  deletePendingOrder,
  placeMarketWithStops,
  placeOrder,
  waitForPending,
  waitForPosition,
} from '@src/flows/orders';

const STOP_DISTANCE_POINTS = 1000;
const PENDING_DISTANCE_PERCENT = 5;
const HOUR = 3_600_000;

/**
 * One Order No. links every record the platform keeps about a trade:
 * the trade response (clOrdId), the open position, the notifications, Positions History (positionId)
 * and the opening order in Orders & Deals. These tests follow one ID through all of them and check
 * that the trade's facts (symbol, side, volume, prices, SL/TP, P/L) are the same everywhere.
 * Every record is also written to artifacts/records for the Python layer.
 */
test.describe('Scope 7 – cross-record consistency', () => {
  test.use({ oneClick: false });

  let spec: SymbolDetail;
  let startedAt: number;
  const window = () => [startedAt - 60_000, Date.now() + HOUR] as const;

  test.beforeEach(async ({ trading }) => {
    startedAt = Date.now();
    spec = await trading.selectSymbol(instruments.primary);
  });

  test('CR-01 one Order No. traced from the trade response to every record @live', async ({
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
    const id = placed.orderId;
    recorder.add('tradeResponse', placed.result);

    // 1. Open position (API and grid).
    const position = await waitForPosition(api, id);
    recorder.add('position', position);
    expect(position).toMatchObject({
      symbol: spec.symbol,
      orderType: ORDER_TYPE.BUY,
      lotSize: spec.minContractLotSize,
    });
    expect(position.stopLoss).toBeCloseTo(placed.stopLoss, spec.digits);
    expect(position.takeProfit).toBeCloseTo(placed.takeProfit, spec.digits);
    await assets.openPositions.open();
    await expect(assets.openPositions.cell(id, 'entry-price')).toHaveText(formatPrice(position.openPrice, spec.digits));

    // 2. "Position Created" notification.
    await expect.poll(() => api.notificationFor(id, NOTIFICATION_TEMPLATE.CREATED)).toBeDefined();
    const createdNote = (await api.notificationFor(id, NOTIFICATION_TEMPLATE.CREATED))!;
    recorder.add('notificationCreated', createdNote);
    expect(createdNote.metadata).toMatchObject({
      symbol: position.symbol,
      cmd: position.orderType,
      lotSize: position.lotSize,
    });
    expect(createdNote.metadata.openPrice).toBeCloseTo(position.openPrice, spec.digits);
    expect(createdNote.metadata.stopLoss).toBeCloseTo(position.stopLoss, spec.digits);
    expect(createdNote.metadata.takeProfit).toBeCloseTo(position.takeProfit, spec.digits);

    // 3. Close, then Positions History.
    await closePosition({ page, dialogs, openPositions: assets.openPositions }, id, position.lotSize);
    const findHistory = async () => (await api.positionsHistory(...window())).find((h) => h.positionId === id);
    await expect.poll(findHistory).toBeDefined();
    const history = (await findHistory())!;
    recorder.add('history', history);
    expect(history).toMatchObject({
      symbol: position.symbol,
      orderType: position.orderType,
      lotSize: position.lotSize,
    });
    expect(history.openPrice).toBeCloseTo(position.openPrice, spec.digits);
    expect(history.stopLoss).toBeCloseTo(position.stopLoss, spec.digits);
    expect(history.takeProfit).toBeCloseTo(position.takeProfit, spec.digits);

    // 4. "Position Closed" notification agrees with history.
    await expect.poll(() => api.notificationFor(id, NOTIFICATION_TEMPLATE.CLOSED)).toBeDefined();
    const closedNote = (await api.notificationFor(id, NOTIFICATION_TEMPLATE.CLOSED))!;
    recorder.add('notificationClosed', closedNote);
    expect(closedNote.metadata.closePrice).toBeCloseTo(history.closePrice, spec.digits);
    expect(closedNote.metadata.profit).toBeCloseTo(history.profit, 2);

    // 5. Orders & Deals: the opening order carries the same ID, side, volume and price.
    const findOpening = async () => (await api.ordersAndDeals(...window())).find((o) => o.orderId === id);
    await expect.poll(async () => (await findOpening())?.state).toBe(ORDER_STATE.FILLED);
    const opening = (await findOpening())!;
    recorder.add('openingOrder', opening);
    expect(opening).toMatchObject({
      symbol: position.symbol,
      orderType: position.orderType,
      lotSize: position.lotSize,
    });
    expect(opening.deals).toHaveLength(1);
    expect(opening.deals[0]!.price).toBeCloseTo(position.openPrice, spec.digits);

    // 6. The same facts in the history grids and the bell menu.
    await assets.positionsHistory.open();
    await expect(assets.positionsHistory.cell(id, 'entry-price')).toHaveText(
      formatPrice(position.openPrice, spec.digits),
    );
    await expect(assets.positionsHistory.cell(id, 'stop-loss')).toHaveText(formatPrice(position.stopLoss, spec.digits));
    await expect(assets.positionsHistory.cell(id, 'take-profit')).toHaveText(
      formatPrice(position.takeProfit, spec.digits),
    );
    await assets.ordersDeals.open();
    await expect(assets.ordersDeals.cell(id, 'entry-price')).toHaveText(formatPrice(position.openPrice, spec.digits));
    await notifications.open();
    await expect(notifications.forOrder(id, 'Position Created')).toHaveCount(1);
    await expect(notifications.forOrder(id, 'Position Closed')).toHaveCount(1);
    await notifications.close();
  });

  test('CR-02 a position closed in two parts reconciles volume and P/L (R5, R6) @live', async ({
    page,
    orderPanel,
    dialogs,
    api,
    created,
    assets,
    recorder,
  }) => {
    const step = spec.minContractLotSize;
    const placed = await placeMarketWithStops(
      { page, orderPanel, dialogs, api, created },
      spec,
      'BUY',
      step * 2,
      STOP_DISTANCE_POINTS,
    );
    const id = placed.orderId;
    const position = await waitForPosition(api, id);
    const openPositions = assets.openPositions;

    await closePosition({ page, dialogs, openPositions }, id, step);
    await expect.poll(async () => (await api.openPosition(id))?.lotSize).toBe(position.lotSize - step);
    await closePosition({ page, dialogs, openPositions }, id, step);
    await expect.poll(() => api.openPosition(id)).toBeUndefined();

    const findHistory = async () => (await api.positionsHistory(...window())).find((h) => h.positionId === id);
    await expect.poll(findHistory).toBeDefined();
    const history = (await findHistory())!;
    // Closing orders are told apart from earlier tests' by being placed after this position opened.
    const closings = async () =>
      (await api.ordersAndDeals(...window())).filter(
        (o) => o.symbol === spec.symbol && o.orderType === ORDER_TYPE.SELL && o.openTime >= position.openTime,
      );
    await expect.poll(async () => (await closings()).length).toBe(2);
    const closingOrders = await closings();
    recorder.add('history', history);
    recorder.add('closingOrders', closingOrders);

    // R5: the two closes add up to the original volume; history keeps one row for the whole position.
    const closedVolume = closingOrders.reduce((sum, o) => sum + o.lotSizeFilled, 0);
    expect(Number(closedVolume.toFixed(2))).toBe(position.lotSize);
    expect(history.lotSize).toBe(position.lotSize);
    // R6: the position's P/L is the sum of its closing deals' profit.
    expect(closingDealsProfit(closingOrders, spec.symbol, 'SELL')).toBeCloseTo(history.profit, 2);

    await assets.positionsHistory.open();
    await expect(assets.positionsHistory.row(id)).toHaveCount(1);
    expect(await assets.positionsHistory.number(id, 'profit')).toBeCloseTo(history.profit, 2);
  });

  test('CR-03 a cancelled pending order has the same ID, price and volume in Pending Orders and Orders & Deals @live', async ({
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
    const price = offsetPercent(quote.ask, -PENDING_DISTANCE_PERCENT, spec);
    const placed = await placeOrder({ page, orderPanel, dialogs, api, created }, spec.symbol, {
      side: 'BUY',
      type: 'Limit',
      volume: spec.minContractLotSize,
      price,
    });
    const pending = await waitForPending(api, placed.orderId);
    recorder.add('pending', pending);

    // As listed while pending.
    const pendingTab = assets.pendingOrders;
    await pendingTab.open();
    const shownPrice = await pendingTab.text(placed.orderId, 'entry-price');
    expect(shownPrice).toBe(formatPrice(pending.price, spec.digits));

    await deletePendingOrder({ page, dialogs, pendingOrders: pendingTab }, placed.orderId);

    // As recorded once cancelled.
    const findOrder = async () => (await api.ordersAndDeals(...window())).find((o) => o.orderId === placed.orderId);
    await expect.poll(async () => (await findOrder())?.state).toBe(ORDER_STATE.CANCELED);
    const cancelled = (await findOrder())!;
    recorder.add('cancelled', cancelled);
    expect(cancelled).toMatchObject({
      symbol: pending.symbol,
      orderType: pending.orderType,
      lotSize: pending.lotSize,
      lotSizeFilled: 0,
    });
    expect(cancelled.openPrice).toBeCloseTo(pending.price, spec.digits);
    expect(cancelled.deals).toHaveLength(0);

    await assets.ordersDeals.open();
    await expect(assets.ordersDeals.cell(placed.orderId, 'state')).toHaveText(/cancel/i);
    await expect(assets.ordersDeals.cell(placed.orderId, 'entry-price')).toHaveText(shownPrice);
  });
});
