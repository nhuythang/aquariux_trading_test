import { expect, test } from '@src/fixtures/trading.fixture';
import { captureResult, requestsDuring } from '@src/api/capture';
import { instruments } from '@src/data/instruments';
import { ORDER_TYPE, type Side, type SymbolDetail, type TradeResult } from '@src/domain/models';
import { waitForPosition } from '@src/flows/orders';

test.describe('Scope 2 – market orders with One-Click Trading', () => {
  let spec: SymbolDetail;

  test.describe('One-Click on', () => {
    test.use({ oneClick: true });

    test.beforeEach(async ({ trading }) => {
      spec = await trading.selectSymbol(instruments.primary);
    });

    for (const [id, side] of [
      ['OC-01', 'BUY'],
      ['OC-02', 'SELL'],
    ] as const satisfies ReadonlyArray<readonly [string, Side]>) {
      test(`${id} One-Click ${side} executes immediately without a confirmation dialog @live`, async ({
        page,
        oneClickPanel,
        dialogs,
        api,
        created,
        assets,
        recorder,
      }) => {
        const volume = spec.minContractLotSize;
        await oneClickPanel.open();
        await oneClickPanel.setVolume(volume);

        const result = await captureResult<TradeResult>(page, 'placeMarket', () => oneClickPanel.trade(side));
        const orderId = created.position(result.clOrdId, spec.symbol);

        // The request went out on the click itself: no dialog was involved.
        await expect(dialogs.confirmation.confirmButton).toBeHidden();

        const position = await waitForPosition(api, orderId);
        recorder.add('position', position);
        expect(position).toMatchObject({
          symbol: spec.symbol,
          orderType: side === 'BUY' ? ORDER_TYPE.BUY : ORDER_TYPE.SELL,
          lotSize: volume,
          stopLoss: 0,
          takeProfit: 0,
        });

        await assets.openPositions.open();
        await expect(assets.openPositions.cell(orderId, 'order-type')).toHaveText(side);
        await expect(assets.openPositions.cell(orderId, 'volume')).toHaveText(String(volume));
      });
    }

    test('OC-04 One-Click setting persists after a page reload @live', async ({
      page,
      settings,
      oneClickPanel,
      trading,
    }) => {
      await page.reload();
      await trading.selectedSymbol.waitFor();
      await expect(oneClickPanel.tab).toBeVisible();
      expect(await settings.isOneClickEnabled()).toBe(true);
    });
  });

  test.describe('One-Click off', () => {
    test.use({ oneClick: false });

    test('OC-03 without One-Click the order needs confirmation and cancel places nothing @live', async ({
      page,
      trading,
      oneClickPanel,
      orderPanel,
      dialogs,
    }) => {
      spec = await trading.selectSymbol(instruments.primary);
      await expect(oneClickPanel.tab).toBeHidden();

      await orderPanel.open();
      await orderPanel.fill({ side: 'BUY', type: 'Market', volume: spec.minContractLotSize });
      const sent = await requestsDuring(page, 'placeMarket', async () => {
        await orderPanel.submit();
        await expect(dialogs.confirmation.confirmButton).toBeVisible();
        await dialogs.confirmation.cancel();
        await expect(dialogs.confirmation.confirmButton).toBeHidden();
      });
      expect(sent).toBe(0);
    });
  });
});
