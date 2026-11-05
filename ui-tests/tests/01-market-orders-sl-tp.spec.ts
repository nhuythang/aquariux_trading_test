import { expect, test } from '@src/fixtures/trading.fixture';
import { instruments } from '@src/data/instruments';
import { ORDER_TYPE, type Side, type SymbolDetail } from '@src/domain/models';
import { formatPrice, marketPrice, nearlyEqual, offsetPoints } from '@src/domain/price';
import { stopsOnCorrectSide } from '@src/domain/rules';
import { requestsDuring } from '@src/api/capture';
import { findWebRestrictedSymbol } from '@src/api/symbols';
import { attemptInvalidSubmit, placeMarketWithStops, placeOrder, waitForPosition } from '@src/flows/orders';

/** SL/TP distance from the market: far enough not to trigger during the test. */
const STOP_DISTANCE_POINTS = 1000;

/** Fill tolerance: the price moves between reading the quote and execution. */
const fillTolerance = (spec: SymbolDetail, quote: { bid: number; ask: number }) =>
  Math.max((quote.ask - quote.bid) * 5, spec.pointStep * 200);

test.describe('Scope 1 – market orders with Stop Loss and Take Profit', () => {
  test.use({ oneClick: false });

  let spec: SymbolDetail;

  test.beforeEach(async ({ trading }) => {
    spec = await trading.selectSymbol(instruments.primary);
  });

  for (const [id, side] of [
    ['MO-01', 'BUY'],
    ['MO-02', 'SELL'],
  ] as const satisfies ReadonlyArray<readonly [string, Side]>) {
    test(`${id} ${side} market order with valid SL and TP opens a matching position @live`, async ({
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
        side,
        volume,
        STOP_DISTANCE_POINTS,
      );

      // Confirmation dialog repeated the form.
      expect(placed.confirmation).toMatchObject({
        Volume: String(volume),
        'Stop Loss': formatPrice(placed.stopLoss, spec.digits),
        'Take Profit': formatPrice(placed.takeProfit, spec.digits),
      });

      // Backend record.
      const position = await waitForPosition(api, placed.orderId);
      recorder.add('position', position);
      expect(position).toMatchObject({
        symbol: spec.symbol,
        orderType: side === 'BUY' ? ORDER_TYPE.BUY : ORDER_TYPE.SELL,
        lotSize: volume,
      });
      expect(position.stopLoss).toBeCloseTo(placed.stopLoss, spec.digits);
      expect(position.takeProfit).toBeCloseTo(placed.takeProfit, spec.digits);
      expect(
        nearlyEqual(position.openPrice, marketPrice(side, placed.quote), fillTolerance(spec, placed.quote)),
        `entry ${position.openPrice} should be close to ${side === 'BUY' ? 'Ask' : 'Bid'} ${marketPrice(side, placed.quote)}`,
      ).toBe(true);
      expect(stopsOnCorrectSide(side, position.openPrice, position.stopLoss, position.takeProfit)).toBe(true);

      // UI row, located by Order No.
      const tab = assets.openPositions;
      await tab.open();
      await expect(tab.row(placed.orderId)).toBeVisible();
      await expect(tab.cell(placed.orderId, 'symbol')).toHaveText(spec.symbol);
      await expect(tab.cell(placed.orderId, 'order-type')).toHaveText(side);
      await expect(tab.cell(placed.orderId, 'volume')).toHaveText(String(volume));
      await expect(tab.cell(placed.orderId, 'entry-price')).toHaveText(formatPrice(position.openPrice, spec.digits));
      await expect(tab.cell(placed.orderId, 'stop-loss')).toHaveText(formatPrice(position.stopLoss, spec.digits));
      await expect(tab.cell(placed.orderId, 'take-profit')).toHaveText(formatPrice(position.takeProfit, spec.digits));
    });
  }

  test('MO-03 BUY with Stop Loss above the market cannot be placed @live', async ({ page, orderPanel, dialogs }) => {
    await orderPanel.open();
    const quote = await orderPanel.quote();
    const wrongStopLoss = offsetPoints(quote.ask, STOP_DISTANCE_POINTS, spec);

    await orderPanel.fill({ side: 'BUY', type: 'Market', volume: spec.minContractLotSize, stopLoss: wrongStopLoss });
    await expect(orderPanel.validationMessage(/Stop Loss must be less than/i)).toBeVisible();

    const outcome = await attemptInvalidSubmit({ page, orderPanel, dialogs });
    expect(outcome).toEqual({ confirmationShown: false, requestsSent: 0 });
  });

  test('MO-04 SELL with Take Profit above the market cannot be placed @live', async ({ page, orderPanel, dialogs }) => {
    await orderPanel.open();
    const quote = await orderPanel.quote();
    const wrongTakeProfit = offsetPoints(quote.bid, STOP_DISTANCE_POINTS, spec);

    await orderPanel.fill({
      side: 'SELL',
      type: 'Market',
      volume: spec.minContractLotSize,
      takeProfit: wrongTakeProfit,
    });
    await expect(orderPanel.validationMessage(/Take Profit must be less than/i)).toBeVisible();

    const outcome = await attemptInvalidSubmit({ page, orderPanel, dialogs });
    expect(outcome).toEqual({ confirmationShown: false, requestsSent: 0 });
  });

  test('MO-05a volume below the minimum cannot be placed @live', async ({ page, orderPanel, dialogs }) => {
    const belowMin = Number((spec.minContractLotSize / 2).toFixed(2));
    await orderPanel.open();
    await orderPanel.fill({ side: 'BUY', type: 'Market', volume: belowMin });
    await expect(orderPanel.validationMessage(/Minimum volume is/i)).toBeVisible();

    const outcome = await attemptInvalidSubmit({ page, orderPanel, dialogs });
    expect(outcome).toEqual({ confirmationShown: false, requestsSent: 0 });
  });

  test('MO-05b volume that is not a multiple of the step is normalised while typing @live', async ({ orderPanel }) => {
    const step = spec.lotSizeStep;
    const offStep = Number((spec.minContractLotSize + step / 2).toFixed(4));
    await orderPanel.open();
    await orderPanel.selectOrderType('Market');
    await orderPanel.setVolume(offStep);
    await orderPanel.volume.blur(); // the input applies the step rule when it loses focus

    const isStepAligned = async () => {
      const steps = Number(await orderPanel.volume.inputValue()) / step;
      return Math.abs(steps - Math.round(steps)) < 1e-9;
    };
    await expect.poll(isStepAligned, { message: `volume is normalised to a multiple of ${step}` }).toBe(true);
  });

  test('MO-06 market order without SL and TP opens with both empty @live', async ({
    page,
    orderPanel,
    dialogs,
    api,
    created,
    assets,
  }) => {
    const placed = await placeOrder({ page, orderPanel, dialogs, api, created }, spec.symbol, {
      side: 'BUY',
      type: 'Market',
      volume: spec.minContractLotSize,
    });

    const position = await waitForPosition(api, placed.orderId);
    expect(position.stopLoss).toBe(0);
    expect(position.takeProfit).toBe(0);

    await assets.openPositions.open();
    await expect(assets.openPositions.cell(placed.orderId, 'stop-loss')).toHaveText('--');
    await expect(assets.openPositions.cell(placed.orderId, 'take-profit')).toHaveText('--');
  });

  test('MO-07 cancelling the confirmation dialog places nothing @live', async ({ page, orderPanel, dialogs, api }) => {
    const before = await api.counts();
    await orderPanel.open();
    await orderPanel.fill({ side: 'SELL', type: 'Market', volume: spec.minContractLotSize });

    const sent = await requestsDuring(page, 'placeMarket', async () => {
      await orderPanel.submit();
      await expect(dialogs.confirmation.symbol).toHaveText(spec.symbol);
      await expect(dialogs.confirmation.orderType).toHaveText(/sell/i);
      await dialogs.confirmation.cancel();
      await expect(dialogs.confirmation.confirmButton).toBeHidden();
    });

    expect(sent).toBe(0);
    expect((await api.counts()).marketOrderCounts).toBe(before.marketOrderCounts);
  });

  test('MO-08 a symbol that is open but not tradable from the web cannot be ordered (E10) @live', async ({
    page,
    api,
    trading,
    orderPanel,
    recorder,
  }) => {
    // The backend flips tradableExeMode over time (GBPJPY became tradable on 2026-11-05), so the symbol is
    // looked up. E10 needs an open market; on a weekend the closed-market rules apply instead (MC-*).
    const symbol = await findWebRestrictedSymbol(api, instruments.notTradable);
    // eslint-disable-next-line playwright/no-skipped-test
    test.skip(!symbol, 'no open symbol is restricted from web trading right now');
    const detail = await trading.selectSymbol(symbol!);
    recorder.add('symbolDetail', detail);
    expect(detail.status).toBe('TRADING');
    expect(detail.tradableExeMode).toBe(false);

    await orderPanel.open();
    await orderPanel.fill({ side: 'BUY', type: 'Market', volume: detail.minContractLotSize });
    await expect(orderPanel.submitButton).toHaveText(/stay tuned/i);
    const sent = await requestsDuring(page, 'placeMarket', () =>
      expect(orderPanel.submitButton.click({ timeout: 2_000 })).rejects.toThrow(),
    );
    expect(sent).toBe(0);
  });
});
