import { AbiCoder, SigningKey, sha256, toUtf8String } from 'ethers';
import { tronAddressToEvmHex, tronAddressToHex } from './tron-address';

// Talks to a TronGrid-compatible full node over its HTTP API. Tron is not EVM
// JSON-RPC compatible for sending transactions, so this replaces ethers' provider.
// Transactions are built by the node, then checked and signed locally.

export interface TronTransaction {
  txID: string;
  raw_data: { contract: { type: string }[]; [key: string]: unknown };
  raw_data_hex: string;
  visible?: boolean;
  signature?: string[];
}

export interface Trc20HistoryEntry {
  transaction_id: string;
  token_info: { address: string; decimals: number; symbol: string };
  block_timestamp: number;
  from: string;
  to: string;
  type: string;
  value: string;
}

export interface TronHistoryTx {
  txID: string;
  block_timestamp: number;
  ret?: { contractRet?: string }[];
  raw_data: {
    contract: { type: string; parameter: { value: { amount?: number; owner_address?: string; to_address?: string } } }[];
  };
}

/** Maximum TRX (in sun) a TRC-20 call may burn for energy before the network aborts it. */
export const TRC20_FEE_LIMIT_SUN = 100_000_000n; // 100 TRX

const TRANSFER_SELECTOR = 'transfer(address,uint256)';
const TRANSFER_METHOD_ID = 'a9059cbb';

type FetchFn = typeof fetch;

export class TronClient {
  constructor(
    private readonly apiUrl: string,
    private readonly apiKey?: string,
    private readonly fetchFn: FetchFn = (...args) => fetch(...args),
  ) {}

  private async post<T>(path: string, body: unknown): Promise<T> {
    return this.request<T>(path, { method: 'POST', body: JSON.stringify(body) });
  }

  private async request<T>(path: string, init: { method: 'GET' | 'POST'; body?: string }): Promise<T> {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (this.apiKey) headers['TRON-PRO-API-KEY'] = this.apiKey;
    const res = await this.fetchFn(`${this.apiUrl}${path}`, { ...init, headers });
    if (!res.ok) throw new Error(`Tron node error ${res.status} on ${path.split('?')[0]}`);
    const json = (await res.json()) as T & { Error?: string };
    if (json && typeof json === 'object' && 'Error' in json && json.Error) {
      throw new Error(`Tron node: ${json.Error}`);
    }
    return json;
  }

  async getTrxBalance(address: string): Promise<bigint> {
    const account = await this.post<{ balance?: number }>('/wallet/getaccount', {
      address,
      visible: true,
    });
    return BigInt(account.balance ?? 0);
  }

  /** An address only exists on Tron after it first receives TRX; sending to a new one costs extra. */
  async isActivated(address: string): Promise<boolean> {
    const account = await this.post<{ address?: string }>('/wallet/getaccount', {
      address,
      visible: true,
    });
    return Boolean(account.address);
  }

  private async callConstant(
    owner: string,
    contract: string,
    selector: string,
    parameter = '',
  ): Promise<{ result: string; energyUsed: number }> {
    const res = await this.post<{
      result?: { result?: boolean; message?: string };
      constant_result?: string[];
      energy_used?: number;
    }>('/wallet/triggerconstantcontract', {
      owner_address: owner,
      contract_address: contract,
      function_selector: selector,
      parameter,
      visible: true,
    });
    if (!res.result?.result || !res.constant_result?.length) {
      throw new Error(`Contract call ${selector} failed: ${decodeMessage(res.result?.message)}`);
    }
    return { result: res.constant_result[0], energyUsed: res.energy_used ?? 0 };
  }

  async getTokenBalance(owner: string, token: string): Promise<bigint> {
    const param = AbiCoder.defaultAbiCoder().encode(['address'], [tronAddressToEvmHex(owner)]);
    const { result } = await this.callConstant(owner, token, 'balanceOf(address)', param.slice(2));
    return result ? BigInt('0x' + result) : 0n;
  }

  async getTokenDecimals(token: string): Promise<number> {
    // Any valid owner works for a read-only call; use the token contract itself.
    const { result } = await this.callConstant(token, token, 'decimals()');
    return Number(BigInt('0x' + result));
  }

  async getChainParameters(): Promise<Record<string, number>> {
    const res = await this.post<{ chainParameter?: { key: string; value?: number }[] }>(
      '/wallet/getchainparameters',
      {},
    );
    const out: Record<string, number> = {};
    for (const p of res.chainParameter ?? []) out[p.key] = p.value ?? 0;
    return out;
  }

  async getAccountResources(address: string): Promise<{ energy: number; bandwidth: number }> {
    const r = await this.post<{
      freeNetLimit?: number;
      freeNetUsed?: number;
      NetLimit?: number;
      NetUsed?: number;
      EnergyLimit?: number;
      EnergyUsed?: number;
    }>('/wallet/getaccountresource', { address, visible: true });
    return {
      energy: Math.max(0, (r.EnergyLimit ?? 0) - (r.EnergyUsed ?? 0)),
      bandwidth: Math.max(
        0,
        (r.freeNetLimit ?? 0) - (r.freeNetUsed ?? 0) + (r.NetLimit ?? 0) - (r.NetUsed ?? 0),
      ),
    };
  }

  /** Simulates the transfer to learn how much energy it will use. */
  async estimateTrc20Energy(from: string, to: string, token: string, amount: bigint): Promise<number> {
    const { energyUsed } = await this.callConstant(
      from,
      token,
      TRANSFER_SELECTOR,
      encodeTransferParams(to, amount),
    );
    return energyUsed;
  }

  async buildTrc20Transfer(
    from: string,
    to: string,
    token: string,
    amount: bigint,
  ): Promise<TronTransaction> {
    const parameter = encodeTransferParams(to, amount);
    const res = await this.post<{
      result?: { result?: boolean; message?: string };
      transaction?: TronTransaction;
    }>('/wallet/triggersmartcontract', {
      owner_address: from,
      contract_address: token,
      function_selector: TRANSFER_SELECTOR,
      parameter,
      fee_limit: Number(TRC20_FEE_LIMIT_SUN),
      call_value: 0,
      visible: true,
    });
    if (!res.result?.result || !res.transaction) {
      throw new Error(`Could not build transfer: ${decodeMessage(res.result?.message)}`);
    }
    const tx = res.transaction;
    assertTransaction(tx, {
      type: 'TriggerSmartContract',
      owner: from,
      contract: token,
      data: TRANSFER_METHOD_ID + parameter,
      maxFeeLimit: TRC20_FEE_LIMIT_SUN,
    });
    return tx;
  }

  async buildTrxTransfer(from: string, to: string, amountSun: bigint): Promise<TronTransaction> {
    const tx = await this.post<TronTransaction>('/wallet/createtransaction', {
      owner_address: from,
      to_address: to,
      amount: Number(amountSun),
      visible: true,
    });
    assertTransaction(tx, { type: 'TransferContract', owner: from, to, amount: amountSun });
    return tx;
  }

  /** Latest TRC-20 transfers in or out of `address` for one token (TronGrid v1 API). */
  async getTrc20History(address: string, token: string, limit = 50): Promise<Trc20HistoryEntry[]> {
    const res = await this.request<{ data?: Trc20HistoryEntry[] }>(
      `/v1/accounts/${address}/transactions/trc20?limit=${limit}&contract_address=${token}`,
      { method: 'GET' },
    );
    return res.data ?? [];
  }

  /** Latest plain transactions of `address`, including TRX transfers (TronGrid v1 API). */
  async getTrxHistory(address: string, limit = 50): Promise<TronHistoryTx[]> {
    const res = await this.request<{ data?: TronHistoryTx[] }>(
      `/v1/accounts/${address}/transactions?limit=${limit}&only_confirmed=true`,
      { method: 'GET' },
    );
    return res.data ?? [];
  }

  /** 'pending' until the transaction is in a block. */
  async getTransactionStatus(txid: string): Promise<'pending' | 'confirmed' | 'failed'> {
    const info = await this.post<{
      blockNumber?: number;
      result?: string;
      receipt?: { result?: string };
    }>('/wallet/gettransactioninfobyid', { value: txid });
    if (!info.blockNumber) return 'pending';
    if (info.result === 'FAILED') return 'failed';
    const r = info.receipt?.result;
    return r && r !== 'SUCCESS' ? 'failed' : 'confirmed';
  }

  async broadcast(tx: TronTransaction): Promise<string> {
    const res = await this.post<{ result?: boolean; txid?: string; code?: string; message?: string }>(
      '/wallet/broadcasttransaction',
      tx,
    );
    if (!res.result) {
      throw new Error(`Broadcast failed: ${res.code ?? ''} ${decodeMessage(res.message)}`.trim());
    }
    return res.txid ?? tx.txID;
  }
}

export function encodeTransferParams(to: string, amount: bigint): string {
  return AbiCoder.defaultAbiCoder()
    .encode(['address', 'uint256'], [tronAddressToEvmHex(to), amount])
    .slice(2);
}

export function signTronTransaction(tx: TronTransaction, privateKey: string): TronTransaction {
  const sig = new SigningKey(privateKey).sign('0x' + tx.txID);
  // r || s || v, with v = 27/28, as TronWeb produces.
  return { ...tx, signature: [sig.serialized.slice(2)] };
}

/** What a node-built transaction must do, checked against the bytes that get signed. */
export type ExpectedTronTx =
  | { type: 'TransferContract'; owner: string; to: string; amount: bigint }
  | { type: 'TriggerSmartContract'; owner: string; contract: string; data: string; maxFeeLimit: bigint };

/** Longest a node-built transaction may stay valid. Nodes set about 1 minute. */
const MAX_EXPIRATION_MS = 60 * 60_000;

const CONTRACT_TYPES = { TransferContract: 1, TriggerSmartContract: 31 } as const;

/**
 * The node builds the transaction, so before signing decode the signed bytes
 * (raw_data_hex) and check every field: exactly one contract of the expected type,
 * with exactly our owner, recipient or token, amount or call data, no memo or extra
 * fields, a bounded fee limit and expiry. This stops a faulty or malicious node from
 * getting a different transaction signed. The node's JSON is never trusted.
 */
export function assertTransaction(tx: TronTransaction, expected: ExpectedTronTx, now = Date.now()): void {
  if (!tx?.txID || !tx.raw_data_hex) throw new Error('Tron node returned no transaction');
  const rawHex = tx.raw_data_hex.toLowerCase();
  if (!/^([0-9a-f]{2})+$/.test(rawHex) || sha256('0x' + rawHex).slice(2) !== tx.txID.toLowerCase()) {
    throw new Error('Transaction hash mismatch');
  }
  const mismatch = (what: string) => new Error(`Transaction does not match request (${what})`);

  // Transaction.raw: 1 ref_block_bytes, 3 ref_block_num, 4 ref_block_hash, 8 expiration,
  // 11 contract, 14 timestamp, 18 fee_limit. Anything else (memo, auths, scripts) is refused.
  const raw = decodeFields(hexToBytes(rawHex), { 1: 2, 3: 0, 4: 2, 8: 0, 11: 2, 14: 0, 18: 0 });
  const contracts = raw.get(11) ?? [];
  if (contracts.length !== 1) throw new Error('Unexpected transaction type');
  const expiration = one(raw, 8, 'expiration') as bigint | undefined;
  if (expiration == null || expiration > BigInt(now + MAX_EXPIRATION_MS)) throw mismatch('expiry');
  const feeLimit = (one(raw, 18, 'fee limit') as bigint | undefined) ?? 0n;

  // Contract: 1 type, 2 parameter (Any), 5 permission id (must be the owner's, 0).
  const contract = decodeFields(contracts[0] as Uint8Array, { 1: 0, 2: 2, 5: 0 });
  if (one(contract, 1, 'type') !== BigInt(CONTRACT_TYPES[expected.type])) {
    throw new Error('Unexpected transaction type');
  }
  if (((one(contract, 5, 'permission') as bigint | undefined) ?? 0n) !== 0n) throw mismatch('permission');
  const any = decodeFields(one(contract, 2, 'parameter') as Uint8Array, { 1: 2, 2: 2 });
  if (toUtf8String(one(any, 1, 'type url') as Uint8Array) !== `type.googleapis.com/protocol.${expected.type}`) {
    throw new Error('Unexpected transaction type');
  }
  const value = one(any, 2, 'parameter value') as Uint8Array;
  const owner = (f: Map<number, (bigint | Uint8Array)[]>) => bytesToHex(one(f, 1, 'owner') as Uint8Array);

  if (expected.type === 'TransferContract') {
    // TransferContract: 1 owner_address, 2 to_address, 3 amount.
    const f = decodeFields(value, { 1: 2, 2: 2, 3: 0 });
    if (owner(f) !== tronAddressToHex(expected.owner).toLowerCase()) throw mismatch('sender');
    if (bytesToHex(one(f, 2, 'recipient') as Uint8Array) !== tronAddressToHex(expected.to).toLowerCase()) {
      throw mismatch('recipient');
    }
    if (one(f, 3, 'amount') !== expected.amount) throw mismatch('amount');
    if (feeLimit !== 0n) throw mismatch('fee limit');
  } else {
    // TriggerSmartContract: 1 owner_address, 2 contract_address, 3 call_value, 4 data,
    // 5 call_token_value, 6 token_id. No TRX or other tokens may be sent along.
    const f = decodeFields(value, { 1: 2, 2: 2, 3: 0, 4: 2, 5: 0, 6: 0 });
    if (owner(f) !== tronAddressToHex(expected.owner).toLowerCase()) throw mismatch('sender');
    if (bytesToHex(one(f, 2, 'token') as Uint8Array) !== tronAddressToHex(expected.contract).toLowerCase()) {
      throw mismatch('token');
    }
    if (bytesToHex(one(f, 4, 'call data') as Uint8Array) !== expected.data.toLowerCase()) throw mismatch('call data');
    for (const n of [3, 5, 6]) {
      if (((one(f, n, 'call value') as bigint | undefined) ?? 0n) !== 0n) throw mismatch('call value');
    }
    if (feeLimit <= 0n || feeLimit > expected.maxFeeLimit) throw mismatch('fee limit');
  }
}

/**
 * Decodes one protobuf message into field number -> values, allowing only the listed
 * fields with their wire type (0 varint, 2 length-delimited). Throws on anything else.
 */
function decodeFields(bytes: Uint8Array, allowed: Record<number, 0 | 2>): Map<number, (bigint | Uint8Array)[]> {
  const fields = new Map<number, (bigint | Uint8Array)[]>();
  let pos = 0;
  const varint = () => {
    let result = 0n;
    for (let shift = 0n; shift < 70n; shift += 7n) {
      if (pos >= bytes.length) throw new Error('Malformed transaction');
      const b = bytes[pos++];
      result |= BigInt(b & 0x7f) << shift;
      if (!(b & 0x80)) return result;
    }
    throw new Error('Malformed transaction');
  };
  while (pos < bytes.length) {
    const key = varint();
    const field = Number(key >> 3n);
    const wire = Number(key & 7n);
    if (allowed[field] !== wire) throw new Error('Transaction has unexpected fields');
    let val: bigint | Uint8Array;
    if (wire === 0) {
      val = varint();
    } else {
      const len = Number(varint());
      if (pos + len > bytes.length) throw new Error('Malformed transaction');
      val = bytes.subarray(pos, pos + len);
      pos += len;
    }
    fields.set(field, [...(fields.get(field) ?? []), val]);
  }
  return fields;
}

/** The single value of a field (undefined if absent); a repeated field is refused. */
function one(fields: Map<number, (bigint | Uint8Array)[]>, n: number, what: string): bigint | Uint8Array | undefined {
  const v = fields.get(n);
  if (v && v.length > 1) throw new Error(`Transaction has a repeated ${what}`);
  return v?.[0];
}

function hexToBytes(hex: string): Uint8Array {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return out;
}

function bytesToHex(bytes: Uint8Array | undefined): string {
  if (!bytes) return '';
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

export function encodeVarint(value: bigint): string {
  if (value < 0n) throw new Error('Negative varint');
  let out = '';
  let v = value;
  do {
    let byte = Number(v & 0x7fn);
    v >>= 7n;
    if (v > 0n) byte |= 0x80;
    out += byte.toString(16).padStart(2, '0');
  } while (v > 0n);
  return out;
}

/** Tron nodes return error messages hex-encoded. */
function decodeMessage(message?: string): string {
  if (!message) return 'unknown error';
  if (/^[0-9a-f]+$/i.test(message) && message.length % 2 === 0) {
    try {
      return toUtf8String('0x' + message);
    } catch {
      return message;
    }
  }
  return message;
}
