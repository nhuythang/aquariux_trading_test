import { expect, type Page } from '@playwright/test';
import { captureResponse, captureResult, requestsDuring } from '@src/api/capture';
import type { TraderApi } from '@src/api/client';
import type {
  ApiEnvelope,
  BulkCloseResult,
  BulkDeleteResult,
  OpenPosition,
  PendingOrder,
  SymbolDetail,
  TradeResult,
} from '@src/domain/models';
import { parseUiNumber, validStops } from '@src/domain/price';
import type { CreatedOrders, Dialogs } from '@src/fixtures/trading.fixture';
import type { OrderForm, OrderPanel } from '@src/pages/OrderPanel';
import type { BulkCloseOption, OpenPositionsTab } from '@src/pages/assets/OpenPositionsTab';
import type { BulkDeleteOption, PendingOrdersTab } from '@src/pages/assets/PendingOrdersTab';

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
  const endpoint = form.type === 'Market' ? 'placeMarket' : 'placePending';
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

/**
 * Submits a form the panel does not validate and confirms it, so the backend decides.
 * Returns the trade response (status and error code) instead of throwing on a rejection.
 */
export async function placeRejectedOrder(
  ctx: Pick<FlowContext, 'page' | 'orderPanel' | 'dialogs'>,
  form: OrderForm,
): Promise<{ status: number; code: string; message: string | undefined }> {
  await ctx.orderPanel.open();
  await ctx.orderPanel.fill(form);
  await ctx.orderPanel.submit();
  await ctx.dialogs.confirmation.confirmButton.waitFor();
  const response = await captureResponse(ctx.page, 'placePending', () => ctx.dialogs.confirmation.confirm());
  const body = (await response.json()) as ApiEnvelope<unknown>;
  return { status: response.status(), code: body.code, message: body.message };
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

/** Edits a pending order through its row's Edit button, then confirms. */
export async function editPendingOrder(
  ctx: Pick<FlowContext, 'page' | 'dialogs'> & { pendingOrders: PendingOrdersTab },
  orderId: string,
  changes: { price?: number; stopLoss?: number; takeProfit?: number },
): Promise<void> {
  await ctx.pendingOrders.open();
  // After a trade the app refetches the order lists several times over ~1.5 s. A refresh resets the open
  // Edit Order form to the stored values (typed input is lost, a stale validation error blocks Confirm) or
  // closes the dialog altogether. So the edit is repeated until the Order Confirmation shows exactly
  // what was entered.
  const expected: Array<[string, number | undefined]> = [
    ['Price', changes.price],
    ['Stop Loss', changes.stopLoss],
    ['Take Profit', changes.takeProfit],
  ];
  await expect(async () => {
    if (!(await ctx.dialogs.editPending.root.isVisible())) await ctx.pendingOrders.edit(orderId);
    await ctx.dialogs.editPending.setValues(changes);
    await ctx.dialogs.editPending.confirm();
    await ctx.dialogs.confirmation.confirmButton.waitFor({ timeout: 2_000 });
    const shown = await ctx.dialogs.confirmation.details();
    const matches = expected.every(
      ([label, value]) => value === undefined || parseUiNumber(shown[label] ?? '') === value,
    );
    if (!matches) await ctx.dialogs.confirmation.cancel();
    expect(matches, 'confirmation shows the edited values').toBe(true);
  }).toPass({ timeout: 20_000 });
  // The Edit Order dialog stays open underneath an Order Confirmation that applies the change.
  await captureResult(ctx.page, 'modifyPending', () => ctx.dialogs.confirmation.confirm());
  await ctx.dialogs.editPending.root.waitFor({ state: 'hidden' });
}

/** Deletes a pending order through its row's Delete button and the confirmation dialog. */
export async function deletePendingOrder(
  ctx: Pick<FlowContext, 'page' | 'dialogs'> & { pendingOrders: PendingOrdersTab },
  orderId: string,
): Promise<void> {
  await ctx.pendingOrders.open();
  await captureResponse(ctx.page, 'deletePending', async () => {
    await ctx.pendingOrders.delete(orderId);
    await ctx.dialogs.deleteOrder.confirm();
  });
  await ctx.pendingOrders.row(orderId).waitFor({ state: 'detached' });
}

/**
 * Edits SL/TP of an open position (Edit Position → Order Confirmation → PATCH /market).
 * Like pending edits, a list refresh can reset the dialog, so the edit is repeated until the
 * Order Confirmation shows the entered values.
 */
export async function editPosition(
  ctx: Pick<FlowContext, 'page' | 'dialogs'> & { openPositions: OpenPositionsTab },
  orderId: string,
  changes: { stopLoss?: number; takeProfit?: number },
): Promise<TradeResult> {
  await ctx.openPositions.open();
  const expected: Array<[string, number | undefined]> = [
    ['Stop Loss', changes.stopLoss],
    ['Take Profit', changes.takeProfit],
  ];
  await expect(async () => {
    if (!(await ctx.dialogs.edit.root.isVisible())) await ctx.openPositions.edit(orderId);
    await ctx.dialogs.edit.setStops(changes);
    await ctx.dialogs.edit.update();
    await ctx.dialogs.confirmation.confirmButton.waitFor({ timeout: 2_000 });
    const shown = await ctx.dialogs.confirmation.details();
    const matches = expected.every(
      ([label, value]) => value === undefined || parseUiNumber(shown[label] ?? '') === value,
    );
    if (!matches) await ctx.dialogs.confirmation.cancel();
    expect(matches, 'confirmation shows the edited values').toBe(true);
  }).toPass({ timeout: 20_000 });
  const result = await captureResult<TradeResult>(ctx.page, 'modifyPosition', () => ctx.dialogs.confirmation.confirm());
  await ctx.dialogs.edit.root.waitFor({ state: 'hidden' });
  return result;
}

/**
 * Tries an SL/TP change the test expects to be refused. The dialog validates inline and leaves
 * Update Position clickable, so the flow reports the inline message and whether clicking Update
 * still led to a confirmation or a request. A confirmation that does appear is cancelled.
 */
export async function attemptPositionEdit(
  ctx: Pick<FlowContext, 'page' | 'dialogs'> & { openPositions: OpenPositionsTab },
  orderId: string,
  changes: { stopLoss?: number; takeProfit?: number },
): Promise<{ message: string; confirmationShown: boolean; requestsSent: number }> {
  await ctx.openPositions.open();
  let message = '';
  // A list refresh right after a trade can reset or close the dialog, which drops the message.
  await expect(async () => {
    if (!(await ctx.dialogs.edit.root.isVisible())) await ctx.openPositions.edit(orderId);
    await ctx.dialogs.edit.setStops(changes);
    message = await ctx.dialogs.edit.validationMessage.innerText({ timeout: 2_000 });
  }).toPass({ timeout: 20_000 });
  let confirmationShown = false;
  const requestsSent = await requestsDuring(ctx.page, 'modifyPosition', async () => {
    await ctx.dialogs.edit.update();
    confirmationShown = await ctx.dialogs.confirmation.confirmButton
      .waitFor({ timeout: 3_000 })
      .then(() => true)
      .catch(() => false);
    if (confirmationShown) await ctx.dialogs.confirmation.cancel();
  });
  // The dialog may already have been closed by a list refresh; either way it must not stay open.
  await ctx.dialogs.edit.cancel({ timeout: 2_000 }).catch(() => undefined);
  await ctx.dialogs.edit.root.waitFor({ state: 'hidden' });
  return { message, confirmationShown, requestsSent };
}

/** Closes `lots` of a position through its Close button (One-Click off). Returns the PUT result. */
export async function closePosition(
  ctx: Pick<FlowContext, 'page' | 'dialogs'> & { openPositions: OpenPositionsTab },
  orderId: string,
  lots: number,
): Promise<TradeResult> {
  await ctx.openPositions.open();
  await ctx.openPositions.close(orderId);
  return captureResult<TradeResult>(ctx.page, 'closePosition', () => ctx.dialogs.close.closeVolume(lots));
}

/** Bulk Close with the chosen option; returns the IDs the backend closed. */
export async function bulkClose(
  ctx: Pick<FlowContext, 'page' | 'dialogs'> & { openPositions: OpenPositionsTab },
  option: BulkCloseOption,
): Promise<BulkCloseResult> {
  await ctx.openPositions.open();
  await ctx.openPositions.chooseBulkClose(option);
  return captureResult<BulkCloseResult>(ctx.page, 'bulkClose', () => ctx.dialogs.bulk.confirm());
}

/**
 * Bulk Close that also returns the account's positions right before and right after the click, for
 * options that depend on live P/L. The app picks the positions from its own price feed and the backend
 * refuses the request (HTTP 400, "No orders are closed") when none of them is still in the requested
 * state, so the click is repeated with a fresh snapshot until something is closed.
 */
export async function bulkCloseBracketed(
  ctx: Pick<FlowContext, 'page' | 'dialogs' | 'api'> & { openPositions: OpenPositionsTab },
  option: BulkCloseOption,
): Promise<{ before: OpenPosition[]; result: BulkCloseResult; after: OpenPosition[] }> {
  let outcome: { before: OpenPosition[]; result: BulkCloseResult } | undefined;
  await expect(async () => {
    await ctx.openPositions.open();
    const before = await ctx.api.openPositions();
    await ctx.openPositions.chooseBulkClose(option);
    const response = await captureResponse(ctx.page, 'bulkClose', () => ctx.dialogs.bulk.confirm());
    const body = (await response.json()) as ApiEnvelope<BulkCloseResult>;
    await ctx.dialogs.bulk.root.waitFor({ state: 'hidden', timeout: 5_000 });
    expect(body.code, `bulk close accepted (${body.message ?? ''})`).toBe('200');
    outcome = { before, result: body.result };
  }).toPass({ timeout: 40_000 });
  return { ...outcome!, after: await ctx.api.openPositions() };
}

/** Bulk Delete of pending orders with the chosen option; returns the IDs the backend deleted. */
export async function bulkDeletePending(
  ctx: Pick<FlowContext, 'page' | 'dialogs'> & { pendingOrders: PendingOrdersTab },
  option: BulkDeleteOption = 'All Orders',
): Promise<BulkDeleteResult> {
  await ctx.pendingOrders.open();
  await ctx.pendingOrders.chooseBulkDelete(option);
  return captureResult<BulkDeleteResult>(ctx.page, 'bulkDeletePending', () => ctx.dialogs.bulk.confirm());
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
