import AsyncStorage from '@react-native-async-storage/async-storage';
import { AbiCoder, Contract, getAddress, Interface } from 'ethers';
import { getChain, type ChainConfig, type ChainId, type NetworkMode, type TokenConfig } from './config';
import * as evm from './evm';
import { SolanaClient } from './solana';

// Found coins: coins that are already in Pearl's wallet show up by themselves, without
// adding each one to the app, as long as they're real and worth something.
//
// Anyone can send any coin to any wallet, and scammers airdrop fake coins with made-up
// names ("USDT", "Claim $500 at …") to lure people to websites. So a coin is only shown
// when it is listed on CoinGecko for that network, has a price, is actually traded, is
// worth at least FOUND_MIN_USD, doesn't pose as USDT/USDC or a network's own coin, and
// has no link in its name. Everything else stays hidden and can't be opened or sent.
//
// Finding coins only reads public data. Sending a found coin is the same plain transfer
// as USDT: Pearl Wallet never approves a contract to spend anything.
//
// Real money only: test networks aren't listed on CoinGecko.

/** A found coin is shown only when Pearl holds at least this much of it, in dollars. */
export const FOUND_MIN_USD = 0.1;
/** ...and at least this much of it is traded a day, so it can really be sold. */
export const FOUND_MIN_VOLUME_USD = 1_000;
/** How often to look for new coins. Balances of coins already found refresh as usual. */
const SCAN_EVERY_MS = 6 * 3600_000;
/** How often to download CoinGecko's list of coins per network. */
const LIST_EVERY_MS = 7 * 86_400_000;

/** CoinGecko's name for each network that has tokens. */
export const PLATFORMS: Partial<Record<ChainId, string>> = {
  ethereum: 'ethereum',
  bsc: 'binance-smart-chain',
  core: 'core',
  solana: 'solana',
};
const FOUND_CHAINS = Object.keys(PLATFORMS) as ChainId[];

/** Multicall3: the same address on Ethereum, BNB Chain, Core and most EVM networks. */
export const MULTICALL3 = '0xcA11bde05977b3631167028862bE2a173976CA11';

/** Symbols a found coin may not use: it would pose as a coin Pearl Wallet already shows. */
const PROTECTED = ['USDT', 'USDC', 'BTC', 'ETH', 'BNB', 'SOL', 'CORE'];
const LINKY = /(https?:|www\.|\.(com|xyz|io|net|org|app|site|top|vip|cc|me|gg|link|online|club|fun|pro)\b|t\.me|claim|airdrop|reward|visit|voucher|gift|bonus|free)/i;

export type HiddenReason =
  | 'lookalike'
  | 'link-name'
  | 'unlisted'
  | 'no-price'
  | 'not-traded'
  | 'too-small'
  | 'hidden-by-you';

export const HIDDEN_REASON_TEXT: Record<HiddenReason, string> = {
  lookalike: 'Looks like a coin Pearl Wallet already shows, but isn’t that one',
  'link-name': 'Its name is a link or a “claim” offer: a common scam',
  unlisted: 'Not listed on CoinGecko',
  'no-price': 'No price anywhere',
  'not-traded': 'Hardly anyone trades it',
  'too-small': `Worth less than $${FOUND_MIN_USD.toFixed(2)}`,
  'hidden-by-you': 'You hid it',
};

export interface FoundCoin {
  chain: ChainId;
  /** Contract (EVM, checksummed) or mint (Solana). */
  address: string;
  symbol: string;
  name: string;
  decimals: number;
  coingeckoId?: string;
  /** Dollar price and 24h trading volume at the last scan. */
  price?: number;
  volume?: number;
  /** Balance at the last scan, in base units. */
  balance: string;
  /** Why it's hidden; undefined when it's shown. */
  hidden?: HiddenReason;
}

interface FoundState {
  scannedAt: number;
  /** The addresses the scan was for: a different wallet starts over. */
  owner: string;
  enabled: boolean;
  coins: FoundCoin[];
  /** chain:address of coins the user hid. */
  hiddenByYou: string[];
}

const KEY = 'pearl.found.v1';
const emptyState = (owner: string): FoundState => ({ scannedAt: 0, owner, enabled: true, coins: [], hiddenByYou: [] });
let state: FoundState | null = null;

export const coinKey = (chain: ChainId, address: string) => `${chain}:${address.toLowerCase()}`;

// ------------------------------------------------------------------ pure rules

const normalize = (s: string) => s.toUpperCase().replace(/[^A-Z0-9]/g, '');

/** Why a coin must stay hidden, or undefined if it can be shown. */
export function hiddenReason(
  coin: Pick<FoundCoin, 'symbol' | 'name' | 'decimals' | 'balance' | 'coingeckoId' | 'price' | 'volume'>,
): HiddenReason | undefined {
  if (LINKY.test(coin.name) || LINKY.test(coin.symbol)) return 'link-name';
  const sym = normalize(coin.symbol);
  if (PROTECTED.some((p) => sym === p || sym === `${p}0`)) return 'lookalike';
  if (!coin.coingeckoId) return 'unlisted';
  if (!coin.price || !(coin.price > 0)) return 'no-price';
  if (!coin.volume || coin.volume < FOUND_MIN_VOLUME_USD) return 'not-traded';
  if (coinUsd(coin) < FOUND_MIN_USD) return 'too-small';
  return undefined;
}

/** Dollar value of a balance at a price. */
export function coinUsd(coin: Pick<FoundCoin, 'balance' | 'decimals' | 'price'>): number {
  return (Number(BigInt(coin.balance)) / 10 ** coin.decimals) * (coin.price ?? 0);
}

/** CoinGecko's coins/list?include_platform=true → per network: lowercase address → coin id. */
export function parseCoinList(json: unknown): Partial<Record<ChainId, Record<string, string>>> {
  const out: Partial<Record<ChainId, Record<string, string>>> = {};
  if (!Array.isArray(json)) return out;
  for (const c of json as { id?: unknown; platforms?: Record<string, unknown> }[]) {
    if (typeof c?.id !== 'string' || !c.platforms) continue;
    for (const chain of FOUND_CHAINS) {
      const address: unknown = c.platforms[PLATFORMS[chain]!];
      if (typeof address !== 'string' || !address) continue;
      // EVM addresses compare lowercase; Solana mints are case-sensitive base58.
      const k = chain === 'solana' ? address : address.toLowerCase();
      (out[chain] ??= {})[k] = c.id;
    }
  }
  return out;
}

export interface MarketInfo {
  symbol: string;
  name: string;
  price?: number;
  volume?: number;
  change24h?: number;
}

/** CoinGecko's coins/markets → id → market info. */
export function parseMarkets(json: unknown): Record<string, MarketInfo> {
  const out: Record<string, MarketInfo> = {};
  if (!Array.isArray(json)) return out;
  for (const m of json as Record<string, unknown>[]) {
    if (typeof m?.id !== 'string' || typeof m.symbol !== 'string' || typeof m.name !== 'string') continue;
    const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : undefined);
    out[m.id] = {
      symbol: m.symbol.toUpperCase().slice(0, 12),
      name: m.name.slice(0, 40),
      price: num(m.current_price),
      volume: num(m.total_volume),
      change24h: num(m.price_change_percentage_24h),
    };
  }
  return out;
}

// ------------------------------------------------------------------ state

/** Loads saved found coins into memory (cheap; call before using foundTokens). */
export async function loadFound(): Promise<void> {
  if (state) return;
  try {
    const raw = await AsyncStorage.getItem(KEY);
    state = raw ? { ...emptyState(''), ...(JSON.parse(raw) as FoundState) } : emptyState('');
  } catch {
    state = emptyState('');
  }
}

async function save(): Promise<void> {
  if (state) await AsyncStorage.setItem(KEY, JSON.stringify(state)).catch(() => {});
}

export function foundEnabled(): boolean {
  return state?.enabled ?? true;
}

export async function setFoundEnabled(enabled: boolean): Promise<void> {
  await loadFound();
  state = { ...state!, enabled };
  await save();
}

/** All coins from the last scan, shown and hidden (for Settings). */
export function allFound(): FoundCoin[] {
  return state?.coins ?? [];
}

/** Found coins shown on a network, as token configs for balances, sending and Activity. */
export function foundTokens(mode: NetworkMode, chain: ChainId): TokenConfig[] {
  if (mode !== 'mainnet' || !state?.enabled) return [];
  return state.coins
    .filter((c) => c.chain === chain && !c.hidden && c.coingeckoId)
    .map((c) => ({
      symbol: c.symbol,
      address: c.address,
      decimals: c.decimals,
      found: { coingeckoId: c.coingeckoId!, name: c.name },
    }));
}

export function foundCoin(chain: ChainId, address: string): FoundCoin | undefined {
  return state?.coins.find((c) => coinKey(c.chain, c.address) === coinKey(chain, address));
}

/** Hide a found coin (or show it again). */
export async function setHiddenByYou(chain: ChainId, address: string, hidden: boolean): Promise<void> {
  await loadFound();
  const k = coinKey(chain, address);
  const list = state!.hiddenByYou.filter((x) => x !== k);
  if (hidden) list.push(k);
  state = {
    ...state!,
    hiddenByYou: list,
    coins: state!.coins.map((c) =>
      coinKey(c.chain, c.address) !== k
        ? c
        : { ...c, hidden: hidden ? 'hidden-by-you' : hiddenReason(c) },
    ),
  };
  await save();
}

// ------------------------------------------------------------------ scanning

let coinList: { at: number; list: Partial<Record<ChainId, Record<string, string>>> } | null = null;
const LIST_KEY = 'pearl.cglist.v1';

/** CoinGecko's listed tokens per network, cached for a week (one key per network). */
async function listedTokens(): Promise<Partial<Record<ChainId, Record<string, string>>>> {
  if (coinList && Date.now() - coinList.at < LIST_EVERY_MS) return coinList.list;
  try {
    const at = Number(await AsyncStorage.getItem(`${LIST_KEY}.at`));
    if (at && Date.now() - at < LIST_EVERY_MS) {
      const list: Partial<Record<ChainId, Record<string, string>>> = {};
      for (const chain of FOUND_CHAINS) {
        const raw = await AsyncStorage.getItem(`${LIST_KEY}.${chain}`);
        if (raw) list[chain] = JSON.parse(raw);
      }
      coinList = { at, list };
      return list;
    }
  } catch {
    // Download it again.
  }
  const res = await fetch('https://api.coingecko.com/api/v3/coins/list?include_platform=true');
  if (!res.ok) throw new Error(`Coin list returned ${res.status}`);
  const list = parseCoinList(await res.json());
  if (!Object.keys(list).length) throw new Error('Empty coin list');
  coinList = { at: Date.now(), list };
  for (const chain of FOUND_CHAINS) {
    await AsyncStorage.setItem(`${LIST_KEY}.${chain}`, JSON.stringify(list[chain] ?? {})).catch(() => {});
  }
  await AsyncStorage.setItem(`${LIST_KEY}.at`, String(coinList.at)).catch(() => {});
  return list;
}

async function markets(ids: string[]): Promise<Record<string, MarketInfo>> {
  const out: Record<string, MarketInfo> = {};
  for (let i = 0; i < ids.length; i += 200) {
    const chunk = ids.slice(i, i + 200);
    const res = await fetch(
      `https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&per_page=250&ids=${chunk.map(encodeURIComponent).join(',')}`,
    );
    if (!res.ok) throw new Error(`Prices returned ${res.status}`);
    Object.assign(out, parseMarkets(await res.json()));
  }
  return out;
}

const ERC20 = new Interface([
  'function balanceOf(address owner) view returns (uint256)',
  'function decimals() view returns (uint8)',
]);
const MULTICALL_ABI = [
  'function tryAggregate(bool requireSuccess, (address target, bytes callData)[] calls) view returns ((bool success, bytes returnData)[])',
];

/** Read-only calls to many token contracts at once; null for calls that failed. */
async function multicall(chain: ChainConfig, targets: string[], data: string): Promise<(string | null)[]> {
  const mc = new Contract(MULTICALL3, MULTICALL_ABI, evm.getProvider(chain));
  const run = async (part: string[]): Promise<(string | null)[]> => {
    try {
      const res = (await mc.tryAggregate.staticCall(
        false,
        part.map((target) => ({ target, callData: data })),
      )) as { success: boolean; returnData: string }[];
      return res.map((r) => (r.success && r.returnData.length === 66 ? r.returnData : null));
    } catch {
      // One misbehaving contract can make the whole batch fail: split it and retry.
      if (part.length <= 8) return part.map(() => null);
      const mid = Math.floor(part.length / 2);
      return [...(await run(part.slice(0, mid))), ...(await run(part.slice(mid)))];
    }
  };
  const out: (string | null)[] = [];
  for (let i = 0; i < targets.length; i += 250) out.push(...(await run(targets.slice(i, i + 250))));
  return out;
}

/** Listed tokens this EVM address holds: address → balance and decimals. */
async function scanEvm(chain: ChainConfig, owner: string, listed: Record<string, string>) {
  const known = new Set(chain.tokens.map((t) => t.address.toLowerCase()));
  const candidates = Object.keys(listed).filter((a) => /^0x[0-9a-f]{40}$/.test(a) && !known.has(a));
  if (!candidates.length) return [];
  if ((await evm.getProvider(chain).getCode(MULTICALL3)) === '0x') return [];
  const coder = AbiCoder.defaultAbiCoder();
  const balances = await multicall(chain, candidates, ERC20.encodeFunctionData('balanceOf', [owner]));
  const held = candidates.flatMap((address, i) => {
    const raw = balances[i];
    const balance = raw ? (coder.decode(['uint256'], raw)[0] as bigint) : 0n;
    return balance > 0n ? [{ address, balance }] : [];
  });
  const decimals = await multicall(chain, held.map((h) => h.address), ERC20.encodeFunctionData('decimals'));
  return held.flatMap((h, i) => {
    const raw = decimals[i];
    const d = raw ? Number(coder.decode(['uint8'], raw)[0]) : NaN;
    if (!(d >= 0 && d <= 36)) return [];
    return [{ address: getAddress(h.address), balance: h.balance, decimals: d, coingeckoId: listed[h.address] }];
  });
}

/** Every classic SPL token this Solana address holds (listed or not). */
async function scanSolana(chain: ChainConfig, owner: string, listed: Record<string, string>) {
  const known = new Set(chain.tokens.map((t) => t.address));
  const held = await new SolanaClient(chain.rpcUrl).getAllTokenBalances(owner);
  return held
    .filter((h) => h.balance > 0n && !known.has(h.mint))
    .map((h) => ({ address: h.mint, balance: h.balance, decimals: h.decimals, coingeckoId: listed[h.mint] }));
}

/**
 * Looks for coins in the wallet, at most every few hours unless forced. Returns true if
 * the list of shown coins changed.
 */
export async function scanFound(owners: { evm: string; solana: string }, force = false): Promise<boolean> {
  await loadFound();
  const owner = `${owners.evm}|${owners.solana}`;
  if (state!.owner !== owner) state = { ...emptyState(owner), enabled: state!.enabled };
  if (!state!.enabled) return false;
  if (!force && Date.now() - state!.scannedAt < SCAN_EVERY_MS) return false;

  const listed = await listedTokens();
  const results = await Promise.all(
    FOUND_CHAINS.map(async (id) => {
      const chain = getChain('mainnet', id);
      try {
        const found =
          chain.kind === 'solana'
            ? await scanSolana(chain, owners.solana, listed[id] ?? {})
            : await scanEvm(chain, owners.evm, listed[id] ?? {});
        return found.map((f) => ({ ...f, chain: id }));
      } catch {
        // Keep what this network had last time.
        return state!.coins.filter((c) => c.chain === id).map((c) => ({ ...c, balance: BigInt(c.balance) }));
      }
    }),
  );
  const held = results.flat();
  const ids = [...new Set(held.flatMap((h) => (h.coingeckoId ? [h.coingeckoId] : [])))];
  const info = ids.length ? await markets(ids) : {};
  const hiddenByYou = new Set(state!.hiddenByYou);
  const before = shownKeys();
  const coins: FoundCoin[] = held.map((h) => {
    const m = h.coingeckoId ? info[h.coingeckoId] : undefined;
    const coin: FoundCoin = {
      chain: h.chain,
      address: h.address,
      symbol: m?.symbol ?? 'UNKNOWN',
      name: m?.name ?? 'Unknown coin',
      decimals: h.decimals,
      coingeckoId: h.coingeckoId,
      price: m?.price,
      volume: m?.volume,
      balance: h.balance.toString(),
    };
    coin.hidden = hiddenByYou.has(coinKey(h.chain, h.address)) ? 'hidden-by-you' : hiddenReason(coin);
    return coin;
  });
  state = { ...state!, scannedAt: Date.now(), coins };
  await save();
  return shownKeys() !== before;
}

function shownKeys(): string {
  return (state?.coins ?? [])
    .filter((c) => !c.hidden)
    .map((c) => coinKey(c.chain, c.address))
    .sort()
    .join(',');
}

/** For tests. */
export function resetFoundForTests(): void {
  state = null;
  coinList = null;
}
