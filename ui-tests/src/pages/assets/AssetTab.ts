import type { Locator, Page } from '@playwright/test';
import { BasePage } from '../BasePage';

/**
 * One of the bottom tabs (Open Positions, Pending Orders, Positions History, Orders & Deals).
 * Rows are always located by Order No., never by index, so other records on the account do not matter.
 */
export abstract class AssetTab<Column extends string> extends BasePage {
  protected abstract readonly tabId: string;
  protected abstract readonly rowId: string;
  protected abstract readonly orderIdColumn: string;
  protected abstract readonly columnPrefix: string;

  protected constructor(page: Page) {
    super(page);
  }

  get tab(): Locator {
    return this.testId(this.tabId);
  }

  get rows(): Locator {
    return this.testId(this.rowId);
  }

  async open(): Promise<void> {
    await this.tab.click();
  }

  row(orderId: string): Locator {
    return this.rows.filter({ has: this.page.getByTestId(this.orderIdColumn).getByText(orderId, { exact: true }) });
  }

  cell(orderId: string, column: Column): Locator {
    return this.row(orderId).getByTestId(`${this.columnPrefix}${column}`);
  }

  async text(orderId: string, column: Column): Promise<string> {
    return (await this.cell(orderId, column).innerText()).trim();
  }

  async number(orderId: string, column: Column): Promise<number> {
    return this.numberOf(this.cell(orderId, column));
  }

  /** Count shown in the tab label, e.g. "Open Positions (2)" → 2. Undefined for tabs without a count. */
  async count(): Promise<number | undefined> {
    const match = /\((\d+)\)/.exec(await this.tab.innerText());
    return match ? Number(match[1]) : undefined;
  }
}
