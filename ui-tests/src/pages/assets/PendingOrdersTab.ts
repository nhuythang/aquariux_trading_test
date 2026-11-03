import type { Page } from '@playwright/test';
import { AssetTab } from './AssetTab';

export type PendingOrderColumn =
  | 'open-date'
  | 'order-id'
  | 'symbol'
  | 'order-type'
  | 'volume'
  | 'units'
  | 'fill-policy'
  | 'expiry'
  | 'expiry-date'
  | 'entry-price'
  | 'current-price'
  | 'take-profit'
  | 'stop-loss';

export class PendingOrdersTab extends AssetTab<PendingOrderColumn> {
  protected readonly tabId = 'tab-asset-order-type-pending-orders';
  protected readonly rowId = 'asset-pending-list-item';
  protected readonly orderIdColumn = 'asset-pending-column-order-id';
  protected readonly columnPrefix = 'asset-pending-column-';

  readonly bulkDelete = this.testId('bulk-delete');

  constructor(page: Page) {
    super(page);
  }

  async edit(orderId: string): Promise<void> {
    await this.row(orderId).getByTestId('asset-pending-button-edit').click();
  }

  async delete(orderId: string): Promise<void> {
    await this.row(orderId).getByTestId('asset-pending-button-close').click();
  }
}
