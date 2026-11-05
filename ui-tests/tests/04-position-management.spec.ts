import { expect, test } from '@src/fixtures/trading.fixture';
import { instruments } from '@src/data/instruments';
import { ORDER_TYPE, ORDER_STATE, type SymbolDetail } from '@src/domain/models';
import { formatPrice, offsetPoints } from '@src/domain/price';
import { requestsDuring } from '@src/api/capture';
import {
  attemptPositionEdit,
  closePosition,
  editPosition,
  placeMarketWithStops,
  waitForPosition,
} from '@src/flows/orders';

const STOP_DISTANCE_POINTS = 1000;

test.describe('Scope 4 – view, modify, partially close and close positions', () => {
  test.use({ oneClick: false });

  let spec: SymbolDetail;

  test.beforeEach(async ({ trading }) => {
    spec = await trading.selectSymbol(instruments.primary);
  });

  test('PM-01 open position row matches the backend record @live', async ({
    page,
    orderPanel,
    dialogs,
    api,
    created,
    assets,
    recorder,
  }) => {
    const volume = spec.minContractLotSize * 2;
    const placed = await placeMarketWithStops(
      { page, orderPanel, dialogs, api, created },
      spec,
      'BUY',
      volume,
      STOP_DISTANCE_POINTS,
    );
    const position = await waitForPosition(api, placed.orderId);
    recorder.add('position', position);

    const tab = assets.openPositions;
    await tab.open();
    await expect(tab.cell(placed.orderId, 'symbol')).toHaveText(position.symbol);
    await expect(tab.cell(placed.orderId, 'order-type')).toHaveText('BUY');
    await expect(tab.cell(placed.orderId, 'volume')).toHaveText(String(position.lotSize));
    await expect(tab.cell(placed.orderId, 'units')).toHaveText(String(position.units));
    await expect(tab.cell(placed.orderId, 'entry-price')).toHaveText(formatPrice(position.openPrice, spec.digits));
    await expect(tab.cell(placed.orderId, 'stop-loss')).toHaveText(formatPrice(position.stopLoss, spec.digits));
    await expect(tab.cell(placed.orderId, 'take-profit')).toHaveText(formatPrice(position.takeProfit, spec.digits));
    await expect(tab.cell(placed.orderId, 'comment')).toHaveText(position.comment);

    // Live values move every tick: P/L sign must follow current vs entry price for a BUY.
    const current = await tab.number(placed.orderId, 'current-price');
    const profit = await tab.number(placed.orderId, 'profit');
    expect(Math.sign(profit) === Math.sign(current - position.openPrice) || profit === 0).toBe(true);
  });

  test('PM-02 modifying SL and TP updates the position @live', async ({
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
    const before = await waitForPosition(api, placed.orderId);
    const stopLoss = offsetPoints(before.stopLoss, -STOP_DISTANCE_POINTS / 2, spec);
    const takeProfit = offsetPoints(before.takeProfit, STOP_DISTANCE_POINTS / 2, spec);

    const result = await editPosition({ page, dialogs, openPositions: assets.openPositions }, placed.orderId, {
      stopLoss,
      takeProfit,
    });
    expect(result.positionId).toBe(placed.orderId);
    recorder.add('positionBefore', before);
    recorder.add('modifyPositionResponse', result);

    await expect
      .poll(async () => {
        const p = await api.openPosition(placed.orderId);
        return p && [p.stopLoss, p.takeProfit];
      })
      .toEqual([stopLoss, takeProfit]);
    recorder.add('positionAfter', await api.openPosition(placed.orderId));
    await expect(assets.openPositions.cell(placed.orderId, 'stop-loss')).toHaveText(formatPrice(stopLoss, spec.digits));
    await expect(assets.openPositions.cell(placed.orderId, 'take-profit')).toHaveText(
      formatPrice(takeProfit, spec.digits),
    );
  });

  test('PM-03 moving SL to the wrong side is refused and the old SL is kept @live', async ({
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
    const before = await waitForPosition(api, placed.orderId);
    const quote = await orderPanel.quote();
    const wrongStopLoss = offsetPoints(quote.ask, STOP_DISTANCE_POINTS, spec);

    const outcome = await attemptPositionEdit({ page, dialogs, openPositions: assets.openPositions }, placed.orderId, {
      stopLoss: wrongStopLoss,
    });
    recorder.add('outcome', outcome);

    // The dialog refuses it inline; Update Position stays clickable but leads nowhere.
    expect(outcome.message).toMatch(/Stop Loss must be less than/);
    expect(outcome).toMatchObject({ confirmationShown: false, requestsSent: 0 });
    expect((await api.openPosition(placed.orderId))?.stopLoss).toBe(before.stopLoss);
  });

  test('PM-04 partial close leaves the remainder open with the same Order No. @live', async ({
    page,
    orderPanel,
    dialogs,
    api,
    created,
    assets,
    recorder,
  }) => {
    const volume = spec.minContractLotSize * 2;
    const half = spec.minContractLotSize;
    const startedAt = Date.now() - 60_000;
    const placed = await placeMarketWithStops(
      { page, orderPanel, dialogs, api, created },
      spec,
      'BUY',
      volume,
      STOP_DISTANCE_POINTS,
    );
    await waitForPosition(api, placed.orderId);

    const result = await closePosition({ page, dialogs, openPositions: assets.openPositions }, placed.orderId, half);
    recorder.add('closePositionResponse', result);
    expect(result.positionId).toBe(placed.orderId);

    await expect.poll(async () => (await api.openPosition(placed.orderId))?.lotSize).toBe(volume - half);
    await expect(assets.openPositions.cell(placed.orderId, 'volume')).toHaveText(String(volume - half));

    // The closed part is a separate SELL order, filled, for the closed volume.
    const closingSells = async () =>
      (await api.ordersAndDeals(startedAt, Date.now() + 3_600_000)).filter(
        (o) => o.symbol === spec.symbol && o.orderType === ORDER_TYPE.SELL && o.openTime >= startedAt,
      );
    await expect.poll(async () => (await closingSells()).length).toBeGreaterThan(0);
    const [closing] = await closingSells();
    recorder.add('closing', closing);
    expect(closing).toMatchObject({ lotSize: half, state: ORDER_STATE.FILLED });
  });

  test('PM-05a closing more than the position size is not possible @live', async ({
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
    await waitForPosition(api, placed.orderId);

    await assets.openPositions.open();
    await assets.openPositions.close(placed.orderId);
    await dialogs.close.setVolume(spec.minContractLotSize * 3);
    await expect(dialogs.close.confirmButton).toBeDisabled();
    await dialogs.close.cancel();

    expect((await api.openPosition(placed.orderId))?.lotSize).toBe(spec.minContractLotSize);
  });

  test('PM-05b closing less than the minimum volume is not possible @live', async ({
    page,
    orderPanel,
    dialogs,
    api,
    created,
    assets,
  }) => {
    const volume = spec.minContractLotSize * 2;
    const placed = await placeMarketWithStops(
      { page, orderPanel, dialogs, api, created },
      spec,
      'BUY',
      volume,
      STOP_DISTANCE_POINTS,
    );
    await waitForPosition(api, placed.orderId);

    await assets.openPositions.open();
    await assets.openPositions.close(placed.orderId);
    const sent = await requestsDuring(page, 'closePosition', async () => {
      await dialogs.close.setVolume(spec.minContractLotSize / 2);
      await expect(dialogs.close.confirmButton).toBeDisabled();
    });
    await dialogs.close.cancel();

    expect(sent).toBe(0);
    expect((await api.openPosition(placed.orderId))?.lotSize).toBe(volume);
  });

  test('PM-06 full close removes the position and records it in Positions History @live', async ({
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

    const closed = await closePosition(
      { page, dialogs, openPositions: assets.openPositions },
      placed.orderId,
      position.lotSize,
    );
    recorder.add('position', position);
    recorder.add('closePositionResponse', closed);
    await expect.poll(() => api.openPosition(placed.orderId)).toBeUndefined();
    await expect(assets.openPositions.row(placed.orderId)).toHaveCount(0);

    const from = Date.now() - 24 * 3_600_000;
    const findRecord = async () =>
      (await api.positionsHistory(from, Date.now() + 3_600_000)).find((h) => h.positionId === placed.orderId);
    await expect.poll(findRecord).toBeDefined();
    const record = (await findRecord())!;
    recorder.add('history', record);
    expect(record).toMatchObject({ symbol: spec.symbol, lotSize: position.lotSize, status: 'CLOSED' });
    expect(record.openPrice).toBeCloseTo(position.openPrice, spec.digits);
    expect(record.closePrice).toBeGreaterThan(0);

    const history = assets.positionsHistory;
    await history.open();
    await expect(history.cell(placed.orderId, 'symbol')).toHaveText(spec.symbol);
    await expect(history.cell(placed.orderId, 'volume')).toHaveText(String(position.lotSize));
    await expect(history.cell(placed.orderId, 'entry-price')).toHaveText(formatPrice(record.openPrice, spec.digits));
    await expect(history.cell(placed.orderId, 'close-price')).toHaveText(formatPrice(record.closePrice, spec.digits));
  });
});
