/**
 * Types for the records the Web Trader backend returns.
 * Only fields the tests read are declared; field names match the API.
 * Envelope for every response: { code: "200", result: T }.
 */

export interface ApiEnvelope<T> {
  code: string;
  message?: string;
  result: T;
}

export type Side = 'BUY' | 'SELL';
export type OrderKind = 'MARKET' | 'LIMIT' | 'STOP' | 'STOP_LIMIT';
export type ExpiryType = 'GTC' | 'GTD' | 'SPECIFIED_TIMESTAMP' | 'SPECIFIED_DAY';

/**
 * Order type codes as returned in `orderType`.
 * Observed: 0 (buy), 1 (sell), 2 (buy limit), 3 (sell limit), 4 (buy stop), 5 (sell stop),
 * 6 (balance row in history), 8 (buy stop limit).
 * The sell stop limit code is not observed yet, so it is not declared.
 */
export const ORDER_TYPE = {
  BUY: 0,
  SELL: 1,
  BUY_LIMIT: 2,
  SELL_LIMIT: 3,
  BUY_STOP: 4,
  SELL_STOP: 5,
  BALANCE: 6,
  BUY_STOP_LIMIT: 8,
} as const;

/** MT5 order states seen in Orders & Deals. */
export const ORDER_STATE = { CANCELED: 9, FILLED: 11 } as const;

/** Response of POST/PATCH/PUT /api/trade/trade/v1/... */
export interface TradeResult {
  positionId: string;
  positionReference: string;
  clOrdId: string;
  traceId: string;
}

/** Response of PUT /api/trade/trade/v1/bulk */
export interface BulkCloseResult {
  account: string;
  horizonAccountType: string;
  closedOrderIds: number[];
}

/** Response of PUT /api/trade/trade/v1/limit/bulk */
export interface BulkDeleteResult {
  account: string;
  horizonAccountType: string;
  deletedOrderIds: number[];
}

/** GET /api/market/v1/symbol/detail?symbol= */
export interface SymbolDetail {
  symbol: string;
  type: string;
  digits: number;
  pointStep: number;
  stopsLevel: number;
  contractSize: number;
  minContractLotSize: number;
  maxContractLotSize: number;
  lotSizeStep: number;
  ask: number;
  bid: number;
  status: string;
  tradable: boolean;
  tradableExeMode: boolean;
  holiday: boolean;
  online: boolean;
  closable: boolean;
  orderTypes: OrderKind[];
  expirationTypes: ExpiryType[];
}

/** GET /api/trade/order/v1 (open positions) */
export interface OpenPosition {
  orderId: string;
  symbol: string;
  lotSize: number;
  units: number;
  openPrice: number;
  currentPrice: number;
  stopLoss: number;
  takeProfit: number;
  profit: number;
  orderType: number;
  openTime: number;
  comment: string;
}

/** GET /api/trade/order/v1/pending */
export interface PendingOrder {
  orderId: string;
  symbol: string;
  lotSize: number;
  units: number;
  price: number;
  /** Stop Limit only: the "Stop Limit Price" (limit price placed once Price is reached); null/0 otherwise. */
  priceTrigger: number | null;
  stopLoss: number;
  takeProfit: number;
  orderType: number;
  tradeExpiry: ExpiryType;
  expiration: number;
  fillPolicy: number;
  openTime: number;
}

/** GET /api/order/v3/histories?type=POSITION (Positions History) */
export interface HistoryPosition {
  orderId: string;
  positionId: string;
  symbol: string;
  lotSize: number;
  openPrice: number;
  closePrice: number;
  stopLoss: number;
  takeProfit: number;
  profit: number;
  realizedProfitLoss: number;
  status: string;
  orderType: number;
  openTime: number;
  closeTime: number;
}

/** One execution inside an order of Orders & Deals. */
export interface Deal {
  dealId: string;
  symbol: string;
  lotSize: number;
  price: number;
  profit: number;
  stopLoss: number;
  takeProfit: number;
  direction: number;
  openTime: number;
}

/** GET /api/trade/order/v1/deal/histories (Orders & Deals) */
export interface HistoryOrder {
  orderId: string;
  symbol: string;
  lotSize: number;
  lotSizeFilled: number;
  openPrice: number;
  stopLoss: number;
  takeProfit: number;
  orderType: number;
  state: number;
  fillPolicy: number;
  openTime: number;
  closeTime: number;
  deals: Deal[];
}

/** Notification templates seen in the Positions tab of the bell menu. */
export const NOTIFICATION_TEMPLATE = { CREATED: 'NT_ORDER_CREATE', CLOSED: 'NT_ORDER_CLOSE' } as const;

/**
 * GET /api/notification/v2?notificationType=ORDER (newest first).
 * `metadata.orderId` is the position (Order No.); for a close, the top-level `orderId` is the closing order.
 * `metadata.cmd` is the position side (0 BUY, 1 SELL); `metadata.volume` is in units, `lotSize` in lots.
 */
export interface OrderNotification {
  id: string;
  message: string;
  orderId: string;
  created: number;
  notificationTemplate: string;
  metadata: {
    orderId: string;
    symbol: string;
    cmd: number;
    lotSize: number;
    volume: number;
    openPrice: number;
    closePrice: number;
    stopLoss: number;
    takeProfit: number;
    profit: number;
    openTime: number;
  };
}

/** One entry of GET /api/market/v1/symbols/all. `status` is TRADING, CLOSED or OFFQUOTES. */
export interface SymbolSummary {
  symbol: string;
  type: string;
  status: string;
}
