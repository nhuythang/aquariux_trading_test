import { expect, test } from '@playwright/test';
import { formatPrice, offsetPoints, parseUiNumber, roundToStep, validStops } from '@src/domain/price';
import { isValidPartialClose, isValidVolume, pendingPriceOnCorrectSide, stopsOnCorrectSide } from '@src/domain/rules';

const xau = {
  pointStep: 0.01,
  stopsLevel: 0,
  minContractLotSize: 0.1,
  maxContractLotSize: 100,
  lotSizeStep: 0.1,
};

test.describe('domain/price', () => {
  test('rounds to the point step without float noise', () => {
    expect(roundToStep(3928.6999999999998, 0.01)).toBe(3928.7);
    expect(roundToStep(212.6894, 0.001)).toBe(212.689);
    expect(offsetPoints(3928.7, -1000, xau)).toBe(3918.7);
  });

  test('parses and formats UI numbers', () => {
    expect(parseUiNumber('3,928.70')).toBe(3928.7);
    expect(parseUiNumber('-0.56%')).toBe(-0.56);
    expect(parseUiNumber('--')).toBeNaN();
    expect(formatPrice(3928.7, 2)).toBe('3,928.70');
  });

  test('places SL/TP on the correct side, at least the stop level away', () => {
    expect(validStops('BUY', 100, { pointStep: 0.01, stopsLevel: 0 }, 500)).toEqual({ stopLoss: 95, takeProfit: 105 });
    expect(validStops('SELL', 100, { pointStep: 0.01, stopsLevel: 0 }, 500)).toEqual({ stopLoss: 105, takeProfit: 95 });
    expect(validStops('BUY', 100, { pointStep: 0.01, stopsLevel: 80 }, 10).stopLoss).toBe(99.19);
  });
});

test.describe('domain/rules', () => {
  test('R2 SL/TP side', () => {
    expect(stopsOnCorrectSide('BUY', 100, 95, 105)).toBe(true);
    expect(stopsOnCorrectSide('BUY', 100, 105, 110)).toBe(false);
    expect(stopsOnCorrectSide('SELL', 100, 105, 95)).toBe(true);
    expect(stopsOnCorrectSide('SELL', 100, 0, 110)).toBe(false);
  });

  test('R3 pending price side', () => {
    const quote = { bid: 99, ask: 100 };
    expect(pendingPriceOnCorrectSide('BUY', 'LIMIT', 98, quote)).toBe(true);
    expect(pendingPriceOnCorrectSide('BUY', 'STOP', 98, quote)).toBe(false);
    expect(pendingPriceOnCorrectSide('SELL', 'LIMIT', 101, quote)).toBe(true);
    expect(pendingPriceOnCorrectSide('SELL', 'STOP', 101, quote)).toBe(false);
  });

  test('R4/R5 volume and partial close', () => {
    expect(isValidVolume(0.2, xau)).toBe(true);
    expect(isValidVolume(0.05, xau)).toBe(false);
    expect(isValidVolume(0.15, xau)).toBe(false);
    expect(isValidPartialClose(0.1, 0.2, xau)).toBe(true);
    expect(isValidPartialClose(0.2, 0.2, xau)).toBe(false);
  });
});
