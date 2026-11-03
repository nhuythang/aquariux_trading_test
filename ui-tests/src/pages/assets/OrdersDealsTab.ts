import type { Page } from '@playwright/test';
import { AssetTab } from './AssetTab';

export type OrdersDealsColumn =
  | 'open-date'
  | 'symbol'
  | 'close-date'
  | 'order-id'
  | 'order-type'
  | 'state'
  | 'volume'
  | 'units'
  | 'fill-policy'
  | 'entry-price'
  | 'take-profit'
  | 'stop-loss'
  | 'profit'
  | 'swap'
  | 'commission'
  | 'remarks'
  | 'comment';

/** One row per order (opening, each closing order, cancelled pending), expandable to its deals. */
export class OrdersDealsTab extends AssetTab<OrdersDealsColumn> {
  protected readonly tabId = 'tab-asset-order-type-history-orders-and-deals';
  protected readonly rowId = 'asset-history-position-list-item';
  protected readonly orderIdColumn = 'asset-history-column-order-id';
  protected readonly columnPrefix = 'asset-history-column-';

  constructor(page: Page) {
    super(page);
  }

  async expand(orderId: string): Promise<void> {
    await this.row(orderId).getByTestId('asset-history-position-list-item-expand').click();
  }
}
