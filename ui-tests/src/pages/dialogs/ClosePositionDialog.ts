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

  /** Partial close when `lots` is below the position size. Typed, because the input ignores fill(). */
  async setVolume(lots: number): Promise<void> {
    await this.typeInto(this.volume, String(lots));
  }

  /**
   * Close the whole position. MAX does not always populate the field when clicked right after the
   * dialog opens, so the full size is typed instead.
   */
  async closeAll(positionLots: number): Promise<void> {
    await this.setVolume(positionLots);
  }

  async confirm(): Promise<void> {
    await this.confirmButton.click();
  }

  async cancel(): Promise<void> {
    await this.cancelButton.click();
  }
}
