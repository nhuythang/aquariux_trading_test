import type { Page } from '@playwright/test';
import { BasePage } from '../BasePage';

/**
 * "Edit Order" for a pending order. It reuses the order panel's input names and testids,
 * so every locator is scoped to the dialog. "Confirm" opens an Order Confirmation dialog on top.
 */
export class EditPendingOrderDialog extends BasePage {
  readonly root = this.page.getByRole('dialog', { name: 'Edit Order' });
  readonly orderId = this.testId('edit-order-id-value', this.root);
  readonly orderType = this.testId('edit-order-type-value', this.root);
  readonly volume = this.testId('edit-volume-value', this.root);
  readonly price = this.root.locator('input[name="price"]');
  readonly stopLoss = this.testId('trade-input-stoploss-price', this.root);
  readonly takeProfit = this.testId('trade-input-takeprofit-price', this.root);
  readonly confirmButton = this.testId('edit-button-order', this.root);
  readonly cancelButton = this.testId('edit-button-cancel', this.root);

  constructor(page: Page) {
    super(page);
  }

  async setValues(values: { price?: number; stopLoss?: number; takeProfit?: number }): Promise<void> {
    await this.root.waitFor();
    if (values.price !== undefined) await this.price.fill(String(values.price));
    if (values.stopLoss !== undefined) await this.stopLoss.fill(String(values.stopLoss));
    if (values.takeProfit !== undefined) await this.takeProfit.fill(String(values.takeProfit));
  }

  async confirm(): Promise<void> {
    await this.confirmButton.click();
  }

  async cancel(): Promise<void> {
    await this.cancelButton.click();
  }
}
