import { test as base } from '@playwright/test';
import { TraderApi } from '@src/api/client';
import { Recorder } from '@src/api/recorder';
import { NotificationPanel } from '@src/pages/NotificationPanel';
import { OneClickPanel } from '@src/pages/OneClickPanel';
import { OrderPanel } from '@src/pages/OrderPanel';
import { SettingsMenu } from '@src/pages/SettingsMenu';
import { TradingPage } from '@src/pages/TradingPage';
import { OpenPositionsTab } from '@src/pages/assets/OpenPositionsTab';
import { OrdersDealsTab } from '@src/pages/assets/OrdersDealsTab';
import { PendingOrdersTab } from '@src/pages/assets/PendingOrdersTab';
import { PositionsHistoryTab } from '@src/pages/assets/PositionsHistoryTab';
import { BulkConfirmDialog } from '@src/pages/dialogs/BulkConfirmDialog';
import { ClosePositionDialog } from '@src/pages/dialogs/ClosePositionDialog';
import { DeleteOrderDialog } from '@src/pages/dialogs/DeleteOrderDialog';
import { EditPositionDialog } from '@src/pages/dialogs/EditPositionDialog';
import { OrderConfirmationDialog } from '@src/pages/dialogs/OrderConfirmationDialog';

export interface Dialogs {
  confirmation: OrderConfirmationDialog;
  edit: EditPositionDialog;
  close: ClosePositionDialog;
  deleteOrder: DeleteOrderDialog;
  bulk: BulkConfirmDialog;
}

export interface Assets {
  openPositions: OpenPositionsTab;
  pendingOrders: PendingOrdersTab;
  positionsHistory: PositionsHistoryTab;
  ordersDeals: OrdersDealsTab;
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
    }),

  dialogs: async ({ page }, use) =>
    use({
      confirmation: new OrderConfirmationDialog(page),
      edit: new EditPositionDialog(page),
      close: new ClosePositionDialog(page),
      deleteOrder: new DeleteOrderDialog(page),
      bulk: new BulkConfirmDialog(page),
    }),

  /**
   * Teardown removes only what the test created: pending orders through the API,
   * positions through the UI Close action. Runs even when the test failed.
   */
  created: async ({ api, assets, dialogs }, use) => {
    const created = new CreatedOrders();
    await use(created);

    for (const [orderId, symbol] of created.pending) {
      if (await api.pendingOrder(orderId)) await api.deletePending(symbol, orderId);
    }
    if (created.positions.size === 0) return;
    await assets.openPositions.open();
    for (const orderId of created.positions.keys()) {
      const position = await api.openPosition(orderId);
      if (!position) continue;
      const row = assets.openPositions.row(orderId);
      await assets.openPositions.close(orderId);
      // With One-Click Trading on, Close acts immediately; otherwise a dialog asks for the volume.
      await dialogs.close.root.or(row).first().waitFor();
      if (await dialogs.close.confirmButton.isVisible()) {
        await dialogs.close.closeAll(position.lotSize);
        await dialogs.close.confirm();
      }
      await row.waitFor({ state: 'detached' });
    }
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
