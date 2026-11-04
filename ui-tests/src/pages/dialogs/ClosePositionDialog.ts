import { expect, type Page, type Request } from '@playwright/test';
import { endpoints } from '@src/api/endpoints';
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
   * can clear the field or swallow the click, so typing and confirming are retried together — but only
   * until a close request has actually left the browser, so a partial close is never sent twice.
   * MAX is not used: it does not always populate the field right after the dialog opens.
   */
  async closeVolume(lots: number): Promise<void> {
    let sent = false;
    const listener = (request: Request) => {
      if (request.method() === endpoints.closePosition.method && endpoints.closePosition.path.test(request.url())) {
        sent = true;
      }
    };
    this.page.on('request', listener);
    try {
      await expect(async () => {
        if (!sent) {
          await this.setVolume(lots);
          await this.confirmButton.click({ timeout: 1_000 });
        }
        await this.root.waitFor({ state: 'hidden', timeout: sent ? 10_000 : 3_000 });
      }).toPass({ timeout: 30_000 });
    } finally {
      this.page.off('request', listener);
    }
  }

  /** Dismisses the dialog if it is open (e.g. left behind by a failed step), so the page is usable again. */
  async dismissIfOpen(): Promise<void> {
    if (!(await this.root.isVisible())) return;
    await this.cancelButton.click({ timeout: 2_000 }).catch(() => this.page.keyboard.press('Escape'));
    await this.root.waitFor({ state: 'hidden', timeout: 5_000 });
  }

  async confirm(): Promise<void> {
    await this.confirmButton.click();
  }

  async cancel(): Promise<void> {
    await this.cancelButton.click();
  }
}
