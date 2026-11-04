import type { Page, Route } from '@playwright/test';
import type { TraderApi } from '@src/api/client';
import { endpoints, type EndpointMatcher } from '@src/api/endpoints';
import type { ApiEnvelope, SymbolDetail, SymbolSummary } from '@src/domain/models';

/**
 * Backend mocks for @mocked tests. They let the closed-market behaviour be tested at any time, without
 * waiting for a weekend or a holiday. Each mock starts from the real response (route.fetch) and changes
 * only the fields that matter, so the rest of the app keeps working with real data.
 *
 * The flags reproduce what the backend returns for a symbol that is really closed (seen on USDJPY on a
 * holiday): status CLOSED, tradable false, online false, closable false, holiday true.
 */
export const CLOSED_FLAGS = {
  status: 'CLOSED',
  tradable: false,
  online: false,
  closable: false,
  holiday: true,
} as const satisfies Partial<SymbolDetail>;

function urlMatches(matcher: EndpointMatcher) {
  return (url: URL) => matcher.path.test(url.toString());
}

async function patchJson<T>(route: Route, patch: (result: T) => T): Promise<void> {
  const response = await route.fetch();
  const body = (await response.json()) as ApiEnvelope<T>;
  await route.fulfill({ response, json: { ...body, result: patch(body.result) } });
}

/** Makes `symbol` look closed in its detail and in the symbol list. Returns a function that removes the mock. */
export async function mockMarketClosed(page: Page, symbol: string): Promise<() => Promise<void>> {
  const detailMatcher = urlMatches(endpoints.symbolDetail);
  const listMatcher = urlMatches(endpoints.symbolsAll);

  const detail = async (route: Route) => {
    const url = new URL(route.request().url());
    if (url.searchParams.get('symbol') !== symbol) return route.fallback();
    await patchJson<SymbolDetail>(route, (result) => ({ ...result, ...CLOSED_FLAGS }));
  };
  const list = async (route: Route) =>
    patchJson<SymbolSummary[]>(route, (result) =>
      result.map((s) => (s.symbol === symbol ? { ...s, status: CLOSED_FLAGS.status } : s)),
    );

  await page.route(detailMatcher, detail);
  await page.route(listMatcher, list);
  return async () => {
    await page.unroute(detailMatcher, detail);
    await page.unroute(listMatcher, list);
  };
}

/**
 * Answers the next request to a trade endpoint with an error, without reaching the backend
 * (so nothing is ever traded). The body mirrors the platform's error envelope.
 */
export async function mockTradeError(
  page: Page,
  name: 'placeMarket' | 'placePending',
  error: { status: number; code: string; message: string },
): Promise<void> {
  const matcher = endpoints[name];
  await page.route(urlMatches(matcher), async (route) => {
    if (route.request().method() !== matcher.method) return route.fallback();
    await route.fulfill({ status: error.status, json: { code: error.code, message: error.message } });
  });
}

/** MT5 trade server return code 10018, "Market is closed". */
export const MARKET_CLOSED_ERROR = { status: 400, code: 'MT5_10018', message: 'Market is closed' } as const;

/**
 * A symbol that is really closed now and that the web client could otherwise trade (E10), for the live
 * counterpart of the mocked tests. Undefined when none is closed (e.g. a normal weekday for FX and metals).
 */
export async function findClosedTradableSymbol(api: TraderApi): Promise<string | undefined> {
  const closed = (await api.symbols()).filter((s) => s.status === CLOSED_FLAGS.status);
  for (const candidate of closed) {
    if ((await api.symbolDetail(candidate.symbol)).tradableExeMode) return candidate.symbol;
  }
  return undefined;
}
