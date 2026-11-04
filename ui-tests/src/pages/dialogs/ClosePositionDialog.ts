import { expect, type Page } from '@playwright/test';
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

  /** Partial close when `lots` is below the position size. Typed, because the input ignores fill(). */
  async setVolume(lots: number): Promise<void> {
    await this.typeInto(this.volume, String(lots));
  }

  /**
   * Types `lots` and confirms. The app refetches the order lists right after a trade and that refresh
   * can clear the field, leaving Confirm disabled, so typing and confirming are retried together.
   * MAX is not used: it does not always populate the field right after the dialog opens.
   */
  async closeVolume(lots: number): Promise<void> {
    await expect(async () => {
      await this.setVolume(lots);
      await this.confirmButton.click({ timeout: 1_000 });
    }).toPass({ timeout: 15_000 });
    await this.root.waitFor({ state: 'hidden' });
  }

  async confirm(): Promise<void> {
    await this.confirmButton.click();
  }

  async cancel(): Promise<void> {
    await this.cancelButton.click();
  }
}
