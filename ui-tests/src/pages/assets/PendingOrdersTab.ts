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

export type BulkDeleteOption = 'All Orders' | 'Limit Orders' | 'Stop Orders' | 'Stop Limit Orders';

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
    await this.row(orderId).getByTestId('asset-open-button-edit').click();
  }

  /** Opens the Bulk Delete menu and picks an option; the confirmation dialog follows. */
  async chooseBulkDelete(option: BulkDeleteOption = 'All Orders'): Promise<void> {
    await this.bulkDelete.click();
    await this.page.getByText(option, { exact: true }).click();
  }

  async delete(orderId: string): Promise<void> {
    await this.row(orderId).getByTestId('asset-open-button-close').click();
  }
}
