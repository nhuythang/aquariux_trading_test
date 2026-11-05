import type { TraderApi } from '@src/api/client';
import { avoid } from '@src/data/instruments';

/** Upper bound on symbol-detail calls when searching for a symbol by its flags. */
const MAX_CANDIDATES = 40;

/**
 * A symbol whose market is open but which the web client may not trade (`tradableExeMode: false`, E10).
 * The demo backend changes these flags over time, so the preferred symbol is checked first and the
 * other open symbols are searched when it has become tradable. Undefined when no such symbol exists now.
 */
export async function findWebRestrictedSymbol(api: TraderApi, preferred: string): Promise<string | undefined> {
  const open = (await api.symbols())
    .filter((s) => s.status === 'TRADING' && !(avoid as readonly string[]).includes(s.symbol))
    .map((s) => s.symbol);
  const candidates = [preferred, ...open.filter((s) => s !== preferred)].slice(0, MAX_CANDIDATES);
  for (const symbol of candidates) {
    const detail = await api.symbolDetail(symbol);
    if (detail.status === 'TRADING' && !detail.tradableExeMode) return symbol;
  }
  return undefined;
}
