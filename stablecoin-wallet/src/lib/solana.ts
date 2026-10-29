import { ed25519 } from '@noble/curves/ed25519';
import { computeHmac, concat, decodeBase58, encodeBase58, getBytes, hexlify, sha256, toBeArray } from 'ethers';

// Solana support without @solana/web3.js: keys, addresses, transactions and a small
// JSON-RPC client. Solana uses ed25519 keys (not secp256k1 like Ethereum and Tron),
// base58 addresses that are the raw 32-byte public key, and its own transaction format.
// The unit tests cross-check all of this against @solana/web3.js.

export const SOLANA_PATH = "m/44'/501'/0'/0'"; // Phantom / Solflare default account

export const SYSTEM_PROGRAM = '11111111111111111111111111111111';
export const TOKEN_PROGRAM = 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA';
export const ASSOCIATED_TOKEN_PROGRAM = 'ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL';
export const COMPUTE_BUDGET_PROGRAM = 'ComputeBudget111111111111111111111111111111';

/** Rent-exempt minimum for a plain account with no data (lamports). */
export const RENT_EXEMPT_MINIMUM = 890_880n;
/** Base fee per signature (lamports). */
export const SIGNATURE_FEE = 5_000n;
/** Small priority fee so sends land when the network is busy: 100k CU at 20k µlamports = 2,000 lamports. */
const COMPUTE_UNIT_LIMIT = 100_000;
const COMPUTE_UNIT_PRICE_MICROLAMPORTS = 20_000n;
export const PRIORITY_FEE = (BigInt(COMPUTE_UNIT_LIMIT) * COMPUTE_UNIT_PRICE_MICROLAMPORTS) / 1_000_000n;

// ---------------------------------------------------------------- base58 / keys

/** 32-byte public key → base58 address. */
export function encodeAddress(bytes: Uint8Array): string {
  if (bytes.length !== 32) throw new Error('Expected 32 bytes');
  return encodeBase58(bytes); // keeps leading zero bytes as leading "1"s
}

/** base58 address → 32 bytes, or null if it isn't one. */
export function decodeAddress(address: string): Uint8Array | null {
  if (!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(address)) return null;
  let zeros = 0;
  while (zeros < address.length && address[zeros] === '1') zeros++;
  try {
    const rest = address.slice(zeros);
    const body = rest ? toBeArray(decodeBase58(rest)) : new Uint8Array();
    const out = new Uint8Array(zeros + body.length);
    out.set(body, zeros);
    return out.length === 32 ? out : null;
  } catch {
    return null;
  }
}

function isOnCurve(bytes: Uint8Array): boolean {
  try {
    ed25519.ExtendedPoint.fromHex(bytes);
    return true;
  } catch {
    return false;
  }
}

export type SolanaAddressCheck = 'ok' | 'invalid' | 'program';

/** Wallet addresses are points on the curve; program-derived addresses are not. */
export function checkSolanaAddress(address: string): SolanaAddressCheck {
  const bytes = decodeAddress(address);
  if (!bytes) return 'invalid';
  return isOnCurve(bytes) ? 'ok' : 'program';
}

/** SLIP-0010 ed25519 derivation (hardened only), as used by Phantom and Solflare. */
export function deriveSolanaKey(seed: Uint8Array | string, path = SOLANA_PATH): { address: string; privateKey: string } {
  let I = getBytes(computeHmac('sha512', new TextEncoder().encode('ed25519 seed'), seed));
  let key = I.slice(0, 32);
  let chain = I.slice(32);
  for (const part of path.replace(/^m\//, '').split('/')) {
    if (!part.endsWith("'")) throw new Error('ed25519 paths must be fully hardened');
    const index = (Number(part.slice(0, -1)) + 0x80000000) >>> 0;
    const data = new Uint8Array(37);
    data.set(key, 1);
    new DataView(data.buffer).setUint32(33, index);
    I = getBytes(computeHmac('sha512', chain, data));
    key = I.slice(0, 32);
    chain = I.slice(32);
  }
  return { address: encodeAddress(ed25519.getPublicKey(key)), privateKey: hexlify(key) };
}

// ---------------------------------------------------------------- PDAs / token accounts

const PDA_MARKER = new TextEncoder().encode('ProgramDerivedAddress');

function findProgramAddress(seeds: Uint8Array[], programId: string): string {
  const program = decodeAddress(programId)!;
  for (let bump = 255; bump >= 0; bump--) {
    const hash = getBytes(sha256(concat([...seeds, new Uint8Array([bump]), program, PDA_MARKER])));
    if (!isOnCurve(hash)) return encodeAddress(hash);
  }
  throw new Error('Could not find a program address');
}

/** The standard token account that holds `mint` for `owner`. */
export function associatedTokenAddress(owner: string, mint: string): string {
  return findProgramAddress(
    [decodeAddress(owner)!, decodeAddress(TOKEN_PROGRAM)!, decodeAddress(mint)!],
    ASSOCIATED_TOKEN_PROGRAM,
  );
}

// ---------------------------------------------------------------- transactions

interface AccountMeta {
  pubkey: string;
  isSigner: boolean;
  isWritable: boolean;
}

export interface Instruction {
  programId: string;
  keys: AccountMeta[];
  data: Uint8Array;
}

function u64(value: bigint): Uint8Array {
  const out = new Uint8Array(8);
  new DataView(out.buffer).setBigUint64(0, value, true);
  return out;
}

function u32(value: number): Uint8Array {
  const out = new Uint8Array(4);
  new DataView(out.buffer).setUint32(0, value, true);
  return out;
}

/** Solana's "compact-u16" length prefix. */
function shortVec(n: number): Uint8Array {
  const out: number[] = [];
  let rem = n;
  for (;;) {
    let elem = rem & 0x7f;
    rem >>= 7;
    if (rem === 0) {
      out.push(elem);
      break;
    }
    elem |= 0x80;
    out.push(elem);
  }
  return new Uint8Array(out);
}

export function transferSolInstruction(from: string, to: string, lamports: bigint): Instruction {
  return {
    programId: SYSTEM_PROGRAM,
    keys: [
      { pubkey: from, isSigner: true, isWritable: true },
      { pubkey: to, isSigner: false, isWritable: true },
    ],
    data: concatBytes(u32(2), u64(lamports)),
  };
}

export function transferTokenInstruction(
  source: string,
  mint: string,
  destination: string,
  owner: string,
  amount: bigint,
  decimals: number,
): Instruction {
  // TransferChecked (12): the token program also checks mint and decimals.
  return {
    programId: TOKEN_PROGRAM,
    keys: [
      { pubkey: source, isSigner: false, isWritable: true },
      { pubkey: mint, isSigner: false, isWritable: false },
      { pubkey: destination, isSigner: false, isWritable: true },
      { pubkey: owner, isSigner: true, isWritable: false },
    ],
    data: concatBytes(new Uint8Array([12]), u64(amount), new Uint8Array([decimals])),
  };
}

/** Creates the recipient's token account if it doesn't exist yet (no-op if it does). */
export function createTokenAccountInstruction(payer: string, owner: string, mint: string): Instruction {
  return {
    programId: ASSOCIATED_TOKEN_PROGRAM,
    keys: [
      { pubkey: payer, isSigner: true, isWritable: true },
      { pubkey: associatedTokenAddress(owner, mint), isSigner: false, isWritable: true },
      { pubkey: owner, isSigner: false, isWritable: false },
      { pubkey: mint, isSigner: false, isWritable: false },
      { pubkey: SYSTEM_PROGRAM, isSigner: false, isWritable: false },
      { pubkey: TOKEN_PROGRAM, isSigner: false, isWritable: false },
    ],
    data: new Uint8Array([1]), // CreateIdempotent
  };
}

export function priorityFeeInstructions(): Instruction[] {
  return [
    { programId: COMPUTE_BUDGET_PROGRAM, keys: [], data: concatBytes(new Uint8Array([2]), u32(COMPUTE_UNIT_LIMIT)) },
    {
      programId: COMPUTE_BUDGET_PROGRAM,
      keys: [],
      data: concatBytes(new Uint8Array([3]), u64(COMPUTE_UNIT_PRICE_MICROLAMPORTS)),
    },
  ];
}

function concatBytes(...parts: Uint8Array[]): Uint8Array {
  return getBytes(concat(parts));
}

/** Compiles a legacy transaction message with `feePayer` as the first (signing) account. */
export function compileMessage(feePayer: string, instructions: Instruction[], recentBlockhash: string): Uint8Array {
  const metas = new Map<string, AccountMeta>();
  const add = (m: AccountMeta) => {
    const prev = metas.get(m.pubkey);
    metas.set(m.pubkey, {
      pubkey: m.pubkey,
      isSigner: (prev?.isSigner ?? false) || m.isSigner,
      isWritable: (prev?.isWritable ?? false) || m.isWritable,
    });
  };
  add({ pubkey: feePayer, isSigner: true, isWritable: true });
  for (const ix of instructions) {
    ix.keys.forEach(add);
    add({ pubkey: ix.programId, isSigner: false, isWritable: false });
  }
  const all = [...metas.values()];
  const rank = (m: AccountMeta) => (m.isSigner ? (m.isWritable ? 0 : 1) : m.isWritable ? 2 : 3);
  // Fee payer first, then signers before non-signers and writable before read-only.
  const ordered = [all[0], ...all.slice(1).sort((a, b) => rank(a) - rank(b))];
  const index = new Map(ordered.map((m, i) => [m.pubkey, i]));

  const header = new Uint8Array([
    ordered.filter((m) => m.isSigner).length,
    ordered.filter((m) => m.isSigner && !m.isWritable).length,
    ordered.filter((m) => !m.isSigner && !m.isWritable).length,
  ]);
  const keys = ordered.map((m) => decodeAddress(m.pubkey)!);
  const blockhash = decodeAddress(recentBlockhash);
  if (!blockhash) throw new Error('Invalid blockhash');
  const ixBytes = instructions.map((ix) =>
    concatBytes(
      new Uint8Array([index.get(ix.programId)!]),
      shortVec(ix.keys.length),
      new Uint8Array(ix.keys.map((k) => index.get(k.pubkey)!)),
      shortVec(ix.data.length),
      ix.data,
    ),
  );
  return concatBytes(
    header,
    shortVec(keys.length),
    ...keys,
    blockhash,
    shortVec(instructions.length),
    ...ixBytes,
  );
}

/** Signs a single-signer message: returns the wire transaction and its signature (= tx id). */
export function signTransaction(message: Uint8Array, privateKey: string): { wire: Uint8Array; signature: string } {
  const sig = ed25519.sign(message, getBytes(privateKey));
  return { wire: concatBytes(shortVec(1), sig, message), signature: encodeBase58(sig) };
}

export function toBase64(bytes: Uint8Array): string {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
}

// ---------------------------------------------------------------- RPC

type FetchFn = typeof fetch;

export interface SolanaTokenBalance {
  accountIndex: number;
  mint: string;
  owner?: string;
  uiTokenAmount: { amount: string; decimals: number };
}

export interface SolanaParsedTx {
  blockTime: number | null;
  meta: {
    err: unknown;
    fee: number;
    preBalances: number[];
    postBalances: number[];
    preTokenBalances?: SolanaTokenBalance[];
    postTokenBalances?: SolanaTokenBalance[];
  } | null;
  transaction: {
    signatures: string[];
    message: { accountKeys: ({ pubkey: string; signer?: boolean } | string)[] };
  };
}

export class SolanaClient {
  private id = 0;
  constructor(
    private readonly rpcUrl: string,
    private readonly fetchFn: FetchFn = (...args) => fetch(...args),
  ) {}

  async call<T>(method: string, params: unknown[] = []): Promise<T> {
    const res = await this.fetchFn(this.rpcUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: ++this.id, method, params }),
    });
    if (!res.ok) throw new Error(`Solana node error ${res.status}`);
    const json = (await res.json()) as { result?: T; error?: { message?: string } };
    if (json.error) throw new Error(`Solana: ${json.error.message ?? 'request failed'}`);
    return json.result as T;
  }

  async getSolBalance(address: string): Promise<bigint> {
    const r = await this.call<{ value: number }>('getBalance', [address, { commitment: 'confirmed' }]);
    return BigInt(r.value);
  }

  /** Sum of all of `owner`'s token accounts for `mint`. */
  async getTokenBalance(owner: string, mint: string): Promise<bigint> {
    const r = await this.call<{
      value: { account: { data: { parsed: { info: { tokenAmount: { amount: string } } } } } }[];
    }>('getTokenAccountsByOwner', [owner, { mint }, { encoding: 'jsonParsed', commitment: 'confirmed' }]);
    return r.value.reduce((sum, a) => sum + BigInt(a.account.data.parsed.info.tokenAmount.amount), 0n);
  }

  /**
   * Reads decimals straight from the mint account, or null if the node won't return it
   * (the public mainnet node answers "not found" for the USDC mint, for both
   * getTokenSupply and getAccountInfo).
   */
  async getTokenDecimals(mint: string): Promise<number | null> {
    const r = await this.call<{ value: { data: { parsed?: { info?: { decimals?: number } } } } | null }>(
      'getAccountInfo',
      [mint, { encoding: 'jsonParsed', commitment: 'confirmed' }],
    );
    return r.value?.data.parsed?.info?.decimals ?? null;
  }

  async accountExists(address: string): Promise<boolean> {
    const r = await this.call<{ value: unknown | null }>('getAccountInfo', [
      address,
      { encoding: 'base64', commitment: 'confirmed' },
    ]);
    return r.value != null;
  }

  async getTokenAccountRent(): Promise<bigint> {
    return BigInt(await this.call<number>('getMinimumBalanceForRentExemption', [165]));
  }

  async getLatestBlockhash(): Promise<string> {
    const r = await this.call<{ value: { blockhash: string } }>('getLatestBlockhash', [{ commitment: 'confirmed' }]);
    return r.value.blockhash;
  }

  async sendTransaction(wire: Uint8Array): Promise<string> {
    return this.call<string>('sendTransaction', [toBase64(wire), { encoding: 'base64', preflightCommitment: 'confirmed' }]);
  }

  async getStatus(signature: string): Promise<'pending' | 'confirmed' | 'failed'> {
    const r = await this.call<{
      value: ({ err: unknown; confirmationStatus?: string } | null)[];
    }>('getSignatureStatuses', [[signature], { searchTransactionHistory: true }]);
    const s = r.value[0];
    if (!s) return 'pending';
    if (s.err) return 'failed';
    return s.confirmationStatus === 'confirmed' || s.confirmationStatus === 'finalized' ? 'confirmed' : 'pending';
  }

  async getSignatures(address: string, limit = 20): Promise<{ signature: string; err: unknown }[]> {
    return this.call('getSignaturesForAddress', [address, { limit, commitment: 'confirmed' }]);
  }

  async getParsedTransaction(signature: string): Promise<SolanaParsedTx | null> {
    return this.call('getTransaction', [
      signature,
      { encoding: 'jsonParsed', maxSupportedTransactionVersion: 0, commitment: 'confirmed' },
    ]);
  }
}
