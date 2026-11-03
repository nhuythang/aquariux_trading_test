import type { Locator, Page } from '@playwright/test';
import { BasePage } from './BasePage';

export type NotificationTitle = 'Position Created' | 'Position Closed';

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
    let items = this.items.filter({ hasText: `Order No. ${orderId}` });
    if (title)
      items = items.filter({ has: this.page.getByTestId('notification-list-result-item-title').getByText(title) });
    return items;
  }
}
