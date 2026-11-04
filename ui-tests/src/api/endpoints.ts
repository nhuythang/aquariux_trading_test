/**
 * Backend endpoints the Web Trader calls, as found during exploration.
 * Matchers take a Playwright Response's URL and method.
 */

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

export interface EndpointMatcher {
  method: HttpMethod;
  path: RegExp;
}

const api = (method: HttpMethod, path: RegExp): EndpointMatcher => ({ method, path });

export const endpoints = {
  login: api('POST', /\/api\/auth\/v2\/metatrader5\/demo\/login$/),

  symbolDetail: api('GET', /\/api\/market\/v1\/symbol\/detail\?symbol=/),
  symbolsAll: api('GET', /\/api\/market\/v1\/symbols\/all$/),

  placeMarket: api('POST', /\/api\/trade\/trade\/v1\/market$/),
  modifyPosition: api('PATCH', /\/api\/trade\/trade\/v1\/market$/),
  /** Every pending type (Limit, Stop, Stop Limit) is posted here; `orderType` in the body tells them apart. */
  placePending: api('POST', /\/api\/trade\/trade\/v1\/limit$/),
  /** Editing a pending order (Edit Order dialog) is a PATCH on the same path as placing one. */
  modifyPending: api('PATCH', /\/api\/trade\/trade\/v1\/limit$/),
  closePosition: api('PUT', /\/api\/trade\/trade\/v1$/),
  bulkClose: api('PUT', /\/api\/trade\/trade\/v1\/bulk$/),
  /** Bulk Delete of pending orders; the body is the list of `{orderId, symbol}`. */
  bulkDeletePending: api('PUT', /\/api\/trade\/trade\/v1\/limit\/bulk$/),
  deletePending: api('DELETE', /\/api\/trade\/trade\/v1\?/),

  openPositions: api('GET', /\/api\/trade\/order\/v1$/),
  pendingOrders: api('GET', /\/api\/trade\/order\/v1\/pending$/),
  orderCounts: api('GET', /\/api\/trade\/order\/v1\/counts$/),
  positionsHistory: api('GET', /\/api\/order\/v3\/histories\?.*type=POSITION/),
  ordersAndDeals: api('GET', /\/api\/trade\/order\/v1\/deal\/histories\?/),

  notifications: api('GET', /\/api\/notification\/v2\?notificationType=ORDER/),
  oneClickPreference: api('GET', /\/api\/user\/setting\/v1\/preference\?type=OCT_ENABLE/),
} as const;

export type EndpointName = keyof typeof endpoints;
