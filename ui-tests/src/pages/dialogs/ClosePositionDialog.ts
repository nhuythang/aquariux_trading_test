import type { Page } from '@playwright/test';
import { BasePage } from '../BasePage';

/** "Confirm To Close Position": volume to close (any step-aligned value up to the position size). */
export class ClosePositionDialog extends BasePage {
  readonly root = this.dialogByTitle('Confirm To Close Position');
  readonly volume = this.root.locator('input').first();
  readonly maxButton = this.testId('close-order-input-volume-static-max', this.root);
  readonly confirmButton = this.root.getByRole('button', { name: /confirm/i });
  readonly cancelButton = this.root.getByRole('button', { name: /cancel/i });

  constructor(page: Page) {
    super(page);
  }

  /** Partial close when `lots` is below the position size. */
  async setVolume(lots: number): Promise<void> {
    await this.volume.fill(String(lots));
  }

  async closeAll(): Promise<void> {
    await this.maxButton.click();
  }

  async confirm(): Promise<void> {
    await this.confirmButton.click();
  }

  async cancel(): Promise<void> {
    await this.cancelButton.click();
  }
}
