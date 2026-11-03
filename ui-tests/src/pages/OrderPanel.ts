import type { Locator, Page } from '@playwright/test';
import type { Side } from '@src/domain/models';
import { BasePage } from './BasePage';

export type OrderTypeLabel = 'Market' | 'Limit' | 'Stop' | 'Stop Limit';
export type ExpiryLabel = 'Good Till Canceled' | 'Good Till Day' | 'Specified Date' | 'Specified Date and Time';

export interface OrderForm {
  side: Side;
  type: OrderTypeLabel;
  volume: number;
  price?: number;
  stopLoss?: number;
  takeProfit?: number;
  expiry?: ExpiryLabel;
}

/**
 * The "Trade" tab of the order panel.
 * The Edit Position dialog reuses the same input testids, so every locator is scoped to the panel root.
 * With One-Click Trading on, the panel opens on the "One Click" tab: call open() first.
 */
export class OrderPanel extends BasePage {
  readonly tab = this.testId('tab-trade');
  readonly root: Locator = this.page
    .locator('div')
    .filter({ has: this.page.getByTestId('tab-specification') })
    .filter({ has: this.page.getByTestId('trade-dropdown-order-type') })
    .last();

  readonly buyButton = this.testId('trade-button-order-buy', this.root);
  readonly sellButton = this.testId('trade-button-order-sell', this.root);
  readonly askPrice = this.testId('trade-live-buy-price', this.root);
  readonly bidPrice = this.testId('trade-live-sell-price', this.root);
  readonly orderType = this.testId('trade-dropdown-order-type', this.root);
  readonly volume = this.testId('trade-input-volume', this.root);
  readonly price = this.root.locator('input[name="price"]');
  readonly stopLossPrice = this.testId('trade-input-stoploss-price', this.root);
  readonly stopLossPoints = this.testId('trade-input-stoploss-points', this.root);
  readonly takeProfitPrice = this.testId('trade-input-takeprofit-price', this.root);
  readonly takeProfitPoints = this.testId('trade-input-takeprofit-points', this.root);
  readonly fillPolicy = this.testId('trade-dropdown-fill-policy', this.root);
  readonly expiry = this.testId('trade-dropdown-expiry', this.root);
  readonly submitButton = this.testId('trade-button-order', this.root);

  constructor(page: Page) {
    super(page);
  }

  async open(): Promise<void> {
    await this.tab.click();
    await this.orderType.waitFor();
  }

  async selectSide(side: Side): Promise<void> {
    await (side === 'BUY' ? this.buyButton : this.sellButton).click();
  }

  /** Dropdown options have no testid; they are picked by text inside the open dropdown only. */
  async selectOrderType(label: OrderTypeLabel): Promise<void> {
    await this.orderType.click();
    // The current value is also rendered as text; the open list comes after it.
    await this.orderType.getByText(label, { exact: true }).last().click();
  }

  async selectExpiry(label: ExpiryLabel): Promise<void> {
    await this.expiry.click();
    await this.expiry.getByText(label, { exact: true }).last().click();
  }

  /** Inline validation message under a field, e.g. "Stop Loss must be less than Sell Price." */
  validationMessage(text: RegExp): Locator {
    return this.root.getByText(text);
  }

  /** Live quote shown on the Buy/Sell buttons. */
  async quote(): Promise<{ bid: number; ask: number }> {
    return { bid: await this.numberOf(this.bidPrice), ask: await this.numberOf(this.askPrice) };
  }

  async setVolume(lots: number | string): Promise<void> {
    await this.typeInto(this.volume, String(lots));
  }

  /** Fill the form. Prices are entered as prices, never points (points are recomputed from the live quote). */
  async fill(form: OrderForm): Promise<void> {
    await this.selectOrderType(form.type);
    await this.selectSide(form.side);
    await this.setVolume(form.volume);
    if (form.price !== undefined) await this.price.fill(String(form.price));
    if (form.stopLoss !== undefined) await this.stopLossPrice.fill(String(form.stopLoss));
    if (form.takeProfit !== undefined) await this.takeProfitPrice.fill(String(form.takeProfit));
    if (form.expiry) await this.selectExpiry(form.expiry);
  }

  /** "PLACE BUY ORDER" / "PLACE SELL ORDER" when the form is valid, "STAY TUNED" otherwise. */
  async submitLabel(): Promise<string> {
    return (await this.submitButton.innerText()).trim();
  }

  async submit(): Promise<void> {
    await this.submitButton.click();
  }
}
