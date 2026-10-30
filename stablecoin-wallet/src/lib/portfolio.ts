import type { ActivityItem } from './activity';
import type { ChainId } from './config';
import { priceAt, type PricePoint } from './prices';
import type { AssetId } from './wallet';

// "My money" over time. There's no stored history of balances, so walk back from
// today's balances through Activity: before money came in the balance was lower,
// before a send it was higher. Fee coins are valued at the price at that time.

export interface Holding {
  chain: ChainId;
  assetId: AssetId;
  decimals: number;
  balance: bigint;
  /** Stablecoins count as $1. */
  stable: boolean;
}

export interface Point {
  t: number;
  usd: number;
}

function units(amount: bigint, decimals: number): number {
  return Number(amount) / 10 ** decimals;
}

export function portfolioSeries(
  holdings: Holding[],
  items: ActivityItem[],
  history: Partial<Record<ChainId, PricePoint[]>>,
  /** Today's fee coin prices in dollars, for coins without history. */
  currentPrice: Partial<Record<ChainId, number>>,
  from: number,
  to: number,
  samples = 48,
): Point[] {
  const settled = items.filter((i) => i.status === 'confirmed');
  const out: Point[] = [];
  for (let k = 0; k < samples; k++) {
    const t = from + ((to - from) * k) / (samples - 1);
    let usd = 0;
    for (const h of holdings) {
      // Undo everything that happened to this coin after t.
      let balance = h.balance;
      for (const i of settled) {
        if (i.chain !== h.chain || i.assetId !== h.assetId || i.timestamp <= t) continue;
        balance += i.direction === 'in' ? -BigInt(i.amount) : BigInt(i.amount);
      }
      if (balance <= 0n) continue;
      const price = h.stable ? 1 : history[h.chain]?.length ? priceAt(history[h.chain]!, t) : (currentPrice[h.chain] ?? 0);
      usd += units(balance, h.decimals) * price;
    }
    out.push({ t, usd });
  }
  return out;
}
