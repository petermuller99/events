import { isAddress } from 'ethers';
import {
  CHAIN_IDS,
  getChain,
  TRONGRID_API_KEY,
  type ChainConfig,
  type ChainId,
  type NetworkMode,
  type TokenSymbol,
} from './config';
import * as evm from './evm';
import type { WalletKeys } from './keys';
import {
  associatedTokenAddress,
  checkSolanaAddress,
  compileMessage,
  createTokenAccountInstruction,
  priorityFeeInstructions,
  PRIORITY_FEE,
  RENT_EXEMPT_MINIMUM,
  SIGNATURE_FEE,
  signTransaction as signSolanaTransaction,
  SolanaClient,
  transferSolInstruction,
  transferTokenInstruction,
} from './solana';
import { signTronTransaction, TronClient } from './tron';
import { isValidTronAddress } from './tron-address';

// Chain-agnostic API used by the screens. Everything below dispatches to the
// EVM implementation (Ethereum, BSC), the Tron one or the Solana one.

export type AssetId = 'native' | TokenSymbol;

export interface Asset {
  chain: ChainId;
  id: AssetId;
  symbol: string;
  decimals: number;
  /** Token contract; undefined for the native coin. */
  contract?: string;
}

export interface ChainBalances {
  chain: ChainConfig;
  address: string;
  assets: { asset: Asset; balance: bigint }[];
  error?: string;
}

function accountFor(keys: WalletKeys, chain: ChainId) {
  return chain === 'tron' ? keys.tron : chain === 'solana' ? keys.solana : keys.evm;
}

export function addressFor(keys: WalletKeys, chain: ChainId): string {
  return accountFor(keys, chain).address;
}

function privateKeyFor(keys: WalletKeys, chain: ChainId): string {
  return accountFor(keys, chain).privateKey;
}

export function listAssets(mode: NetworkMode, chainId: ChainId): Asset[] {
  const chain = getChain(mode, chainId);
  return [
    ...chain.tokens.map((t) => ({
      chain: chainId,
      id: t.symbol as AssetId,
      symbol: t.symbol,
      decimals: t.decimals,
      contract: t.address,
    })),
    { chain: chainId, id: 'native', symbol: chain.nativeSymbol, decimals: chain.nativeDecimals },
  ];
}

export function findAsset(mode: NetworkMode, chainId: ChainId, id: AssetId): Asset | undefined {
  return listAssets(mode, chainId).find((a) => a.id === id);
}

const tronClients = new Map<string, TronClient>();
function tronClient(chain: ChainConfig): TronClient {
  let client = tronClients.get(chain.rpcUrl);
  if (!client) {
    client = new TronClient(chain.rpcUrl, TRONGRID_API_KEY);
    tronClients.set(chain.rpcUrl, client);
  }
  return client;
}

const solanaClients = new Map<string, SolanaClient>();
export function solanaClient(chain: ChainConfig): SolanaClient {
  let client = solanaClients.get(chain.rpcUrl);
  if (!client) solanaClients.set(chain.rpcUrl, (client = new SolanaClient(chain.rpcUrl)));
  return client;
}

// Guards against a wrong decimals value in config, which would make amounts off by
// orders of magnitude. Checked once per contract per app session.
const verifiedDecimals = new Set<string>();
async function verifyDecimals(chain: ChainConfig, asset: Asset): Promise<void> {
  if (!asset.contract) return;
  const key = `${chain.id}:${chain.rpcUrl}:${asset.contract}`;
  if (verifiedDecimals.has(key)) return;
  const onChain =
    chain.kind === 'tron'
      ? await tronClient(chain).getTokenDecimals(asset.contract)
      : chain.kind === 'solana'
        ? await solanaClient(chain).getTokenDecimals(asset.contract)
        : await evm.getTokenDecimals(chain, asset.contract);
  if (onChain !== asset.decimals) {
    throw new Error(`${asset.symbol} contract reports ${onChain} decimals, expected ${asset.decimals}`);
  }
  verifiedDecimals.add(key);
}

async function getBalance(chain: ChainConfig, asset: Asset, owner: string): Promise<bigint> {
  await verifyDecimals(chain, asset);
  if (chain.kind === 'tron') {
    const client = tronClient(chain);
    return asset.contract ? client.getTokenBalance(owner, asset.contract) : client.getTrxBalance(owner);
  }
  if (chain.kind === 'solana') {
    const client = solanaClient(chain);
    return asset.contract ? client.getTokenBalance(owner, asset.contract) : client.getSolBalance(owner);
  }
  return asset.contract
    ? evm.getTokenBalance(chain, asset.contract, owner)
    : evm.getNativeBalance(chain, owner);
}

export async function fetchChainBalances(
  mode: NetworkMode,
  keys: WalletKeys,
  chainId: ChainId,
): Promise<ChainBalances> {
  const chain = getChain(mode, chainId);
  const address = addressFor(keys, chainId);
  const assets = listAssets(mode, chainId);
  try {
    const balances = await Promise.all(assets.map((a) => getBalance(chain, a, address)));
    return { chain, address, assets: assets.map((asset, i) => ({ asset, balance: balances[i] })) };
  } catch (e) {
    return { chain, address, assets: [], error: errorMessage(e) };
  }
}

export function fetchAllBalances(mode: NetworkMode, keys: WalletKeys): Promise<ChainBalances[]> {
  return Promise.all(CHAIN_IDS.map((c) => fetchChainBalances(mode, keys, c)));
}

/** Returns an error message, or null if `to` is a valid recipient on this chain. */
export function validateRecipient(chainId: ChainId, to: string, ownAddress?: string): string | null {
  const value = to.trim();
  if (!value) return 'Enter a recipient address';
  if (chainId === 'solana') {
    if (value.startsWith('0x')) return 'This is an Ethereum/BSC address. Choose that network instead.';
    const check = checkSolanaAddress(value);
    if (check === 'invalid') {
      return /^T[1-9A-HJ-NP-Za-km-z]{33}$/.test(value)
        ? 'This is a Tron address. Choose the Tron network instead.'
        : 'Not a valid Solana address';
    }
    if (check === 'program') return 'This is a token or program account, not a wallet address';
  } else if (chainId === 'tron') {
    if (value.startsWith('0x')) {
      return 'This is an Ethereum/BSC address. TRC-20 tokens can only go to a Tron address (starts with T).';
    }
    if (!isValidTronAddress(value)) {
      return checkSolanaAddress(value) === 'ok'
        ? 'This is a Solana address. Choose the Solana network instead.'
        : 'Not a valid Tron address';
    }
  } else {
    if (isValidTronAddress(value)) {
      return 'This is a Tron address. Choose the Tron network to send TRC-20 tokens.';
    }
    if (!value.startsWith('0x') && checkSolanaAddress(value) === 'ok') {
      return 'This is a Solana address. Choose the Solana network instead.';
    }
    // isAddress accepts all-lowercase, and verifies the checksum on mixed-case input.
    if (!isAddress(value)) return 'Not a valid address (check for typos)';
  }
  if (ownAddress && (chainId === 'solana' ? value === ownAddress : value.toLowerCase() === ownAddress.toLowerCase())) {
    return 'This is your own address';
  }
  return null;
}

export interface TransferRequest {
  asset: Asset;
  to: string;
  amount: bigint;
}

export interface FeeQuote {
  /** Estimated fee in the chain's native coin, base units. */
  fee: bigint;
  /** True if the fee is an upper bound rather than an estimate. */
  isMaximum: boolean;
  nativeBalance: bigint;
  /** Native coin needed in total: fee, plus the amount when sending the native coin. */
  nativeRequired: bigint;
  notes: string[];
  /** Solana: one-time cost of creating the recipient's token account, included in fee. */
  setupFee?: bigint;
  /** Opaque data passed back to sendTransfer. */
  evmQuote?: evm.EvmFeeQuote;
}

export async function quoteTransfer(
  mode: NetworkMode,
  keys: WalletKeys,
  req: TransferRequest,
): Promise<FeeQuote> {
  const chain = getChain(mode, req.asset.chain);
  const from = addressFor(keys, req.asset.chain);
  const to = req.to.trim();
  await verifyDecimals(chain, req.asset);

  if (chain.kind === 'evm') {
    const [evmQuote, nativeBalance] = await Promise.all([
      evm.estimateTransfer(chain, { from, to, amount: req.amount, token: req.asset.contract }),
      evm.getNativeBalance(chain, from),
    ]);
    const nativeRequired = evmQuote.maxFee + (req.asset.contract ? 0n : req.amount);
    return { fee: evmQuote.maxFee, isMaximum: true, nativeBalance, nativeRequired, notes: [], evmQuote };
  }

  if (chain.kind === 'solana') return quoteSolana(chain, from, to, req);

  const client = tronClient(chain);
  const [params, resources, nativeBalance, recipientActive] = await Promise.all([
    client.getChainParameters(),
    client.getAccountResources(from),
    client.getTrxBalance(from),
    client.isActivated(to),
  ]);
  const notes: string[] = [];
  const bandwidthPrice = BigInt(params.getTransactionFee ?? 1000);
  // Roughly the signed transaction size in bytes, which is what bandwidth is charged on.
  const txBytes = req.asset.contract ? 345 : 270;
  let fee = resources.bandwidth >= txBytes ? 0n : BigInt(txBytes) * bandwidthPrice;

  if (req.asset.contract) {
    const energy = await client.estimateTrc20Energy(from, to, req.asset.contract, req.amount);
    const missing = Math.max(0, energy - resources.energy);
    fee += BigInt(missing) * BigInt(params.getEnergyFee ?? 420);
    if (missing > 0) {
      notes.push(`Uses about ${energy.toLocaleString()} energy; TRX is burned for the energy you don't have.`);
    }
    if (!recipientActive) notes.push('The recipient address has never been used on Tron.');
  } else if (!recipientActive) {
    fee +=
      BigInt(params.getCreateNewAccountFeeInSystemContract ?? 1_000_000) +
      BigInt(params.getCreateAccountFee ?? 100_000);
    notes.push('The recipient is a new Tron account, so activating it costs about 1.1 TRX extra.');
  }
  const nativeRequired = fee + (req.asset.contract ? 0n : req.amount);
  return { fee, isMaximum: false, nativeBalance, nativeRequired, notes };
}

async function quoteSolana(chain: ChainConfig, from: string, to: string, req: TransferRequest): Promise<FeeQuote> {
  const client = solanaClient(chain);
  const nativeBalance = await client.getSolBalance(from);
  let fee = SIGNATURE_FEE + PRIORITY_FEE;
  let setupFee = 0n;
  if (req.asset.contract) {
    // The recipient needs a token account for this coin; the sender pays to create it once.
    if (!(await client.accountExists(associatedTokenAddress(to, req.asset.contract)))) {
      setupFee = await client.getTokenAccountRent();
      fee += setupFee;
    }
    return { fee, isMaximum: false, nativeBalance, nativeRequired: fee, notes: [], setupFee };
  }
  // Plain SOL: Solana requires every account to keep a minimum balance.
  if (req.amount < RENT_EXEMPT_MINIMUM && !(await client.accountExists(to))) {
    throw new Error('This address has never been used. The first SOL sent to it must be at least 0.00089 SOL.');
  }
  const left = nativeBalance - req.amount - fee;
  if (left > 0n && left < RENT_EXEMPT_MINIMUM) {
    throw new Error('Leave at least 0.00089 SOL in your wallet, or send a little less.');
  }
  return { fee, isMaximum: false, nativeBalance, nativeRequired: fee + req.amount, notes: [] };
}

async function sendSolana(chain: ChainConfig, from: string, privateKey: string, to: string, req: TransferRequest) {
  const client = solanaClient(chain);
  const instructions = [...priorityFeeInstructions()];
  if (req.asset.contract) {
    const mint = req.asset.contract;
    // CreateIdempotent does nothing if the recipient's token account already exists.
    instructions.push(
      createTokenAccountInstruction(from, to, mint),
      transferTokenInstruction(
        associatedTokenAddress(from, mint),
        mint,
        associatedTokenAddress(to, mint),
        from,
        req.amount,
        req.asset.decimals,
      ),
    );
  } else {
    instructions.push(transferSolInstruction(from, to, req.amount));
  }
  const message = compileMessage(from, instructions, await client.getLatestBlockhash());
  const { wire, signature } = signSolanaTransaction(message, privateKey);
  await client.sendTransaction(wire);
  return signature;
}

export interface SendResult {
  hash: string;
  explorerUrl: string;
}

export async function sendTransfer(
  mode: NetworkMode,
  keys: WalletKeys,
  req: TransferRequest,
  quote: FeeQuote,
): Promise<SendResult> {
  const chain = getChain(mode, req.asset.chain);
  const from = addressFor(keys, req.asset.chain);
  const to = req.to.trim();
  const privateKey = privateKeyFor(keys, req.asset.chain);
  let hash: string;

  if (chain.kind === 'evm') {
    if (!quote.evmQuote) throw new Error('Missing fee quote');
    hash = await evm.sendTransfer(
      chain,
      privateKey,
      { from, to, amount: req.amount, token: req.asset.contract },
      quote.evmQuote,
    );
  } else if (chain.kind === 'solana') {
    hash = await sendSolana(chain, from, privateKey, to, req);
  } else {
    const client = tronClient(chain);
    const unsigned = req.asset.contract
      ? await client.buildTrc20Transfer(from, to, req.asset.contract, req.amount)
      : await client.buildTrxTransfer(from, to, req.amount);
    hash = await client.broadcast(signTronTransaction(unsigned, privateKey));
  }
  return { hash, explorerUrl: chain.explorerTxUrl(hash) };
}

export function errorMessage(e: unknown): string {
  if (e && typeof e === 'object') {
    const err = e as { shortMessage?: string; message?: string; code?: string };
    if (err.code === 'INSUFFICIENT_FUNDS') return 'Not enough balance to pay the network fee';
    if (err.code === 'NETWORK_ERROR' || err.code === 'TIMEOUT') return 'Network unavailable, try again';
    if (err.code === 'CALL_EXCEPTION') return 'The token contract rejected this transfer. Check your balance.';
    if (err.shortMessage) return err.shortMessage;
    if (err.message) return err.message;
  }
  return String(e);
}
