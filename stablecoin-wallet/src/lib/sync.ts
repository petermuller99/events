import AsyncStorage from '@react-native-async-storage/async-storage';
import { id as keccakId, zeroPadValue } from 'ethers';
import {
  activityId,
  emptyState,
  fromSolanaTx,
  fromTransferLogs,
  mergeItems,
  setStatus,
  storageKey,
  type ActivityItem,
  type ActivityState,
  type TransferLog,
} from './activity';
import { CHAIN_IDS, getChain, type ChainConfig, type ChainId, type NetworkMode } from './config';
import * as evm from './evm';
import { associatedTokenAddress, SolanaClient } from './solana';

export interface WatchedAddresses {
  evm: string;
  /** Missing in watch state saved by versions before Solana support. */
  solana?: string;
}

export interface SyncOutcome {
  items: ActivityItem[];
  /** New incoming money since the last sync (never includes the first sync's backlog). */
  received: ActivityItem[];
  /** Own sends that just became confirmed or failed. */
  settled: ActivityItem[];
}

// Public RPCs cap eth_getLogs ranges, so scan in small chunks and cap the catch-up.
const LOG_CHUNK = 2000;
const MAX_CHUNKS = 10;
/** On the very first sync, look back this many blocks. */
const INITIAL_LOOKBACK = 2000;
/** Give up on a pending send after this long; it was dropped and the money never left. */
const PENDING_TIMEOUT_MS: Record<ChainConfig['kind'], number> = {
  evm: 6 * 3600_000,
  // A Solana transaction expires with its blockhash after about a minute.
  solana: 5 * 60_000,
};
/** Solana: how many recent signatures to look at per address, and how many to remember. */
const SOLANA_SIGNATURES = 10;
const SOLANA_SEEN_MAX = 200;
const TRANSFER_TOPIC = keccakId('Transfer(address,address,uint256)');

export async function loadActivity(mode: NetworkMode): Promise<ActivityState> {
  try {
    const raw = await AsyncStorage.getItem(storageKey(mode));
    if (!raw) return emptyState();
    const state = { ...emptyState(), ...(JSON.parse(raw) as ActivityState) };
    // Drop history of networks no longer supported (Tron was removed).
    return { ...state, items: state.items.filter((i) => CHAIN_IDS.includes(i.chain)) };
  } catch {
    return emptyState();
  }
}

async function saveActivity(mode: NetworkMode, state: ActivityState): Promise<void> {
  await AsyncStorage.setItem(storageKey(mode), JSON.stringify(state));
}

/** Stores a send made in this app as pending, so it shows up straight away. */
export async function recordSend(mode: NetworkMode, item: ActivityItem): Promise<ActivityItem[]> {
  const { state } = mergeItems(await loadActivity(mode), [item]);
  await saveActivity(mode, state);
  return state.items;
}

export function clearActivity(): Promise<void> {
  return AsyncStorage.multiRemove([storageKey('mainnet'), storageKey('testnet')]);
}

interface ChainSync {
  items: ActivityItem[];
  cursor?: number;
  nativeBalance?: string;
  seen?: string[];
}

const solanaClients = new Map<string, SolanaClient>();
function solana(chain: ChainConfig): SolanaClient {
  let c = solanaClients.get(chain.rpcUrl);
  if (!c) solanaClients.set(chain.rpcUrl, (c = new SolanaClient(chain.rpcUrl)));
  return c;
}

/**
 * Solana has no "transfers for this address" query. Token transfers are recorded on
 * the token accounts, so look at recent signatures for the wallet and for each of its
 * token accounts, then read only the transactions not seen before.
 */
async function syncSolana(chain: ChainConfig, owner: string, state: ActivityState): Promise<ChainSync> {
  const client = solana(chain);
  const watched = [owner, ...chain.tokens.map((t) => associatedTokenAddress(owner, t.address))];
  const lists = await Promise.all(watched.map((a) => client.getSignatures(a, SOLANA_SIGNATURES)));
  const seen = new Set(state.seen?.solana ?? []);
  const fresh = [...new Set(lists.flat().filter((s) => !s.err).map((s) => s.signature))].filter((s) => !seen.has(s));
  const txs = await Promise.all(fresh.map((sig) => client.getParsedTransaction(sig)));
  const items = fresh.flatMap((sig, i) => (txs[i] ? fromSolanaTx(chain, owner, sig, txs[i]!) : []));
  return { items, seen: [...fresh, ...(state.seen?.solana ?? [])].slice(0, SOLANA_SEEN_MAX) };
}

async function syncEvm(chain: ChainConfig, owner: string, state: ActivityState): Promise<ChainSync> {
  const provider = evm.getProvider(chain);
  // Ask the node directly: ethers may answer getBlockNumber from a short-lived cache.
  const [latestHex, balance] = await Promise.all([provider.send('eth_blockNumber', []), provider.getBalance(owner)]);
  const latest = Number(latestHex);
  const prevCursor = state.cursors[chain.id];
  let from = prevCursor != null ? prevCursor + 1 : Math.max(0, latest - INITIAL_LOOKBACK);
  // After a long time offline, skip ahead; older activity is left to the block explorer.
  from = Math.max(from, latest - LOG_CHUNK * MAX_CHUNKS);

  const me = zeroPadValue(owner, 32);
  const tokens = chain.tokens.map((t) => t.address);
  const raw: { token: string; from: string; to: string; value: bigint; hash: string; block: number }[] = [];
  let cursor = prevCursor ?? from - 1;
  for (let start = from; start <= latest; start += LOG_CHUNK) {
    const end = Math.min(latest, start + LOG_CHUNK - 1);
    const range = { address: tokens, fromBlock: start, toBlock: end };
    const [incoming, outgoing] = await Promise.all([
      provider.getLogs({ ...range, topics: [TRANSFER_TOPIC, null, me] }),
      provider.getLogs({ ...range, topics: [TRANSFER_TOPIC, me] }),
    ]);
    for (const log of [...incoming, ...outgoing]) {
      raw.push({
        token: log.address,
        from: '0x' + log.topics[1].slice(26),
        to: '0x' + log.topics[2].slice(26),
        value: BigInt(log.data),
        hash: log.transactionHash,
        block: log.blockNumber,
      });
    }
    cursor = end;
  }

  const blocks = [...new Set(raw.map((r) => r.block))];
  const times = new Map<number, number>();
  await Promise.all(
    blocks.map(async (n) => times.set(n, ((await provider.getBlock(n))?.timestamp ?? Date.now() / 1000) * 1000)),
  );
  const logs: TransferLog[] = raw.map((r) => ({ ...r, timestamp: times.get(r.block) ?? Date.now() }));
  const items = fromTransferLogs(chain, owner, logs);

  // Plain ETH/BNB transfers emit no logs, so spot incoming ones from the balance going up.
  const prevBalance = state.nativeBalances[chain.id];
  if (prevBalance != null && balance > BigInt(prevBalance)) {
    items.push({
      id: activityId(chain.id, `balance-${latest}`, 'native', 'in'),
      chain: chain.id,
      assetId: 'native',
      symbol: chain.nativeSymbol,
      decimals: chain.nativeDecimals,
      direction: 'in',
      amount: (balance - BigInt(prevBalance)).toString(),
      hash: '',
      timestamp: Date.now(),
      status: 'confirmed',
    });
  }
  return { items, cursor, nativeBalance: balance.toString() };
}

async function checkPending(chain: ChainConfig, item: ActivityItem): Promise<ActivityItem['status']> {
  const status =
    chain.kind === 'solana'
      ? await solana(chain).getStatus(item.hash)
      : await evm.getProvider(chain).getTransactionReceipt(item.hash).then((r) =>
        r == null ? 'pending' : r.status === 1 ? 'confirmed' : 'failed',
      );
  if (status === 'pending' && Date.now() - item.timestamp > PENDING_TIMEOUT_MS[chain.kind]) return 'failed';
  return status;
}

const running = new Map<NetworkMode, Promise<SyncOutcome>>();

/** Fetches new activity on all chains. Concurrent calls for the same mode share one run. */
export function syncActivity(mode: NetworkMode, addresses: WatchedAddresses): Promise<SyncOutcome> {
  let run = running.get(mode);
  if (!run) {
    run = doSync(mode, addresses).finally(() => running.delete(mode));
    running.set(mode, run);
  }
  return run;
}

async function doSync(mode: NetworkMode, addresses: WatchedAddresses): Promise<SyncOutcome> {
  let state = await loadActivity(mode);
  const wasInitialized = { ...state.initialized };
  const results = await Promise.all(
    CHAIN_IDS.map(async (id): Promise<[ChainId, ChainSync | null]> => {
      const chain = getChain(mode, id);
      const owner = id === 'solana' ? addresses.solana : addresses.evm;
      if (!owner) return [id, null];
      try {
        const result =
          chain.kind === 'solana' ? await syncSolana(chain, owner, state) : await syncEvm(chain, owner, state);
        return [id, result];
      } catch {
        return [id, null];
      }
    }),
  );

  const added: ActivityItem[] = [];
  const updated: ActivityItem[] = [];
  for (const [id, result] of results) {
    if (!result) continue;
    const merged = mergeItems(state, result.items);
    state = merged.state;
    added.push(...merged.added.filter(() => wasInitialized[id]));
    updated.push(...merged.updated);
    state = {
      ...state,
      cursors: result.cursor != null ? { ...state.cursors, [id]: result.cursor } : state.cursors,
      nativeBalances:
        result.nativeBalance != null ? { ...state.nativeBalances, [id]: result.nativeBalance } : state.nativeBalances,
      initialized: { ...state.initialized, [id]: true },
      seen: result.seen ? { ...state.seen, [id]: result.seen } : state.seen,
    };
  }

  const pending = state.items.filter((i) => i.status === 'pending' && i.hash);
  const statuses = await Promise.all(
    pending.map((i) => checkPending(getChain(mode, i.chain), i).catch(() => 'pending' as const)),
  );
  pending.forEach((item, k) => {
    const res = setStatus(state, item.id, statuses[k]);
    state = res.state;
    updated.push(...res.updated);
  });

  await saveActivity(mode, state);
  const settledIds = new Set<string>();
  const settled = updated.filter(
    (i) => i.direction === 'out' && i.status !== 'pending' && !settledIds.has(i.id) && settledIds.add(i.id),
  );
  return { items: state.items, received: added.filter((i) => i.direction === 'in'), settled };
}
