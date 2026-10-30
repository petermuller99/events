import AsyncStorage from '@react-native-async-storage/async-storage';
import type { ChainId } from './config';

/** CoinGecko ids of each network's own coin (the fee coin). */
const COIN_IDS: Record<ChainId, string> = {
  ethereum: 'ethereum',
  bsc: 'binancecoin',
  solana: 'solana',
};

/** Dollar price of each network's fee coin, in millionths of a dollar. */
export type NativePrices = Partial<Record<ChainId, bigint>>;

const KEY = 'pearl.prices.v1';
const FRESH_MS = 2 * 60_000;
let cache: { at: number; prices: NativePrices } | null = null;
let changes: Partial<Record<ChainId, number>> = {};

/** Price change over the last 24 hours in percent, once prices have been fetched. */
export function change24h(chain: ChainId): number | undefined {
  return changes[chain];
}

/** Turns a price like 3456.78 into millionths of a dollar. */
export function toMicros(price: number): bigint {
  return BigInt(Math.round(price * 1_000_000));
}

/** Dollar value of a fee coin balance, scaled to 18 decimals like the stablecoin total. */
export function nativeValue(balance: bigint, decimals: number, priceMicros: bigint): bigint {
  return (balance * priceMicros * 10n ** 18n) / (10n ** BigInt(decimals) * 1_000_000n);
}

export function parseChanges(json: unknown): Partial<Record<ChainId, number>> {
  const out: Partial<Record<ChainId, number>> = {};
  const data = json as Record<string, { usd_24h_change?: number } | undefined>;
  for (const [chain, id] of Object.entries(COIN_IDS) as [ChainId, string][]) {
    const c = data?.[id]?.usd_24h_change;
    if (typeof c === 'number' && Number.isFinite(c)) out[chain] = c;
  }
  return out;
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
    const res = await fetch(`https://api.coingecko.com/api/v3/simple/price?ids=${ids}&vs_currencies=usd&include_24hr_change=true`);
    if (!res.ok) throw new Error(`Price service returned ${res.status}`);
    const json = await res.json();
    const prices = parsePrices(json);
    changes = parseChanges(json);
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

/** Chart ranges, in days of history. */
export const RANGES = { '1D': 1, '1W': 7, '1M': 30, '1Y': 365 } as const;
export type Range = keyof typeof RANGES;

/** [time in ms, dollar price] points, oldest first. */
export type PricePoint = [number, number];

const historyCache = new Map<string, { at: number; points: PricePoint[] }>();

/** Price history of a fee coin over a range, from CoinGecko (cached for 10 minutes). */
export async function fetchPriceHistory(chain: ChainId, range: Range): Promise<PricePoint[]> {
  const key = `${chain}:${range}`;
  const hit = historyCache.get(key);
  if (hit && Date.now() - hit.at < 10 * 60_000) return hit.points;
  const res = await fetch(
    `https://api.coingecko.com/api/v3/coins/${COIN_IDS[chain]}/market_chart?vs_currency=usd&days=${RANGES[range]}`,
  );
  if (!res.ok) throw new Error(`Price service returned ${res.status}`);
  const points = parsePriceHistory(await res.json());
  if (!points.length) throw new Error('No price history');
  historyCache.set(key, { at: Date.now(), points });
  return points;
}

export function parsePriceHistory(json: unknown): PricePoint[] {
  const prices = (json as { prices?: unknown })?.prices;
  if (!Array.isArray(prices)) return [];
  return prices.filter(
    (p): p is PricePoint => Array.isArray(p) && typeof p[0] === 'number' && typeof p[1] === 'number' && p[1] > 0,
  );
}

/** The price at time t: the last known point at or before it (or the first point). */
export function priceAt(points: PricePoint[], t: number): number {
  let price = points[0]?.[1] ?? 0;
  for (const [at, p] of points) {
    if (at > t) break;
    price = p;
  }
  return price;
}
