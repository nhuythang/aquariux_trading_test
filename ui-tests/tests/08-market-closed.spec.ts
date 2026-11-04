import { expect, test } from '@src/fixtures/trading.fixture';
import { captureResponse, requestsDuring } from '@src/api/capture';
import { instruments } from '@src/data/instruments';
import type { ApiEnvelope } from '@src/domain/models';
import { findClosedTradableSymbol, MARKET_CLOSED_ERROR, mockMarketClosed, mockTradeError } from '@src/mocks/market';

/**
 * A closed market cannot be waited for during a weekday run, so MC-01..03 make the backend report a
 * closed market with page.route (@mocked) and MC-04 checks a symbol that is really closed, when one exists.
 * Mocks change only the fields that matter and never let a trade request reach the backend.
 */
test.describe('Scope 8 – market closed', () => {
  test.use({ oneClick: false });

  test('MC-01 a symbol reported as closed cannot be traded: the panel is locked and nothing is sent @mocked', async ({
    page,
    trading,
    orderPanel,
  }) => {
    await mockMarketClosed(page, instruments.primary);
    const spec = await trading.selectSymbol(instruments.primary);
    expect(spec).toMatchObject({ status: 'CLOSED', tradable: false });

    await expect(orderPanel.restrictedNotice).toBeVisible();
    await expect(orderPanel.submitButton).toHaveText('Market Closed');
    await expect(orderPanel.submitButton).toBeDisabled();

    // Trying to press it is refused by the browser, and no trade request leaves the page.
    const sent = await requestsDuring(page, 'placeMarket', () =>
      expect(orderPanel.submitButton.click({ timeout: 2_000 })).rejects.toThrow(),
    );
    expect(sent).toBe(0);
  });

  test('MC-02 a market-closed rejection from the backend is shown and no position is added @mocked', async ({
    page,
    trading,
    orderPanel,
    dialogs,
    api,
    created, // safety net: if the mock ever failed to match, cleanup would still remove a real order
  }) => {
    const spec = await trading.selectSymbol(instruments.primary);
    const before = await api.openPositions();
    await mockTradeError(page, 'placeMarket', MARKET_CLOSED_ERROR);

    await orderPanel.open();
    await orderPanel.fill({ side: 'BUY', type: 'Market', volume: spec.minContractLotSize });
    await orderPanel.submit();
    await dialogs.confirmation.confirmButton.waitFor();
    const response = await captureResponse(page, 'placeMarket', () => dialogs.confirmation.confirm());

    // The answer is the mock's, so the order never reached the backend.
    const body = (await response.json()) as ApiEnvelope<unknown>;
    expect({ status: response.status(), code: body.code }).toEqual({
      status: MARKET_CLOSED_ERROR.status,
      code: MARKET_CLOSED_ERROR.code,
    });
    // The rejection surfaces as a toast whose description is the backend message.
    await expect(
      page.getByTestId('notification-box-description').filter({ hasText: MARKET_CLOSED_ERROR.message }),
    ).toBeVisible();
    expect((await api.openPositions()).map((p) => p.orderId)).toEqual(before.map((p) => p.orderId));
    expect(created.positions.size).toBe(0);
  });

  test('MC-03 pending orders cannot be placed on a closed symbol either @mocked', async ({
    page,
    trading,
    orderPanel,
  }) => {
    await mockMarketClosed(page, instruments.primary);
    await trading.selectSymbol(instruments.primary);
    await expect(orderPanel.restrictedNotice).toBeVisible();

    // The whole panel is covered: the order type cannot be switched to Limit/Stop, and the button stays locked.
    await expect(orderPanel.orderType.click({ trial: true, timeout: 2_000 })).rejects.toThrow();
    await expect(orderPanel.submitButton).toBeDisabled();
    const sent = await requestsDuring(page, 'placePending', () =>
      expect(orderPanel.submitButton.click({ timeout: 2_000 })).rejects.toThrow(),
    );
    expect(sent).toBe(0);
  });

  test('MC-04 a symbol that is really closed right now cannot be traded @live', async ({
    page,
    trading,
    orderPanel,
    api,
  }) => {
    const symbol = await findClosedTradableSymbol(api);
    // Depends on the calendar, so it is skipped (not failed) when nothing is closed; MC-01..03 cover it with mocks.
    // eslint-disable-next-line playwright/no-skipped-test
    test.skip(!symbol, 'No web-tradable symbol is closed at the moment.');

    const spec = await trading.selectSymbol(symbol!);
    expect(spec).toMatchObject({ status: 'CLOSED', tradable: false });
    await expect(orderPanel.restrictedNotice).toBeVisible();
    await expect(orderPanel.submitButton).toHaveText('Market Closed');
    await expect(orderPanel.submitButton).toBeDisabled();
    const sent = await requestsDuring(page, 'placeMarket', () =>
      expect(orderPanel.submitButton.click({ timeout: 2_000 })).rejects.toThrow(),
    );
    expect(sent).toBe(0);
  });
});
