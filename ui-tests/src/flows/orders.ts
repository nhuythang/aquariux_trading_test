import { expect, type Page } from '@playwright/test';
import { captureResult, requestsDuring } from '@src/api/capture';
import type { TraderApi } from '@src/api/client';
import type { OpenPosition, PendingOrder, SymbolDetail, TradeResult } from '@src/domain/models';
import { validStops } from '@src/domain/price';
import type { CreatedOrders, Dialogs } from '@src/fixtures/trading.fixture';
import type { OrderForm, OrderPanel } from '@src/pages/OrderPanel';

/**
 * Multi-step user actions reused by several specs. A flow drives page objects, captures the
 * backend response and registers what it created for cleanup. Business assertions stay in the specs;
 * flows only wait for state (expect.poll) before returning it.
 */

export interface FlowContext {
  page: Page;
  orderPanel: OrderPanel;
  dialogs: Dialogs;
  api: TraderApi;
  created: CreatedOrders;
}

export interface PlacedOrder {
  orderId: string;
  /** Quote on the panel just before confirming. */
  quote: { bid: number; ask: number };
  /** Label → value pairs from the Order Confirmation dialog. */
  confirmation: Record<string, string>;
  result: TradeResult;
}

/** Market or pending order through the Trade tab with the confirmation dialog (One-Click off). */
export async function placeOrder(ctx: FlowContext, symbol: string, form: OrderForm): Promise<PlacedOrder> {
  const endpoint = form.type === 'Market' ? 'placeMarket' : form.type === 'Limit' ? 'placeLimit' : 'placeStop';
  await ctx.orderPanel.open();
  await ctx.orderPanel.fill(form);
  await ctx.orderPanel.submit();
  await ctx.dialogs.confirmation.confirmButton.waitFor();
  const confirmation = await ctx.dialogs.confirmation.details();
  const quote = await ctx.orderPanel.quote();
  const result = await captureResult<TradeResult>(ctx.page, endpoint, () => ctx.dialogs.confirmation.confirm());
  const orderId = result.clOrdId;
  if (form.type === 'Market') ctx.created.position(orderId, symbol);
  else ctx.created.pendingOrder(orderId, symbol);
  return { orderId, quote, confirmation, result };
}

/**
 * Clicks submit on a form the test expects to be invalid and reports what happened.
 * The submit button is not always disabled on invalid input, so the checks that matter are
 * "no confirmation step" and "no trade request". A confirmation that does appear is cancelled,
 * so an invalid order is never placed.
 */
export async function attemptInvalidSubmit(
  ctx: Pick<FlowContext, 'page' | 'orderPanel' | 'dialogs'>,
): Promise<{ confirmationShown: boolean; requestsSent: number }> {
  let confirmationShown = false;
  const requestsSent = await requestsDuring(ctx.page, 'placeMarket', async () => {
    if (await ctx.orderPanel.submitButton.isEnabled()) await ctx.orderPanel.submit();
    confirmationShown = await ctx.dialogs.confirmation.confirmButton
      .waitFor({ timeout: 3_000 })
      .then(() => true)
      .catch(() => false);
    if (confirmationShown) await ctx.dialogs.confirmation.cancel();
  });
  return { confirmationShown, requestsSent };
}

/** Market order with SL/TP `distancePoints` away from the current price, on the correct side. */
export async function placeMarketWithStops(
  ctx: FlowContext,
  spec: SymbolDetail,
  side: OrderForm['side'],
  volume: number,
  distancePoints: number,
): Promise<PlacedOrder & { stopLoss: number; takeProfit: number }> {
  await ctx.orderPanel.open();
  const quote = await ctx.orderPanel.quote();
  const reference = side === 'BUY' ? quote.bid : quote.ask; // the side the UI validates SL against
  const { stopLoss, takeProfit } = validStops(side, reference, spec, distancePoints);
  const placed = await placeOrder(ctx, spec.symbol, { side, type: 'Market', volume, stopLoss, takeProfit });
  return { ...placed, stopLoss, takeProfit };
}

/** Waits until the order appears among open positions (the list is refreshed asynchronously). */
export async function waitForPosition(api: TraderApi, orderId: string, timeout = 15_000): Promise<OpenPosition> {
  let position: OpenPosition | undefined;
  await expect
    .poll(async () => (position = await api.openPosition(orderId)), { timeout, message: `position ${orderId}` })
    .toBeDefined();
  return position!;
}

export async function waitForPending(api: TraderApi, orderId: string, timeout = 15_000): Promise<PendingOrder> {
  let order: PendingOrder | undefined;
  await expect
    .poll(async () => (order = await api.pendingOrder(orderId)), { timeout, message: `pending order ${orderId}` })
    .toBeDefined();
  return order!;
}
