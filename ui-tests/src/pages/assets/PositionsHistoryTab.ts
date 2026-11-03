import type { Page } from '@playwright/test';
import { AssetTab } from './AssetTab';

export type PositionsHistoryColumn =
  | 'open-date'
  | 'symbol'
  | 'close-date'
  | 'order-id'
  | 'order-type'
  | 'profit'
  | 'volume'
  | 'units'
  | 'entry-price'
  | 'close-price'
  | 'take-profit'
  | 'stop-loss'
  | 'swap'
  | 'commission'
  | 'remarks'
  | 'comment';

/** One row per position; a partially closed position is aggregated into a single row. */
export class PositionsHistoryTab extends AssetTab<PositionsHistoryColumn> {
  protected readonly tabId = 'tab-asset-order-type-history-positions-history';
  protected readonly rowId = 'asset-history-position-list-item';
  protected readonly orderIdColumn = 'asset-history-column-order-id';
  protected readonly columnPrefix = 'asset-history-column-';

  constructor(page: Page) {
    super(page);
  }
}
