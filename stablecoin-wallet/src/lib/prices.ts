import AsyncStorage from '@react-native-async-storage/async-storage';
import type { ChainId } from './config';

/** CoinGecko ids of each network's own coin (the fee coin). */
const COIN_IDS: Record<ChainId, string> = {
  ethereum: 'ethereum',
  bsc: 'binancecoin',
  tron: 'tron',
  solana: 'solana',
};

/** Dollar price of each network's fee coin, in millionths of a dollar. */
export type NativePrices = Partial<Record<ChainId, bigint>>;

const KEY = 'pearl.prices.v1';
const FRESH_MS = 2 * 60_000;
let cache: { at: number; prices: NativePrices } | null = null;

/** Turns a price like 3456.78 into millionths of a dollar. */
export function toMicros(price: number): bigint {
  return BigInt(Math.round(price * 1_000_000));
}

/** Dollar value of a fee coin balance, scaled to 18 decimals like the stablecoin total. */
export function nativeValue(balance: bigint, decimals: number, priceMicros: bigint): bigint {
  return (balance * priceMicros * 10n ** 18n) / (10n ** BigInt(decimals) * 1_000_000n);
}

export function parsePrices(json: unknown): NativePrices {
  const prices: NativePrices = {};
  const data = json as Record<string, { usd?: number } | undefined>;
  for (const [chain, id] of Object.entries(COIN_IDS) as [ChainId, string][]) {
    const usd = data?.[id]?.usd;
    if (typeof usd === 'number' && usd > 0) prices[chain] = toMicros(usd);
  }
  return prices;
}

/**
 * Current prices of ETH, BNB, TRX and SOL. Falls back to the last prices seen if the
 * price service can't be reached, or to none at all.
 */
export async function fetchNativePrices(): Promise<NativePrices> {
  if (cache && Date.now() - cache.at < FRESH_MS) return cache.prices;
  try {
    const ids = Object.values(COIN_IDS).join(',');
    const res = await fetch(`https://api.coingecko.com/api/v3/simple/price?ids=${ids}&vs_currencies=usd`);
    if (!res.ok) throw new Error(`Price service returned ${res.status}`);
    const prices = parsePrices(await res.json());
    if (!Object.keys(prices).length) throw new Error('No prices returned');
    cache = { at: Date.now(), prices };
    const stored = Object.fromEntries(Object.entries(prices).map(([k, v]) => [k, String(v)]));
    AsyncStorage.setItem(KEY, JSON.stringify(stored)).catch(() => {});
    return prices;
  } catch {
    if (cache) return cache.prices;
    try {
      const raw = await AsyncStorage.getItem(KEY);
      if (!raw) return {};
      const stored = JSON.parse(raw) as Record<string, string>;
      return Object.fromEntries(Object.entries(stored).map(([k, v]) => [k, BigInt(v)])) as NativePrices;
    } catch {
      return {};
    }
  }
}
