import type { Page } from '@playwright/test';
import { BasePage } from '../BasePage';

/** Bulk Close / Bulk Delete confirmation. Shown even when One-Click Trading is on. */
export class BulkConfirmDialog extends BasePage {
  // The button testids carry the option (-all, -loss, ...), so the buttons are found by name instead.
  readonly root = this.page.getByRole('dialog');
  readonly confirmButton = this.root.getByRole('button', { name: 'Confirm' });
  readonly cancelButton = this.root.getByRole('button', { name: 'Cancel' });

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
