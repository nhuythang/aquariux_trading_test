import { ORDER_TYPE, type HistoryOrder, type Side, type SymbolDetail } from './models';

/**
 * Business rules used as test oracles. Rule IDs match docs/assumptions.md.
 * Pure functions: no Playwright, no I/O.
 */

/** R2 – SL/TP are on the correct side of the entry price. Zero means "not set". */
export function stopsOnCorrectSide(side: Side, entry: number, stopLoss: number, takeProfit: number): boolean {
  const slOk = stopLoss === 0 || (side === 'BUY' ? stopLoss < entry : stopLoss > entry);
  const tpOk = takeProfit === 0 || (side === 'BUY' ? takeProfit > entry : takeProfit < entry);
  return slOk && tpOk;
}

export type PendingKind = 'LIMIT' | 'STOP';

/** R3 – a pending price is on the side of the market its type requires. */
export function pendingPriceOnCorrectSide(
  side: Side,
  kind: PendingKind,
  price: number,
  quote: { bid: number; ask: number },
): boolean {
  if (side === 'BUY') return kind === 'LIMIT' ? price < quote.ask : price > quote.ask;
  return kind === 'LIMIT' ? price > quote.bid : price < quote.bid;
}

/** R4 – volume within [min, max] and a multiple of the step. */
export function isValidVolume(
  lots: number,
  spec: Pick<SymbolDetail, 'minContractLotSize' | 'maxContractLotSize' | 'lotSizeStep'>,
): boolean {
  if (lots < spec.minContractLotSize || lots > spec.maxContractLotSize) return false;
  const steps = lots / spec.lotSizeStep;
  return Math.abs(steps - Math.round(steps)) < 1e-9;
}

/** R5 – a partial-close volume that leaves a valid remainder. */
export function isValidPartialClose(
  closeLots: number,
  openLots: number,
  spec: Pick<SymbolDetail, 'minContractLotSize' | 'maxContractLotSize' | 'lotSizeStep'>,
): boolean {
  return closeLots < openLots && isValidVolume(closeLots, spec);
}

/** R6 – closing deals of a position add up to its realised P/L (rounded to cents). */
export function closingDealsProfit(orders: HistoryOrder[], positionSymbol: string, closingSide: Side): number {
  const closingType = closingSide === 'BUY' ? ORDER_TYPE.BUY : ORDER_TYPE.SELL;
  const total = orders
    .filter((o) => o.symbol === positionSymbol && o.orderType === closingType)
    .flatMap((o) => o.deals)
    .reduce((sum, d) => sum + d.profit, 0);
  return Number(total.toFixed(2));
}

export function oppositeSide(side: Side): Side {
  return side === 'BUY' ? 'SELL' : 'BUY';
}

export function sideOf(orderType: number): Side {
  switch (orderType) {
    case ORDER_TYPE.BUY:
    case ORDER_TYPE.BUY_LIMIT:
    case ORDER_TYPE.BUY_STOP:
      return 'BUY';
    case ORDER_TYPE.SELL:
    case ORDER_TYPE.SELL_LIMIT:
    case ORDER_TYPE.SELL_STOP:
      return 'SELL';
    default:
      throw new Error(`orderType ${orderType} has no side`);
  }
}
