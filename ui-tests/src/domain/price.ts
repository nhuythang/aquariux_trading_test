import type { Side, SymbolDetail } from './models';

/** Number of decimals implied by a step such as 0.01 or 0.001. */
export function decimalsOf(step: number): number {
  const text = step.toString();
  if (text.includes('e-')) return Number(text.split('e-')[1]);
  return text.includes('.') ? (text.split('.')[1]?.length ?? 0) : 0;
}

/** Round to the nearest multiple of `step`, returned with exact decimals (no 3928.6999999). */
export function roundToStep(value: number, step: number): number {
  return Number((Math.round(value / step) * step).toFixed(decimalsOf(step)));
}

/** `base` moved by `points` (signed) of the symbol's point size. */
export function offsetPoints(base: number, points: number, spec: Pick<SymbolDetail, 'pointStep'>): number {
  return roundToStep(base + points * spec.pointStep, spec.pointStep);
}

/** `base` moved by a signed percentage, rounded to the point size. */
export function offsetPercent(base: number, percent: number, spec: Pick<SymbolDetail, 'pointStep'>): number {
  return roundToStep(base * (1 + percent / 100), spec.pointStep);
}

/** Price as the UI prints it: thousands separator and fixed decimals, e.g. "3,928.70". */
export function formatPrice(value: number, digits: number): string {
  return value.toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

/** Parse a UI number such as "3,928.70", "+4.40" or "-0.56%". Returns NaN for "--". */
export function parseUiNumber(text: string): number {
  const cleaned = text.replace(/[,%\s]/g, '');
  return cleaned === '' || cleaned === '--' ? Number.NaN : Number(cleaned);
}

export function nearlyEqual(a: number, b: number, tolerance: number): boolean {
  return Math.abs(a - b) <= tolerance + Number.EPSILON;
}

/** Price a market order of `side` is expected to fill at. */
export function marketPrice(side: Side, quote: { bid: number; ask: number }): number {
  return side === 'BUY' ? quote.ask : quote.bid;
}

/**
 * SL and TP placed `distancePoints` away from the entry on the correct side:
 * Buy → SL below, TP above; Sell → SL above, TP below.
 * The distance is never below the symbol's stop level.
 */
export function validStops(
  side: Side,
  entry: number,
  spec: Pick<SymbolDetail, 'pointStep' | 'stopsLevel'>,
  distancePoints: number,
): { stopLoss: number; takeProfit: number } {
  const distance = Math.max(distancePoints, spec.stopsLevel + 1);
  const sign = side === 'BUY' ? 1 : -1;
  return {
    stopLoss: offsetPoints(entry, -sign * distance, spec),
    takeProfit: offsetPoints(entry, sign * distance, spec),
  };
}
