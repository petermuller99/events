import { getAddress } from 'ethers';
import type { ChainConfig, ChainId, NetworkMode } from './config';
import type { SolanaParsedTx, SolanaTokenBalance } from './solana';
import type { AssetId } from './wallet';

// Activity = money in and out of this wallet. Items come from three places:
//  - sends made in this app (recorded as pending, then tracked until confirmed),
//  - chain data: Transfer event logs on Ethereum/BSC, transactions on Solana,
//  - native coin balance going up on Ethereum/BSC (logs don't cover plain ETH/BNB).

export type ActivityStatus = 'pending' | 'confirmed' | 'failed';

export interface ActivityItem {
  id: string;
  chain: ChainId;
  assetId: AssetId;
  symbol: string;
  decimals: number;
  direction: 'in' | 'out';
  /** Base units, as a decimal string (JSON has no bigint). */
  amount: string;
  /** Who sent it (in) or who it went to (out), when known. */
  counterparty?: string;
  /** Empty for balance-change items, which have no single transaction. */
  hash: string;
  /** Milliseconds since epoch. */
  timestamp: number;
  status: ActivityStatus;
}

export interface ActivityState {
  items: ActivityItem[];
  /** Ethereum/BSC: last block already scanned for Transfer logs. */
  cursors: Partial<Record<ChainId, number>>;
  /** Ethereum/BSC: last seen native balance, to spot incoming ETH/BNB. */
  nativeBalances: Partial<Record<ChainId, string>>;
  /** Chains synced at least once. The first sync only sets a baseline and never notifies. */
  initialized: Partial<Record<ChainId, boolean>>;
  /** Solana: transaction signatures already looked at, newest first. */
  seen?: Partial<Record<ChainId, string[]>>;
}

export const MAX_ITEMS = 300;

export function emptyState(): ActivityState {
  return { items: [], cursors: {}, nativeBalances: {}, initialized: {} };
}

export function activityId(chain: ChainId, hash: string, assetId: AssetId, direction: 'in' | 'out'): string {
  return `${chain}:${hash.toLowerCase()}:${assetId}:${direction}`;
}

/** A Transfer(address,address,uint256) log, already decoded. */
export interface TransferLog {
  token: string;
  from: string;
  to: string;
  value: bigint;
  hash: string;
  timestamp: number;
}

export function fromTransferLogs(chain: ChainConfig, owner: string, logs: TransferLog[]): ActivityItem[] {
  const out: ActivityItem[] = [];
  for (const log of logs) {
    const token = chain.tokens.find((t) => t.address.toLowerCase() === log.token.toLowerCase());
    if (!token) continue;
    const incoming = log.to.toLowerCase() === owner.toLowerCase();
    if (!incoming && log.from.toLowerCase() !== owner.toLowerCase()) continue;
    const direction = incoming ? 'in' : 'out';
    out.push({
      id: activityId(chain.id, log.hash, token.symbol, direction),
      chain: chain.id,
      assetId: token.symbol,
      symbol: token.symbol,
      decimals: token.decimals,
      direction,
      amount: log.value.toString(),
      counterparty: getAddress(incoming ? log.from : log.to),
      hash: log.hash,
      timestamp: log.timestamp,
      status: 'confirmed',
    });
  }
  return out;
}

/** A send just made in this app, before the chain has confirmed it. */
export function pendingSend(
  chain: ChainId,
  asset: { id: AssetId; symbol: string; decimals: number },
  to: string,
  amount: bigint,
  hash: string,
): ActivityItem {
  return {
    id: activityId(chain, hash, asset.id, 'out'),
    chain,
    assetId: asset.id,
    symbol: asset.symbol,
    decimals: asset.decimals,
    direction: 'out',
    amount: amount.toString(),
    counterparty: to,
    hash,
    timestamp: Date.now(),
    status: 'pending',
  };
}

/**
 * Reads one Solana transaction from `owner`'s point of view, using the balance changes
 * Solana records for every account. Token movements win: a USDC send that also paid
 * SOL for the recipient's token account shows as the USDC send only.
 */
export function fromSolanaTx(chain: ChainConfig, owner: string, signature: string, tx: SolanaParsedTx): ActivityItem[] {
  const meta = tx.meta;
  if (!meta || meta.err) return [];
  const timestamp = (tx.blockTime ?? Date.now() / 1000) * 1000;
  const base = { chain: chain.id, hash: signature, timestamp, status: 'confirmed' as const };
  const items: ActivityItem[] = [];

  for (const token of chain.tokens) {
    const deltas = new Map<string, bigint>();
    const sum = (list: SolanaTokenBalance[] | undefined, sign: 1n | -1n) => {
      for (const b of list ?? []) {
        if (b.mint !== token.address || !b.owner) continue;
        deltas.set(b.owner, (deltas.get(b.owner) ?? 0n) + sign * BigInt(b.uiTokenAmount.amount));
      }
    };
    sum(meta.postTokenBalances, 1n);
    sum(meta.preTokenBalances, -1n);
    const mine = deltas.get(owner) ?? 0n;
    if (mine === 0n) continue;
    const direction = mine > 0n ? 'in' : 'out';
    const counterparty = [...deltas.entries()]
      .filter(([who, d]) => who !== owner && (direction === 'in' ? d < 0n : d > 0n))
      .sort((a, b) => (a[1] < b[1] ? -1 : 1) * (direction === 'in' ? 1 : -1))[0]?.[0];
    items.push({
      ...base,
      id: activityId(chain.id, signature, token.symbol, direction),
      assetId: token.symbol,
      symbol: token.symbol,
      decimals: token.decimals,
      direction,
      amount: (mine > 0n ? mine : -mine).toString(),
      counterparty,
    });
  }
  if (items.length) return items;

  const keys = tx.transaction.message.accountKeys.map((k) => (typeof k === 'string' ? k : k.pubkey));
  const i = keys.indexOf(owner);
  if (i < 0) return [];
  // The fee payer (account 0) also paid the fee; leave it out of the amount sent.
  let delta = BigInt(meta.postBalances[i]) - BigInt(meta.preBalances[i]);
  if (i === 0) delta += BigInt(meta.fee);
  if (delta === 0n) return [];
  const direction = delta > 0n ? 'in' : 'out';
  let counterparty: string | undefined;
  let best = 0n;
  keys.forEach((k, j) => {
    if (j === i) return;
    const d = BigInt(meta.postBalances[j]) - BigInt(meta.preBalances[j]);
    const moved = direction === 'in' ? -d : d;
    if (moved > best) {
      best = moved;
      counterparty = k;
    }
  });
  return [
    {
      ...base,
      id: activityId(chain.id, signature, 'native', direction),
      assetId: 'native',
      symbol: chain.nativeSymbol,
      decimals: chain.nativeDecimals,
      direction,
      amount: (delta > 0n ? delta : -delta).toString(),
      counterparty,
    },
  ];
}

export interface MergeResult {
  state: ActivityState;
  /** Items not seen before. */
  added: ActivityItem[];
  /** Existing items whose status changed. */
  updated: ActivityItem[];
}

/**
 * Adds or updates items by id. Chain data wins over local pending records, except
 * that a confirmed or failed status never goes back to pending.
 */
export function mergeItems(state: ActivityState, incoming: ActivityItem[]): MergeResult {
  const byId = new Map(state.items.map((i) => [i.id, i]));
  const added: ActivityItem[] = [];
  const updated: ActivityItem[] = [];
  for (const item of incoming) {
    const existing = byId.get(item.id);
    if (!existing) {
      byId.set(item.id, item);
      added.push(item);
      continue;
    }
    const status = item.status === 'pending' && existing.status !== 'pending' ? existing.status : item.status;
    const merged = { ...existing, ...item, status, counterparty: item.counterparty ?? existing.counterparty };
    if (merged.status !== existing.status) updated.push(merged);
    byId.set(item.id, merged);
  }
  const items = [...byId.values()].sort((a, b) => b.timestamp - a.timestamp).slice(0, MAX_ITEMS);
  return { state: { ...state, items }, added, updated };
}

export function setStatus(state: ActivityState, id: string, status: ActivityStatus): MergeResult {
  const item = state.items.find((i) => i.id === id);
  if (!item || item.status === status) return { state, added: [], updated: [] };
  return mergeItems(state, [{ ...item, status }]);
}

/** Groups items (newest first) into "Today", "Yesterday" and dated sections. */
export function groupByDay(items: ActivityItem[], now = new Date()): { title: string; items: ActivityItem[] }[] {
  const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const today = startOfDay(now);
  const yesterday = today - 86_400_000;
  const groups: { title: string; items: ActivityItem[] }[] = [];
  for (const item of items) {
    const day = startOfDay(new Date(item.timestamp));
    const title =
      day === today
        ? 'Today'
        : day === yesterday
          ? 'Yesterday'
          : new Date(day).toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' });
    const last = groups[groups.length - 1];
    if (last?.title === title) last.items.push(item);
    else groups.push({ title, items: [item] });
  }
  return groups;
}

export function storageKey(mode: NetworkMode): string {
  return `pearl.activity.${mode}.v1`;
}
