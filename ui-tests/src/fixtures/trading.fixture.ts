import { expect, test as base } from '@playwright/test';
import { TraderApi } from '@src/api/client';
import { Recorder } from '@src/api/recorder';
import { NotificationPanel } from '@src/pages/NotificationPanel';
import { OneClickPanel } from '@src/pages/OneClickPanel';
import { OrderPanel } from '@src/pages/OrderPanel';
import { SettingsMenu } from '@src/pages/SettingsMenu';
import { TradingPage } from '@src/pages/TradingPage';
import { DateRangeFilter } from '@src/pages/assets/DateRangeFilter';
import { OpenPositionsTab } from '@src/pages/assets/OpenPositionsTab';
import { OrdersDealsTab } from '@src/pages/assets/OrdersDealsTab';
import { PendingOrdersTab } from '@src/pages/assets/PendingOrdersTab';
import { PositionsHistoryTab } from '@src/pages/assets/PositionsHistoryTab';
import { BulkConfirmDialog } from '@src/pages/dialogs/BulkConfirmDialog';
import { ClosePositionDialog } from '@src/pages/dialogs/ClosePositionDialog';
import { DeleteOrderDialog } from '@src/pages/dialogs/DeleteOrderDialog';
import { EditPendingOrderDialog } from '@src/pages/dialogs/EditPendingOrderDialog';
import { EditPositionDialog } from '@src/pages/dialogs/EditPositionDialog';
import { OrderConfirmationDialog } from '@src/pages/dialogs/OrderConfirmationDialog';

export interface Dialogs {
  confirmation: OrderConfirmationDialog;
  edit: EditPositionDialog;
  editPending: EditPendingOrderDialog;
  close: ClosePositionDialog;
  deleteOrder: DeleteOrderDialog;
  bulk: BulkConfirmDialog;
}

export interface Assets {
  openPositions: OpenPositionsTab;
  pendingOrders: PendingOrdersTab;
  positionsHistory: PositionsHistoryTab;
  ordersDeals: OrdersDealsTab;
  dateFilter: DateRangeFilter;
}

/** IDs created by the test; teardown removes exactly these. */
export class CreatedOrders {
  readonly positions = new Map<string, string>();
  readonly pending = new Map<string, string>();

  position(orderId: string, symbol: string): string {
    this.positions.set(orderId, symbol);
    return orderId;
  }

  pendingOrder(orderId: string, symbol: string): string {
    this.pending.set(orderId, symbol);
    return orderId;
  }
}

interface TradingFixtures {
  /** One-Click Trading state the test needs; `undefined` leaves the account as it is. */
  oneClick: boolean | undefined;
  trading: TradingPage;
  orderPanel: OrderPanel;
  oneClickPanel: OneClickPanel;
  settings: SettingsMenu;
  notifications: NotificationPanel;
  assets: Assets;
  dialogs: Dialogs;
  api: TraderApi;
  created: CreatedOrders;
  recorder: Recorder;
}

export const test = base.extend<TradingFixtures>({
  oneClick: [undefined, { option: true }],

  api: async ({ page }, use) => {
    const api = new TraderApi(page, page.request);
    await use(api);
    api.dispose();
  },

  trading: async ({ page, api, oneClick }, use) => {
    const trading = new TradingPage(page);
    await trading.open();
    await api.ready();
    if (oneClick !== undefined) await new SettingsMenu(page).setOneClick(oneClick);
    await use(trading);
  },

  orderPanel: async ({ page }, use) => use(new OrderPanel(page)),
  oneClickPanel: async ({ page }, use) => use(new OneClickPanel(page)),
  settings: async ({ page }, use) => use(new SettingsMenu(page)),
  notifications: async ({ page }, use) => use(new NotificationPanel(page)),

  assets: async ({ page }, use) =>
    use({
      openPositions: new OpenPositionsTab(page),
      pendingOrders: new PendingOrdersTab(page),
      positionsHistory: new PositionsHistoryTab(page),
      ordersDeals: new OrdersDealsTab(page),
      dateFilter: new DateRangeFilter(page),
    }),

  dialogs: async ({ page }, use) =>
    use({
      confirmation: new OrderConfirmationDialog(page),
      edit: new EditPositionDialog(page),
      editPending: new EditPendingOrderDialog(page),
      close: new ClosePositionDialog(page),
      deleteOrder: new DeleteOrderDialog(page),
      bulk: new BulkConfirmDialog(page),
    }),

  /**
   * Teardown removes only what the test created: pending orders through the API,
   * positions through the UI Close action. Runs even when the test failed.
   * Success is judged by the API, never by a row disappearing (list refreshes hide rows briefly),
   * and anything still open at the end fails the test so a leak cannot go unnoticed.
   *
   * Flows register an order once its response arrives. An order can still exist without one
   * (response timed out, a pending order filled into a new position), so the account is
   * snapshotted before the test and anything that appeared since is adopted for cleanup too.
   * Tests run one at a time on the account (workers: 1), so a new order can only be this test's.
   */
  created: async ({ trading, api, assets, dialogs }, use, testInfo) => {
    await trading.selectedSymbol.waitFor();
    const [positionsBefore, pendingBefore] = await Promise.all([api.openPositions(), api.pendingOrders()]);
    const existing = new Set([...positionsBefore, ...pendingBefore].map((o) => o.orderId));

    const created = new CreatedOrders();
    await use(created);

    const [positionsAfter, pendingAfter] = await Promise.all([api.openPositions(), api.pendingOrders()]);
    for (const p of positionsAfter) {
      if (existing.has(p.orderId) || created.positions.has(p.orderId)) continue;
      created.position(p.orderId, p.symbol);
      testInfo.annotations.push({
        type: 'cleanup',
        description: `adopted untracked position ${p.orderId} ${p.symbol}`,
      });
    }
    for (const o of pendingAfter) {
      if (existing.has(o.orderId) || created.pending.has(o.orderId)) continue;
      created.pendingOrder(o.orderId, o.symbol);
      testInfo.annotations.push({
        type: 'cleanup',
        description: `adopted untracked pending order ${o.orderId} ${o.symbol}`,
      });
    }

    for (const [orderId, symbol] of created.pending) {
      if (await api.pendingOrder(orderId)) await api.deletePending(symbol, orderId);
    }

    for (const orderId of created.positions.keys()) {
      await expect(async () => {
        const position = await api.openPosition(orderId);
        if (!position) return;
        // A dialog left open by a failed step covers the page; clear it before using the list.
        await dialogs.close.dismissIfOpen();
        await assets.openPositions.open();
        await assets.openPositions.close(orderId);
        // With One-Click Trading on, Close acts immediately; otherwise a dialog asks for the volume.
        await dialogs.close.root.or(assets.openPositions.row(orderId)).first().waitFor();
        if (await dialogs.close.root.isVisible()) await dialogs.close.closeVolume(position.lotSize);
        await expect.poll(() => api.openPosition(orderId), { timeout: 10_000 }).toBeUndefined();
      }).toPass({ timeout: 60_000 });
    }

    const leftovers = [
      ...(await api.openPositions()).filter((p) => created.positions.has(p.orderId)).map((p) => p.orderId),
      ...(await api.pendingOrders()).filter((o) => created.pending.has(o.orderId)).map((o) => o.orderId),
    ];
    expect(leftovers, 'orders created by this test are still open after cleanup').toEqual([]);
  },

  recorder: async ({}, use, testInfo) => {
    const id = testInfo.title.split(' ')[0] ?? testInfo.testId;
    const recorder = new Recorder(id);
    await use(recorder);
    const file = recorder.save();
    if (file) await testInfo.attach('records', { path: file, contentType: 'application/json' });
  },
});

export { expect } from '@playwright/test';
