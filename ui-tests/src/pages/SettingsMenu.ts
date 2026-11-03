import type { Page } from '@playwright/test';
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
    if (!(await this.oneClickOff.or(this.oneClickOn).isVisible())) await this.trigger.click();
    await this.oneClickOff.or(this.oneClickOn).waitFor();
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
      if (await agree.isVisible()) await agree.click();
      await target.waitFor();
    }
    await this.closeMenu();
  }
}
