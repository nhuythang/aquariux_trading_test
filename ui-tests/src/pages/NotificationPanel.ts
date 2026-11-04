import type { Locator, Page } from '@playwright/test';
import { parseUiNumber } from '@src/domain/price';
import { BasePage } from './BasePage';

export type NotificationTitle = 'Position Created' | 'Position Closed';

/** What one notification item shows, e.g. "Position Closed +4.10 · XAUUSD | Order No. 2803089 · BUY 0.1 volume(s) at 3,945.29". */
export interface NotificationItem {
  title: string;
  /** Realised P/L, only on "Position Closed". */
  profit?: number;
  symbol: string;
  orderId: string;
  side: string;
  volume: number;
  /** Price exactly as printed ("3,945.29"). */
  price: string;
}

/** Bell menu. The "Positions" tab lists order notifications for the last 30 days. */
export class NotificationPanel extends BasePage {
  readonly bell = this.testId('notification-selector');
  readonly panel = this.testId('notification-dropdown-result');
  readonly positionsTab = this.testId('tab-notification-type-order');
  readonly items = this.testId('notification-list-result-item');

  constructor(page: Page) {
    super(page);
  }

  async open(): Promise<void> {
    if (!(await this.panel.isVisible())) await this.bell.click();
    await this.positionsTab.click();
  }

  async close(): Promise<void> {
    if (await this.panel.isVisible()) await this.bell.click();
  }

  /** Notifications for one order, newest first, e.g. "Position Closed … Order No. 2646959". */
  forOrder(orderId: string, title?: NotificationTitle): Locator {
    let items = this.items.filter({
      has: this.page.getByTestId('notification-list-result-item-meta').getByText(new RegExp(`Order No\\. ${orderId}$`)),
    });
    if (title)
      items = items.filter({ has: this.page.getByTestId('notification-list-result-item-title').getByText(title) });
    return items;
  }

  /** Reads an item into its fields. The body has no testids, so it is split by line. */
  async read(item: Locator): Promise<NotificationItem> {
    const title = (await item.getByTestId('notification-list-result-item-title').innerText()).trim();
    const meta = (await item.getByTestId('notification-list-result-item-meta').innerText()).trim();
    const [symbol = '', orderPart = ''] = meta.split('|').map((part) => part.trim());
    const lines = (await item.innerText())
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean);
    const profitLine = title === 'Position Closed' ? lines[lines.indexOf(title) + 1] : undefined;
    const side = lines.find((line) => line === 'BUY' || line === 'SELL') ?? '';
    const volumeLine = lines.find((line) => line.endsWith('volume(s)')) ?? '';
    const price = lines[lines.indexOf('at') + 1] ?? '';
    return {
      title,
      profit: profitLine === undefined ? undefined : parseUiNumber(profitLine),
      symbol,
      orderId: orderPart.replace('Order No.', '').trim(),
      side,
      volume: parseUiNumber(volumeLine.replace('volume(s)', '')),
      price,
    };
  }
}
