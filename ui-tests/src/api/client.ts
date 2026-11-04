import type { APIRequestContext, Page, Request } from '@playwright/test';
import type {
  ApiEnvelope,
  BulkCloseResult,
  HistoryOrder,
  HistoryPosition,
  OpenPosition,
  OrderNotification,
  PendingOrder,
  SymbolDetail,
} from '@src/domain/models';

/**
 * Direct REST access for test setup, cleanup and data checks.
 *
 * The app sends `Authorization: Bearer <jwt>` on every /api/ call; that token is not the one in
 * localStorage, so the client reuses the header from the app's own traffic instead of logging in again.
 * UI actions are still what the tests verify; this client only reads state and tidies up.
 */
export class TraderApi {
  private authorization: string | undefined;
  private readonly listener = (request: Request) => {
    const value = request.headers()['authorization'];
    if (value?.startsWith('Bearer ') && request.url().includes('/api/')) this.authorization = value;
  };

  constructor(
    private readonly page: Page,
    private readonly request: APIRequestContext,
  ) {
    page.on('request', this.listener);
  }

  dispose(): void {
    this.page.off('request', this.listener);
  }

  /** Resolves once the app has sent at least one authenticated request. */
  async ready(timeout = 30_000): Promise<void> {
    const deadline = Date.now() + timeout;
    while (!this.authorization) {
      if (Date.now() > deadline) throw new Error('No authenticated /api/ request seen from the app');
      await this.page.waitForRequest((r) => r.url().includes('/api/'), { timeout: Math.max(deadline - Date.now(), 1) });
    }
  }

  private async call<T>(method: 'GET' | 'PUT' | 'DELETE', path: string, data?: unknown): Promise<T> {
    await this.ready();
    const response = await this.fetchWithRetry(method, path, data);
    const body = (await response.json()) as ApiEnvelope<T>;
    if (!response.ok() || body.code !== '200') {
      throw new Error(`${method} ${path} → HTTP ${response.status()} code ${body.code} ${body.message ?? ''}`);
    }
    return body.result;
  }

  /** Reads are repeated once when the request itself times out or is dropped; writes are never repeated. */
  private async fetchWithRetry(method: 'GET' | 'PUT' | 'DELETE', path: string, data?: unknown) {
    const send = () =>
      this.request.fetch(path, {
        method,
        headers: { Authorization: this.authorization!, 'Content-Type': 'application/json' },
        data,
      });
    return method === 'GET' ? send().catch(send) : send();
  }

  symbolDetail(symbol: string): Promise<SymbolDetail> {
    return this.call('GET', `/api/market/v1/symbol/detail?symbol=${encodeURIComponent(symbol)}`);
  }

  openPositions(): Promise<OpenPosition[]> {
    return this.call('GET', '/api/trade/order/v1');
  }

  pendingOrders(): Promise<PendingOrder[]> {
    return this.call('GET', '/api/trade/order/v1/pending');
  }

  counts(): Promise<{ marketOrderCounts: number; pendingOrderCounts: number }> {
    return this.call('GET', '/api/trade/order/v1/counts');
  }

  positionsHistory(from: number, to: number): Promise<HistoryPosition[]> {
    return this.call('GET', `/api/order/v3/histories?to=${to}&from=${from}&type=POSITION`);
  }

  ordersAndDeals(from: number, to: number): Promise<HistoryOrder[]> {
    return this.call('GET', `/api/trade/order/v1/deal/histories?from=${from}&to=${to}`);
  }

  orderNotifications(): Promise<OrderNotification[]> {
    return this.call('GET', '/api/notification/v2?notificationType=ORDER');
  }

  /** Newest notification of `template` for position `orderId`, if any. */
  async notificationFor(orderId: string, template: string): Promise<OrderNotification | undefined> {
    return (await this.orderNotifications()).find(
      (n) => n.notificationTemplate === template && n.metadata.orderId === orderId,
    );
  }

  deletePending(symbol: string, orderId: string): Promise<unknown> {
    return this.call('DELETE', `/api/trade/trade/v1?symbol=${encodeURIComponent(symbol)}&orderId=${orderId}`);
  }

  async openPosition(orderId: string): Promise<OpenPosition | undefined> {
    return (await this.openPositions()).find((p) => p.orderId === orderId);
  }

  async pendingOrder(orderId: string): Promise<PendingOrder | undefined> {
    return (await this.pendingOrders()).find((p) => p.orderId === orderId);
  }
}

export type { BulkCloseResult };
