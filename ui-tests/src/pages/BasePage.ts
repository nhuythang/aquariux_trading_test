import { expect, type Locator, type Page } from '@playwright/test';
import { parseUiNumber } from '@src/domain/price';

/** Shared helpers for page objects and components. Holds no assertions. */
export abstract class BasePage {
  protected constructor(protected readonly page: Page) {}

  protected testId(id: string, within: Page | Locator = this.page): Locator {
    return within.getByTestId(id);
  }

  /** Text of a cell as a number ("3,928.70" → 3928.7, "--" → NaN). */
  protected async numberOf(locator: Locator): Promise<number> {
    return parseUiNumber((await locator.innerText()).trim());
  }

  /**
   * Replace an input's value by typing it, as a user would. Some inputs (volume) only apply their
   * formatting and step rules to key events, so `fill()` is not enough for them.
   */
  protected async typeInto(input: Locator, text: string): Promise<void> {
    // The panel may re-render right after a tab or symbol change and drop what was typed, so the
    // value is checked and typed again until it sticks.
    await expect(async () => {
      await input.click();
      await input.press('ControlOrMeta+a');
      await input.press('Backspace');
      await input.pressSequentially(text);
      await expect(input).toHaveValue(text, { timeout: 1_000 });
    }).toPass({ timeout: 10_000 });
  }

  /** A modal (`role="dialog"`) identified by its title text. */
  protected dialogByTitle(title: string): Locator {
    return this.page.getByRole('dialog').filter({ has: this.page.getByText(title, { exact: true }) });
  }
}
