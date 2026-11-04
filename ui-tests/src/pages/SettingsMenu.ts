import { expect, type Page } from '@playwright/test';
import { BasePage } from './BasePage';

/** Gear menu in the header. The One-Click toggle's testid encodes its state. */
export class SettingsMenu extends BasePage {
  readonly trigger = this.testId('app-setting-dropdown-trigger');
  readonly oneClickOff = this.testId('toggle-oct');
  readonly oneClickOn = this.testId('toggle-oct-checked');
  readonly termsDialog = this.dialogByTitle('One-Click Trading');

  constructor(page: Page) {
    super(page);
  }

  private async openMenu(): Promise<void> {
    const toggle = this.oneClickOff.or(this.oneClickOn);
    // A click right after the page loads can be lost before the header is interactive, so it is retried.
    await expect(async () => {
      if (!(await toggle.isVisible())) await this.trigger.click();
      await toggle.waitFor({ timeout: 3_000 });
    }).toPass({ timeout: 15_000 });
  }

  private async closeMenu(): Promise<void> {
    await this.trigger.click();
  }

  async isOneClickEnabled(): Promise<boolean> {
    await this.openMenu();
    const enabled = await this.oneClickOn.isVisible();
    await this.closeMenu();
    return enabled;
  }

  /** Switch One-Click Trading to `enabled`, accepting the terms dialog if it appears. */
  async setOneClick(enabled: boolean): Promise<void> {
    await this.openMenu();
    const current = await this.oneClickOn.isVisible();
    if (current !== enabled) {
      await (current ? this.oneClickOn : this.oneClickOff).click();
      const agree = this.page.getByRole('button', { name: /agree and continue/i });
      const target = enabled ? this.oneClickOn : this.oneClickOff;
      await agree.or(target).first().waitFor();
      if (await agree.isVisible()) {
        await agree.click();
        await agree.waitFor({ state: 'hidden' });
      }
      // Accepting the terms closes the menu; reopen it to confirm the new state.
      await this.openMenu();
      await target.waitFor();
    }
    await this.closeMenu();
  }
}
