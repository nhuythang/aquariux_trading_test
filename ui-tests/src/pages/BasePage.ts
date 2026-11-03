import type { Locator, Page } from '@playwright/test';
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

  /** Innermost element that contains `title` and at least one button: the dialog's root. */
  protected dialogByTitle(title: string): Locator {
    return this.page
      .locator('div')
      .filter({ has: this.page.getByText(title, { exact: true }) })
      .filter({ has: this.page.getByRole('button') })
      .last();
  }
}
