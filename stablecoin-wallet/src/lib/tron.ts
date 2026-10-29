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
    assertTransaction(tx, 'TriggerSmartContract', [
      tronAddressToHex(from),
      tronAddressToHex(token),
      TRANSFER_METHOD_ID + parameter,
    ]);
    return tx;
  }

  async buildTrxTransfer(from: string, to: string, amountSun: bigint): Promise<TronTransaction> {
    const tx = await this.post<TronTransaction>('/wallet/createtransaction', {
      owner_address: from,
      to_address: to,
      amount: Number(amountSun),
      visible: true,
    });
    assertTransaction(tx, 'TransferContract', [
      tronAddressToHex(from),
      tronAddressToHex(to),
      // TransferContract.amount is protobuf field 3 (varint): tag byte 0x18.
      '18' + encodeVarint(amountSun),
    ]);
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

/**
 * The node builds the transaction, so before signing check that the signed bytes
 * (raw_data_hex) hash to txID and contain the addresses and amount we asked for.
 * This stops a faulty or malicious node from getting a different transfer signed.
 */
export function assertTransaction(tx: TronTransaction, type: string, mustContain: string[]): void {
  if (!tx?.txID || !tx.raw_data_hex) throw new Error('Tron node returned no transaction');
  if (sha256('0x' + tx.raw_data_hex).slice(2) !== tx.txID.toLowerCase()) {
    throw new Error('Transaction hash mismatch');
  }
  if (tx.raw_data.contract?.length !== 1 || tx.raw_data.contract[0].type !== type) {
    throw new Error('Unexpected transaction type');
  }
  const raw = tx.raw_data_hex.toLowerCase();
  for (const part of mustContain) {
    if (!raw.includes(part.toLowerCase())) throw new Error('Transaction does not match request');
  }
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
