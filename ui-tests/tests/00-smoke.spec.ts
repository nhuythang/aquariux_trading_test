import { expect, test } from '@src/fixtures/trading.fixture';
import { instruments } from '@src/data/instruments';

test.describe('Framework smoke', () => {
  test.use({ oneClick: false });

  test('SM-01 session, symbol spec and live quote are available @live', async ({
    trading,
    orderPanel,
    settings,
    api,
  }) => {
    expect(await settings.isOneClickEnabled()).toBe(false);

    const spec = await trading.selectSymbol(instruments.primary);
    await expect(trading.selectedSymbol).toHaveText(instruments.primary);
    expect(spec.symbol).toBe(instruments.primary);
    expect(spec.minContractLotSize).toBeGreaterThan(0);
    expect(spec.pointStep).toBeGreaterThan(0);

    await orderPanel.open();
    const quote = await orderPanel.quote();
    expect(quote.ask).toBeGreaterThanOrEqual(quote.bid);

    const counts = await api.counts();
    expect(counts.marketOrderCounts).toBeGreaterThanOrEqual(0);
  });
});
