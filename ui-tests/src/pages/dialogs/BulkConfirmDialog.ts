import type { Page } from '@playwright/test';
import { BasePage } from '../BasePage';

/** Bulk Close / Bulk Delete confirmation. Shown even when One-Click Trading is on. */
export class BulkConfirmDialog extends BasePage {
  readonly confirmButton = this.testId('bulk-close-modal-button-submit-all');
  readonly cancelButton = this.testId('bulk-close-modal-button-cancel-all');

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
