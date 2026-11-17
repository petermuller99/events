import { ed25519 } from '@noble/curves/ed25519';
import { blake2b } from '@noble/hashes/blake2b';
import { encodeBase58, getBytes, hexlify } from 'ethers';
import { deriveSolanaKey } from './solana';

// Sui support without the Sui SDK: keys, addresses, the one kind of transaction Pearl
// Wallet sends (SUI from this wallet to one address) and a small client for Sui's
// GraphQL service (its public JSON-RPC was switched off). Unit tests check addresses,
// transaction bytes, signatures and digests against vectors from the official SDK.
//
// Sui uses ed25519 keys (SLIP-0010, like Solana, on coin type 784), so the same 12 words
// give the same address as Sui's own Slush wallet and Phantom.

export const SUI_PATH = "m/44'/784'/0'/0'/0'";
export const SUI_COIN_TYPE = '0x2::sui::SUI';
const SUI_COIN_OBJECT = `0x2::coin::Coin<${SUI_COIN_TYPE}>`;

/**
 * The most a transfer may spend on fees (MIST). A plain SUI transfer costs about 0.002 SUI
 * (computation plus storage for the new coin, part of which is refunded); the budget is a
 * cap, and only what's used is charged.
 */
export function suiGasBudget(gasPrice: bigint): bigint {
  const floor = 10_000_000n; // 0.01 SUI
  const byPrice = gasPrice * 10_000n;
  return byPrice > floor ? byPrice : floor;
}
/** Refuse a fee price far above normal (a lying server); Sui's is usually 100–1,000 MIST. */
export const SUI_MAX_GAS_PRICE = 100_000n;
/** At most this many coin pieces are combined to pay; Sui allows 256. */
const MAX_GAS_COINS = 100;

const blake = (data: Uint8Array) => blake2b(data, { dkLen: 32 });

function concat(parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  return out;
}

export interface SuiKey {
  address: string;
  /** 32-byte ed25519 seed, hex. */
  privateKey: string;
  publicKey: string;
}

export function deriveSuiKey(seed: Uint8Array | string): SuiKey {
  const { privateKey } = deriveSolanaKey(seed, SUI_PATH);
  const publicKey = ed25519.getPublicKey(getBytes(privateKey));
  return { address: suiAddressOf(publicKey), privateKey, publicKey: hexlify(publicKey) };
}

/** Sui address of an ed25519 public key: blake2b-256 of the scheme flag (0) and the key. */
export function suiAddressOf(publicKey: Uint8Array): string {
  return hexlify(blake(concat([new Uint8Array([0]), publicKey])));
}

/** A full Sui address: 0x and 64 hex digits (lowercase). */
export function isSuiAddress(value: string): boolean {
  return /^0x[0-9a-fA-F]{64}$/.test(value);
}

export function normalizeSuiAddress(value: string): string {
  return value.trim().toLowerCase();
}

// ---------------------------------------------------------------- BCS encoding

class Writer {
  private parts: Uint8Array[] = [];
  bytes(b: Uint8Array) {
    this.parts.push(b);
    return this;
  }
  u8(n: number) {
    return this.bytes(new Uint8Array([n]));
  }
  u16(n: number) {
    return this.bytes(new Uint8Array([n & 0xff, (n >> 8) & 0xff]));
  }
  u64(n: bigint) {
    if (n < 0n || n >= 1n << 64n) throw new Error('u64 out of range');
    const out = new Uint8Array(8);
    for (let i = 0; i < 8; i++) out[i] = Number((n >> BigInt(8 * i)) & 0xffn);
    return this.bytes(out);
  }
  uleb(n: number) {
    const out: number[] = [];
    do {
      let b = n & 0x7f;
      n >>>= 7;
      if (n) b |= 0x80;
      out.push(b);
    } while (n);
    return this.bytes(new Uint8Array(out));
  }
  /** Length-prefixed bytes. */
  vec(b: Uint8Array) {
    return this.uleb(b.length).bytes(b);
  }
  address(a: string) {
    if (!isSuiAddress(a)) throw new Error('Not a Sui address');
    return this.bytes(getBytes(a));
  }
  done(): Uint8Array {
    return concat(this.parts);
  }
}

export interface SuiObjectRef {
  objectId: string;
  version: string;
  /** base58 */
  digest: string;
}

/**
 * Where the SUI comes from. Sui keeps SUI either as coin objects ("coins") or as a plain
 * balance on the address ("address balance"); a wallet can hold either or both.
 */
export type SuiSource =
  | { kind: 'coins'; gasCoins: SuiObjectRef[] }
  | {
      kind: 'address-balance';
      /** Current epoch: the transaction is valid during this epoch and the next. */
      epoch: bigint;
      /** The network's chain identifier (base58), so it can't be replayed elsewhere. */
      chain: string;
      nonce: number;
    };

export interface SuiTransfer {
  sender: string;
  recipient: string;
  /** MIST (1 SUI = 10^9 MIST). */
  amount: bigint;
  source: SuiSource;
  gasPrice: bigint;
  gasBudget: bigint;
}

const SUI_STRUCT_TAG = (w: Writer) =>
  w
    .u8(7) // TypeTag::Struct
    .address('0x' + '0'.repeat(63) + '2')
    .vec(new TextEncoder().encode('sui'))
    .vec(new TextEncoder().encode('SUI'))
    .uleb(0);

const moveCallCoin = (w: Writer, fn: string) =>
  SUI_STRUCT_TAG(
    w
      .u8(0) // Command::MoveCall
      .address('0x' + '0'.repeat(63) + '2')
      .vec(new TextEncoder().encode('coin'))
      .vec(new TextEncoder().encode(fn))
      .uleb(1),
  );

function decodeBase58(s: string): Uint8Array {
  const ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
  let n = 0n;
  for (const ch of s) {
    const i = ALPHABET.indexOf(ch);
    if (i < 0) throw new Error('Bad object digest');
    n = n * 58n + BigInt(i);
  }
  const bytes: number[] = [];
  while (n > 0n) {
    bytes.unshift(Number(n & 0xffn));
    n >>= 8n;
  }
  for (const ch of s) {
    if (ch !== '1') break;
    bytes.unshift(0);
  }
  return new Uint8Array(bytes);
}

/**
 * TransactionData for "split `amount` off the gas coin and send it to `recipient`":
 * the only transaction Pearl Wallet signs on Sui. Built here, field by field, so nothing
 * from a server ends up in it except the coin pieces that pay (which must be ours).
 */
export function encodeSuiTransfer(t: SuiTransfer): Uint8Array {
  if (t.amount <= 0n) throw new Error('Enter an amount');
  const w = new Writer();
  w.u8(0); // TransactionData::V1
  w.u8(0); // TransactionKind::ProgrammableTransaction
  const pureU64 = (n: bigint) => w.u8(0).vec(new Writer().u64(n).done());
  const pureAddress = (a: string) => w.u8(0).vec(new Writer().address(a).done());

  if (t.source.kind === 'coins') {
    if (!t.source.gasCoins.length) throw new Error('No SUI to pay with');
    // Inputs: [amount, recipient]
    w.uleb(2);
    pureU64(t.amount);
    pureAddress(t.recipient);
    w.uleb(2);
    // SplitCoins(GasCoin, [Input(0)])
    w.u8(2).u8(0).uleb(1).u8(1).u16(0);
    // TransferObjects([NestedResult(0, 0)], Input(1))
    w.u8(1).uleb(1).u8(3).u16(0).u16(0).u8(1).u16(1);
  } else {
    // The official SDK's shape for paying from the address balance:
    // Inputs: [recipient, FundsWithdrawal(amount of SUI from the sender), amount, sender]
    w.uleb(4);
    pureAddress(t.recipient);
    SUI_STRUCT_TAG(w.u8(2).u8(0).u64(t.amount).u8(0)).u8(0); // MaxAmountU64, Balance<SUI>, from Sender
    pureU64(t.amount);
    pureAddress(t.sender);
    w.uleb(4);
    // coin = 0x2::coin::redeem_funds<SUI>(Input(1))
    moveCallCoin(w, 'redeem_funds').uleb(1).u8(1).u16(1);
    // SplitCoins(Result(0), [Input(2)])
    w.u8(2).u8(2).u16(0).uleb(1).u8(1).u16(2);
    // 0x2::coin::send_funds<SUI>(Result(0), Input(3)): anything left goes back to the sender
    moveCallCoin(w, 'send_funds').uleb(2).u8(2).u16(0).u8(1).u16(3);
    // TransferObjects([NestedResult(1, 0)], Input(0))
    w.u8(1).uleb(1).u8(3).u16(1).u16(0).u8(1).u16(0);
  }

  w.address(t.sender);
  // GasData: coin objects, or none to pay from the address balance.
  const gasCoins = t.source.kind === 'coins' ? t.source.gasCoins : [];
  w.uleb(gasCoins.length);
  for (const c of gasCoins) {
    const digest = decodeBase58(c.digest);
    if (digest.length !== 32) throw new Error('Bad object digest');
    w.address(c.objectId).u64(BigInt(c.version)).vec(digest);
  }
  w.address(t.sender); // gas owner
  w.u64(t.gasPrice);
  w.u64(t.gasBudget);
  if (t.source.kind === 'coins') {
    w.u8(0); // TransactionExpiration::None
  } else {
    const chain = decodeBase58(t.source.chain);
    if (chain.length !== 32) throw new Error('Bad chain identifier');
    // ValidDuring { minEpoch, maxEpoch, minTimestamp: None, maxTimestamp: None, chain, nonce }
    w.u8(2).u8(1).u64(t.source.epoch).u8(1).u64(t.source.epoch + 1n).u8(0).u8(0).vec(chain);
    w.bytes(new Uint8Array([t.source.nonce & 0xff, (t.source.nonce >>> 8) & 0xff, (t.source.nonce >>> 16) & 0xff, (t.source.nonce >>> 24) & 0xff]));
  }
  return w.done();
}

/** Sui transaction digest: base58 of blake2b-256("TransactionData::" ‖ bytes). */
export function suiDigest(txBytes: Uint8Array): string {
  return encodeBase58(blake(concat([new TextEncoder().encode('TransactionData::'), txBytes])));
}

/** Signs transaction bytes: ed25519 over blake2b-256(intent ‖ bytes); flag ‖ sig ‖ pubkey, base64. */
export function signSuiTransaction(txBytes: Uint8Array, privateKey: string): string {
  const key = getBytes(privateKey);
  const msg = blake(concat([new Uint8Array([0, 0, 0]), txBytes]));
  const sig = ed25519.sign(msg, key);
  return toBase64(concat([new Uint8Array([0]), sig, ed25519.getPublicKey(key)]));
}

export function toBase64(bytes: Uint8Array): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  let out = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const [a, b = 0, c = 0] = [bytes[i], bytes[i + 1], bytes[i + 2]];
    const n = (a << 16) | (b << 8) | c;
    out += chars[(n >> 18) & 63] + chars[(n >> 12) & 63];
    out += i + 1 < bytes.length ? chars[(n >> 6) & 63] : '=';
    out += i + 2 < bytes.length ? chars[n & 63] : '=';
  }
  return out;
}

// ---------------------------------------------------------------- GraphQL client

type FetchFn = (input: string, init?: RequestInit) => Promise<Response>;

export interface SuiCoin extends SuiObjectRef {
  balance: bigint;
}

export interface SuiTx {
  digest: string;
  sender?: string;
  status?: 'SUCCESS' | 'FAILURE';
  timestamp?: string;
  /** SUI balance changes per owner (MIST, signed). */
  changes: { owner: string; amount: bigint }[];
}

export class SuiClient {
  constructor(
    private readonly url: string,
    private readonly fetchFn: FetchFn = (...args) => fetch(...args),
  ) {}

  async query<T>(query: string, variables?: Record<string, unknown>): Promise<T> {
    const res = await this.fetchFn(this.url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query, variables }),
    });
    if (!res.ok) throw new Error(`Sui service error ${res.status}`);
    const json = (await res.json()) as { data?: T; errors?: { message?: string }[] };
    if (json.errors?.length) throw new Error(`Sui: ${json.errors[0].message ?? 'request failed'}`);
    if (!json.data) throw new Error('Sui: empty answer');
    return json.data;
  }

  /** All SUI at the address. */
  async getBalance(address: string): Promise<bigint> {
    return (await this.getBalances(address)).total;
  }

  /** SUI held as coin objects and as the address balance. */
  async getBalances(address: string): Promise<{ total: bigint; coins: bigint; addressBalance: bigint }> {
    const d = await this.query<{
      address: { balance: { totalBalance: string | null; coinBalance: string | null; addressBalance: string | null } | null } | null;
    }>(
      'query($a: SuiAddress!) { address(address: $a) { balance(coinType: "0x2::sui::SUI") { totalBalance coinBalance addressBalance } } }',
      { a: address },
    );
    const b = d.address?.balance;
    return {
      total: BigInt(b?.totalBalance ?? '0'),
      coins: BigInt(b?.coinBalance ?? '0'),
      addressBalance: BigInt(b?.addressBalance ?? '0'),
    };
  }

  /** Fee price, current epoch and chain identifier. */
  async getNetwork(): Promise<{ gasPrice: bigint; epoch: bigint; chain: string }> {
    const d = await this.query<{ chainIdentifier: string; epoch: { epochId: number | string; referenceGasPrice: string } | null }>(
      '{ chainIdentifier epoch { epochId referenceGasPrice } }',
    );
    if (!d.epoch) throw new Error('Could not read Sui fees');
    return { gasPrice: BigInt(d.epoch.referenceGasPrice), epoch: BigInt(d.epoch.epochId), chain: d.chainIdentifier };
  }

  /** SUI coin pieces owned by the address, largest first. */
  async getCoins(address: string): Promise<SuiCoin[]> {
    const d = await this.query<{
      address: {
        objects: { nodes: { address: string; version: number | string; digest: string; contents: { json: { balance?: string } } | null }[] };
      } | null;
    }>(
      `query($a: SuiAddress!) { address(address: $a) { objects(first: 50, filter: { type: "${SUI_COIN_OBJECT}" }) {
        nodes { address version digest contents { json } } } } }`,
      { a: address },
    );
    return (d.address?.objects.nodes ?? [])
      .map((n) => ({ objectId: n.address, version: String(n.version), digest: n.digest, balance: BigInt(n.contents?.json?.balance ?? '0') }))
      .sort((a, b) => (a.balance === b.balance ? 0 : a.balance > b.balance ? -1 : 1))
      .slice(0, MAX_GAS_COINS);
  }

  async execute(txBytes: Uint8Array, signature: string): Promise<{ digest: string; status?: string }> {
    const d = await this.query<{ executeTransaction: { effects: { digest: string; status: string } | null } }>(
      'mutation($t: Base64!, $s: [Base64!]!) { executeTransaction(transactionDataBcs: $t, signatures: $s) { effects { digest status } } }',
      { t: toBase64(txBytes), s: [signature] },
    );
    const effects = d.executeTransaction.effects;
    if (!effects) throw new Error('Sui didn’t accept the payment');
    if (effects.status === 'FAILURE') throw new Error('The payment failed on Sui. Your SUI is still in your wallet.');
    return effects;
  }

  async getStatus(digest: string): Promise<'pending' | 'confirmed' | 'failed'> {
    const d = await this.query<{ transactionEffects: { status: string } | null }>(
      'query($d: String!) { transactionEffects(digest: $d) { status } }',
      { d: digest },
    );
    const s = d.transactionEffects?.status;
    return s === 'SUCCESS' ? 'confirmed' : s === 'FAILURE' ? 'failed' : 'pending';
  }

  /** Recent transactions that touched the address, with their SUI balance changes. */
  async getTransactions(address: string, last = 15): Promise<SuiTx[]> {
    const d = await this.query<{
      address: {
        transactions: {
          nodes: {
            digest: string;
            sender: { address: string } | null;
            effects: {
              status: 'SUCCESS' | 'FAILURE';
              timestamp: string | null;
              balanceChanges: { nodes: { owner: { address: string } | null; amount: string; coinType: { repr: string } | null }[] };
            } | null;
          }[];
        };
      } | null;
    }>(
      `query($a: SuiAddress!, $n: Int!) { address(address: $a) { transactions(last: $n, relation: AFFECTED) { nodes {
        digest sender { address } effects { status timestamp balanceChanges(first: 50) { nodes { owner { address } amount coinType { repr } } } } } } } }`,
      { a: address, n: last },
    );
    return (d.address?.transactions.nodes ?? []).map((n) => ({
      digest: n.digest,
      sender: n.sender?.address,
      status: n.effects?.status,
      timestamp: n.effects?.timestamp ?? undefined,
      changes: (n.effects?.balanceChanges.nodes ?? [])
        .filter((c) => c.owner && isSuiCoinType(c.coinType?.repr))
        .map((c) => ({ owner: c.owner!.address, amount: BigInt(c.amount) })),
    }));
  }
}

/** Matches 0x2::sui::SUI in any address spelling (0x2 or 0x000…0002). */
export function isSuiCoinType(repr?: string): boolean {
  if (!repr) return false;
  const m = /^0x0*2::sui::SUI$/i.exec(repr);
  return !!m;
}

/**
 * Picks the coin pieces that pay for a transfer (largest first) and checks the balance
 * covers amount plus the most the fee can be.
 */
export function pickGasCoins(coins: SuiCoin[], amount: bigint, maxFee: bigint): SuiCoin[] {
  const picked: SuiCoin[] = [];
  let total = 0n;
  for (const c of coins) {
    picked.push(c);
    total += c.balance;
    if (total >= amount + maxFee) return picked;
  }
  throw new Error('Not enough SUI to send this amount and pay the fee');
}
