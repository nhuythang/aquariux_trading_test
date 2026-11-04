import type { Page } from '@playwright/test';
import { captureResult } from '@src/api/capture';
import type { SymbolDetail } from '@src/domain/models';
import { BasePage } from './BasePage';

/** Trade screen shell: symbol search, selected symbol, account bar. */
export class TradingPage extends BasePage {
  readonly symbolSearch = this.testId('symbol-input-search');
  readonly searchResults = this.testId('symbol-dropdown-result');
  readonly selectedSymbol = this.testId('symbol-overview-id');
  readonly equity = this.testId('account-info-equity-value');
  readonly profitLoss = this.testId('account-info-profit-loss-value');

  constructor(page: Page) {
    super(page);
  }

  /**
   * The demo server sometimes renders the header but never the symbol overview on first load;
   * a reload recovers it, so the page is loaded once more before giving up.
   */
  async open(): Promise<void> {
    await this.page.goto('/web/trade');
    try {
      await this.selectedSymbol.waitFor({ timeout: 20_000 });
    } catch {
      await this.page.reload();
      await this.selectedSymbol.waitFor({ timeout: 20_000 });
    }
  }

  /**
   * Select `symbol` through the search box and return the app's own symbol-detail response,
   * which carries digits, point step, lot limits, stop level, order and expiry types.
   */
  async selectSymbol(symbol: string): Promise<SymbolDetail> {
    await this.symbolSearch.fill(symbol);
    const item = this.searchResults.getByTestId('symbol-input-search-items-symbol').getByText(symbol, { exact: true });
    // Only this symbol's response: the page may still be loading the default symbol's detail.
    const spec = await captureResult<SymbolDetail>(this.page, 'symbolDetail', () => item.click(), {
      urlIncludes: `symbol=${encodeURIComponent(symbol)}`,
    });
    if (spec.symbol !== symbol) throw new Error(`Expected detail for ${symbol}, got ${spec.symbol}`);
    return spec;
  }
}
