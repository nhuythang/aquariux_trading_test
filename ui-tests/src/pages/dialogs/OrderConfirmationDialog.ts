import type { Page } from '@playwright/test';
import { BasePage } from '../BasePage';

/** "Order Confirmation": shown before placing or modifying an order while One-Click Trading is off. */
export class OrderConfirmationDialog extends BasePage {
  readonly root = this.dialogByTitle('Order Confirmation');
  readonly symbol = this.testId('trade-confirmation-symbol');
  readonly orderType = this.testId('trade-confirmation-order-type');
  readonly labels = this.testId('trade-confirmation-label');
  readonly values = this.testId('trade-confirmation-value');
  readonly confirmButton = this.testId('trade-confirmation-button-confirm');
  readonly cancelButton = this.testId('trade-confirmation-button-close');

  constructor(page: Page) {
    super(page);
  }

  /** Label → value pairs shown in the dialog, e.g. { Volume: "0.2", "Stop Loss": "3,917.95" }. */
  async details(): Promise<Record<string, string>> {
    const labels = await this.labels.allInnerTexts();
    const values = await this.values.allInnerTexts();
    return Object.fromEntries(labels.map((label, i) => [label.trim(), (values[i] ?? '').trim()]));
  }

  async confirm(): Promise<void> {
    await this.confirmButton.click();
  }

  async cancel(): Promise<void> {
    await this.cancelButton.click();
  }
}
