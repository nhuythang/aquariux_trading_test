import type { Page } from '@playwright/test';
import { BasePage } from '../BasePage';

/**
 * "Edit Position" / edit pending order. Reuses the order panel's input testids,
 * so every locator is scoped to the modal root.
 */
export class EditPositionDialog extends BasePage {
  readonly root = this.testId('edit-confirmation-modal');
  readonly orderId = this.testId('edit-order-id-value', this.root);
  readonly entryPrice = this.testId('edit-entry-price-value', this.root);
  readonly volume = this.testId('edit-volume-value', this.root);
  readonly price = this.root.locator('input[name="price"]');
  readonly stopLoss = this.testId('trade-input-stoploss-price', this.root);
  readonly takeProfit = this.testId('trade-input-takeprofit-price', this.root);
  /** Inline validation message, e.g. "Stop Loss must be less than Sell Price." */
  readonly validationMessage = this.root.getByText(/must be/);
  readonly updateButton = this.testId('edit-button-order', this.root);
  readonly cancelButton = this.testId('edit-button-cancel', this.root);

  constructor(page: Page) {
    super(page);
  }

  /** SL/TP inputs render shortly after the modal opens. */
  async waitUntilReady(): Promise<void> {
    await this.stopLoss.waitFor();
  }

  async setStops(stops: { stopLoss?: number; takeProfit?: number; price?: number }): Promise<void> {
    await this.waitUntilReady();
    if (stops.price !== undefined) await this.price.fill(String(stops.price));
    if (stops.stopLoss !== undefined) await this.stopLoss.fill(String(stops.stopLoss));
    if (stops.takeProfit !== undefined) await this.takeProfit.fill(String(stops.takeProfit));
  }

  async update(): Promise<void> {
    await this.updateButton.click();
  }

  async cancel(options?: { timeout?: number }): Promise<void> {
    await this.cancelButton.click(options);
  }
}
