import * as btc from '@scure/btc-signer';
import type { HDNodeWallet } from 'ethers';
import type { NetworkMode } from './config';

// Bitcoin: native SegWit (BIP84, bc1q… addresses), the same account BlueWallet and
// Trust Wallet derive from the same phrase. Transactions are built and signed here with
// @scure/btc-signer (audited); balances, coins to spend, fees and broadcasting go
// through a mempool.space-compatible (Esplora) HTTP API.

export const BITCOIN_PATH = "m/84'/0'/0'/0/0";

/**
 * Highest fee rate (sat/vB) the wallet will ever pay. Even busy days rarely pass a few
 * hundred; anything above this means the fee service is wrong or lying.
 */
export const MAX_FEE_RATE = 1000;

export interface BitcoinKey {
  /** Mainnet address (bc1q…). */
  address: string;
  /** Same key on the test network (tb1q…). */
  testAddress: string;
  /** 0x-prefixed compressed public key. */
  publicKey: string;
  /** 0x-prefixed private key. */
  privateKey: string;
}

export type BitcoinSpeed = 'slow' | 'normal' | 'fast';

const network = (mode: NetworkMode) => (mode === 'mainnet' ? btc.NETWORK : btc.TEST_NETWORK);

function hexToBytes(hex: string): Uint8Array {
  const h = hex.replace(/^0x/, '');
  const out = new Uint8Array(h.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(h.slice(i * 2, i * 2 + 2), 16);
  return out;
}

export function deriveBitcoinKey(root: HDNodeWallet): BitcoinKey {
  const node = root.derivePath(BITCOIN_PATH);
  const pub = hexToBytes(node.publicKey);
  return {
    address: btc.p2wpkh(pub, btc.NETWORK).address!,
    testAddress: btc.p2wpkh(pub, btc.TEST_NETWORK).address!,
    publicKey: node.publicKey,
    privateKey: node.privateKey,
  };
}

export function bitcoinAddress(key: BitcoinKey, mode: NetworkMode): string {
  return mode === 'mainnet' ? key.address : key.testAddress;
}

/** 'ok', 'wrong-network' (a test address in real money mode or the other way round) or 'invalid'. */
export function checkBitcoinAddress(address: string, mode: NetworkMode): 'ok' | 'wrong-network' | 'invalid' {
  const decodes = (net: typeof btc.NETWORK) => {
    try {
      btc.Address(net).decode(address);
      return true;
    } catch {
      return false;
    }
  };
  if (decodes(network(mode))) return 'ok';
  return decodes(network(mode === 'mainnet' ? 'testnet' : 'mainnet')) ? 'wrong-network' : 'invalid';
}

export interface Utxo {
  txid: string;
  vout: number;
  value: number;
  status: { confirmed: boolean };
}

export interface EsploraTx {
  txid: string;
  fee: number;
  status: { confirmed: boolean; block_time?: number };
  vin: { prevout: { scriptpubkey_address?: string; value: number } | null }[];
  vout: { scriptpubkey_address?: string; value: number }[];
}

/** A prepared transfer: what will be spent and paid, ready to sign. */
export interface BitcoinPlan {
  inputs: { txid: string; index: number; amount: string }[];
  outputs: { address: string; amount: string }[];
  fee: string;
}

/** Rough size of a 1-input, 2-output native SegWit transfer, for showing fees up front. */
export const TYPICAL_VBYTES = 141;

type FetchFn = typeof fetch;

export class BitcoinClient {
  constructor(
    private readonly apiUrl: string,
    private readonly fetchFn: FetchFn = (...args) => fetch(...args),
  ) {}

  private async get<T>(path: string): Promise<T> {
    const res = await this.fetchFn(`${this.apiUrl}${path}`);
    if (!res.ok) throw new Error(`Bitcoin service error ${res.status}`);
    return (await res.json()) as T;
  }

  /** Balance in satoshi, including payments still waiting to be confirmed. */
  async getBalance(address: string): Promise<bigint> {
    const r = await this.get<{
      chain_stats: { funded_txo_sum: number; spent_txo_sum: number };
      mempool_stats: { funded_txo_sum: number; spent_txo_sum: number };
    }>(`/address/${address}`);
    const sum = (s: { funded_txo_sum: number; spent_txo_sum: number }) => BigInt(s.funded_txo_sum) - BigInt(s.spent_txo_sum);
    return sum(r.chain_stats) + sum(r.mempool_stats);
  }

  getUtxos(address: string): Promise<Utxo[]> {
    return this.get<Utxo[]>(`/address/${address}/utxo`);
  }

  /** Fee rates in sat/vB for each speed. */
  async getFeeRates(): Promise<Record<BitcoinSpeed, number>> {
    const r = await this.get<{ fastestFee: number; halfHourFee: number; hourFee: number; economyFee: number; minimumFee: number }>(
      '/v1/fees/recommended',
    );
    const rate = (n: unknown) => {
      if (typeof n !== 'number' || !Number.isFinite(n)) throw new Error('Could not read Bitcoin network fees');
      const v = Math.max(1, Math.ceil(n));
      if (v > MAX_FEE_RATE) throw new Error('Bitcoin network fees look unusually high right now. Try again later.');
      return v;
    };
    return { slow: rate(r.economyFee), normal: rate(r.hourFee), fast: rate(r.fastestFee) };
  }

  /** Newest transactions touching the address (confirmed and waiting). */
  getTransactions(address: string): Promise<EsploraTx[]> {
    return this.get<EsploraTx[]>(`/address/${address}/txs`);
  }

  async getStatus(txid: string): Promise<'pending' | 'confirmed'> {
    const r = await this.get<{ confirmed: boolean }>(`/tx/${txid}/status`);
    return r.confirmed ? 'confirmed' : 'pending';
  }

  /** Broadcasts a signed transaction (hex) and returns its txid. */
  /** Sends a signed payment. Returns the txid the network reported (callers use their own). */
  async broadcast(hex: string): Promise<string> {
    const res = await this.fetchFn(`${this.apiUrl}/tx`, { method: 'POST', body: hex });
    const text = await res.text();
    if (!res.ok) throw new Error(`Bitcoin network refused the payment: ${text.slice(0, 160)}`);
    return text.trim();
  }
}

/**
 * Picks coins to spend and builds the outputs: the payment, plus change back to us.
 * Throws if the balance can't cover the amount and fee.
 */
export function planTransfer(
  key: BitcoinKey,
  mode: NetworkMode,
  utxos: Utxo[],
  to: string,
  amount: bigint,
  feeRate: number,
): BitcoinPlan {
  if (!Number.isInteger(feeRate) || feeRate < 1 || feeRate > MAX_FEE_RATE) throw new Error('Unusual Bitcoin fee rate');
  const net = network(mode);
  const from = btc.p2wpkh(hexToBytes(key.publicKey), net);
  const inputs = utxos.map((u) => ({
    txid: u.txid,
    index: u.vout,
    witnessUtxo: { script: from.script, amount: BigInt(u.value) },
  }));
  const selected = btc.selectUTXO(inputs, [{ address: to, amount }], 'default', {
    changeAddress: from.address!,
    feePerByte: BigInt(feeRate),
    network: net,
    bip69: true,
    createTx: true,
  });
  if (!selected?.tx || selected.fee == null) throw new Error('Not enough bitcoin to send this amount and pay the fee');
  const tx = selected.tx;
  const plan: BitcoinPlan = { inputs: [], outputs: [], fee: selected.fee.toString() };
  for (let i = 0; i < tx.inputsLength; i++) {
    const input = tx.getInput(i);
    plan.inputs.push({
      txid: toHex(input.txid!),
      index: input.index!,
      amount: input.witnessUtxo!.amount.toString(),
    });
  }
  for (let i = 0; i < tx.outputsLength; i++) {
    const o = tx.getOutput(i);
    plan.outputs.push({ address: btc.Address(net).encode(btc.OutScript.decode(o.script!)), amount: o.amount!.toString() });
  }
  return plan;
}

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Signs a plan. Before signing, checks it pays exactly `amount` to `to`, returns any
 * change only to our own address, and that the fee is what was shown.
 */
export function signPlan(
  key: BitcoinKey,
  mode: NetworkMode,
  plan: BitcoinPlan,
  to: string,
  amount: bigint,
): { hex: string; txid: string } {
  const net = network(mode);
  const from = btc.p2wpkh(hexToBytes(key.publicKey), net);
  const own = from.address!;
  const paid = plan.outputs.filter((o) => o.address === to);
  const other = plan.outputs.filter((o) => o.address !== to && o.address !== own);
  if (paid.length !== 1 || BigInt(paid[0].amount) !== amount || other.length) {
    throw new Error('Payment details changed, please review again');
  }
  const totalIn = plan.inputs.reduce((s, i) => s + BigInt(i.amount), 0n);
  const totalOut = plan.outputs.reduce((s, o) => s + BigInt(o.amount), 0n);
  if (totalIn - totalOut !== BigInt(plan.fee)) throw new Error('Fee changed, please review again');

  const tx = new btc.Transaction();
  for (const i of plan.inputs) {
    tx.addInput({ txid: i.txid, index: i.index, witnessUtxo: { script: from.script, amount: BigInt(i.amount) } });
  }
  for (const o of plan.outputs) tx.addOutputAddress(o.address, BigInt(o.amount), net);
  tx.sign(hexToBytes(key.privateKey));
  tx.finalize();
  return { hex: tx.hex, txid: tx.id };
}

/** Money in or out of `address` in one transaction: positive in, negative out (fee included). */
export function netChange(tx: EsploraTx, address: string): bigint {
  const received = tx.vout.filter((o) => o.scriptpubkey_address === address).reduce((s, o) => s + BigInt(o.value), 0n);
  const spent = tx.vin
    .filter((i) => i.prevout?.scriptpubkey_address === address)
    .reduce((s, i) => s + BigInt(i.prevout!.value), 0n);
  return received - spent;
}
