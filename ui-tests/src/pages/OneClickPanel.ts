import type { Page } from '@playwright/test';
import type { Side } from '@src/domain/models';
import { BasePage } from './BasePage';

/** "One Click" tab of the order panel; only present while One-Click Trading is on. */
export class OneClickPanel extends BasePage {
  readonly tab = this.testId('tab-one-click-trading');
  readonly volume = this.testId('trade-input-volume');
  readonly buyButton = this.testId('trade-button-oct-order-buy');
  readonly sellButton = this.testId('trade-button-oct-order-sell');

  constructor(page: Page) {
    super(page);
  }

  async open(): Promise<void> {
    await this.tab.click();
  }

  async setVolume(lots: number): Promise<void> {
    await this.typeInto(this.volume, String(lots));
  }

  /** Sends the order immediately: there is no confirmation dialog in one-click mode. */
  async trade(side: Side): Promise<void> {
    await (side === 'BUY' ? this.buyButton : this.sellButton).click();
  }
}
