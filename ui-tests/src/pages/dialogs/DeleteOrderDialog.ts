import type { Page } from '@playwright/test';
import { BasePage } from '../BasePage';

/** "Confirm To Delete Order" for a single pending order. */
export class DeleteOrderDialog extends BasePage {
  readonly root = this.dialogByTitle('Confirm To Delete Order');
  readonly confirmButton = this.root.getByRole('button', { name: /confirm/i });
  readonly cancelButton = this.root.getByRole('button', { name: /cancel/i });

  constructor(page: Page) {
    super(page);
  }

  async confirm(): Promise<void> {
    await this.confirmButton.click();
  }

  async cancel(): Promise<void> {
    await this.cancelButton.click();
  }
}
