import type { Page } from '@playwright/test';
import { BasePage } from '../BasePage';

export type DateRangePreset = 'All' | 'Last 7 days' | 'Last 30 days' | 'Last 90 days' | 'This year' | 'Last year';

/** Calendar icon above the history tabs: presets or a custom range, applied with APPLY. */
export class DateRangeFilter extends BasePage {
  readonly icon = this.testId('orders-date-picker-icon-calendar');
  readonly dropdown = this.testId('orders-date-picker-dropdown');
  readonly applyButton = this.testId('orders-date-picker-button-apply', this.dropdown);
  readonly cancelButton = this.testId('orders-date-picker-button-cancel', this.dropdown);
  readonly resetButton = this.testId('orders-date-picker-button-reset', this.dropdown);

  constructor(page: Page) {
    super(page);
  }

  /** Picks a preset; the presets have no testid, so they are matched by exact text inside the dropdown. */
  async choose(preset: DateRangePreset): Promise<void> {
    if (!(await this.dropdown.isVisible())) await this.icon.click();
    await this.dropdown.getByText(preset, { exact: true }).click();
    await this.applyButton.click();
    await this.dropdown.waitFor({ state: 'hidden' });
  }

  /**
   * Back to the app's default range (about the last 30 days). The choice is kept in the browser's local storage,
   * so a test that changes it puts it back rather than leave it for whatever runs next in that browser.
   */
  async reset(): Promise<void> {
    if (!(await this.dropdown.isVisible())) await this.icon.click();
    await this.resetButton.click();
    if (await this.dropdown.isVisible()) await this.applyButton.click();
    await this.dropdown.waitFor({ state: 'hidden' });
  }
}
