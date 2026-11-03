import type { Page } from '@playwright/test';
import { AssetTab } from './AssetTab';

export type OpenPositionColumn =
  | 'open-date'
  | 'order-id'
  | 'symbol'
  | 'order-type'
  | 'profit'
  | 'roi'
  | 'volume'
  | 'units'
  | 'margin-used'
  | 'entry-price'
  | 'current-price'
  | 'take-profit'
  | 'stop-loss'
  | 'swap'
  | 'comment';

export type BulkCloseOption = 'All Positions' | 'Profitable Positions' | 'Loss Positions';

export class OpenPositionsTab extends AssetTab<OpenPositionColumn> {
  protected readonly tabId = 'tab-asset-order-type-open-positions';
  protected readonly rowId = 'asset-open-list-item';
  protected readonly orderIdColumn = 'asset-open-column-order-id';
  protected readonly columnPrefix = 'asset-open-column-';

  readonly bulkClose = this.testId('bulk-close');

  constructor(page: Page) {
    super(page);
  }

  async edit(orderId: string): Promise<void> {
    await this.row(orderId).getByTestId('asset-open-button-edit').click();
  }

  async close(orderId: string): Promise<void> {
    await this.row(orderId).getByTestId('asset-open-button-close').click();
  }

  /** Opens the Bulk Close menu and picks an option; the confirmation dialog follows. */
  async chooseBulkClose(option: BulkCloseOption): Promise<void> {
    await this.bulkClose.click();
    await this.page.getByText(option, { exact: true }).click();
  }
}
