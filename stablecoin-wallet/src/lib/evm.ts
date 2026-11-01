import { Contract, JsonRpcProvider, Wallet } from 'ethers';
import type { ChainConfig } from './config';

// Ethereum and BSC are both EVM chains: the same code, keys and address work on
// both; only the RPC endpoint, chain id and token contracts differ.

const ERC20_ABI = [
  'function balanceOf(address owner) view returns (uint256)',
  'function decimals() view returns (uint8)',
  'function transfer(address to, uint256 amount) returns (bool)',
];

const providers = new Map<string, JsonRpcProvider>();

export function getProvider(chain: ChainConfig): JsonRpcProvider {
  const key = `${chain.chainId}:${chain.rpcUrl}`;
  let provider = providers.get(key);
  if (!provider) {
    // staticNetwork skips the eth_chainId round trip ethers would otherwise make per request.
    provider = new JsonRpcProvider(chain.rpcUrl, chain.chainId, { staticNetwork: true });
    providers.set(key, provider);
  }
  return provider;
}

export function getNativeBalance(chain: ChainConfig, address: string): Promise<bigint> {
  return getProvider(chain).getBalance(address);
}

export async function getTokenBalance(chain: ChainConfig, token: string, owner: string): Promise<bigint> {
  const contract = new Contract(token, ERC20_ABI, getProvider(chain));
  return (await contract.balanceOf(owner)) as bigint;
}

export async function getTokenDecimals(chain: ChainConfig, token: string): Promise<number> {
  const contract = new Contract(token, ERC20_ABI, getProvider(chain));
  return Number(await contract.decimals());
}

export interface EvmTransferRequest {
  from: string;
  to: string;
  amount: bigint;
  /** Token contract; omit to send the native coin (ETH/BNB). */
  token?: string;
}

export interface EvmFeeQuote {
  gasLimit: bigint;
  /** Worst-case fee per gas the transaction is allowed to pay. */
  feePerGas: bigint;
  /** EIP-1559 tip, at most feePerGas; undefined for legacy (gasPrice) fees. */
  priorityFeePerGas?: bigint;
  maxFee: bigint;
}

async function buildTx(chain: ChainConfig, req: EvmTransferRequest) {
  if (!req.token) return { from: req.from, to: req.to, value: req.amount };
  const contract = new Contract(req.token, ERC20_ABI, getProvider(chain));
  const tx = await contract.transfer.populateTransaction(req.to, req.amount);
  return { ...tx, from: req.from };
}

export async function estimateTransfer(chain: ChainConfig, req: EvmTransferRequest): Promise<EvmFeeQuote> {
  const provider = getProvider(chain);
  const tx = await buildTx(chain, req);
  const [estimate, feeData] = await Promise.all([provider.estimateGas(tx), provider.getFeeData()]);
  // 20% headroom; unused gas is not charged.
  const gasLimit = (estimate * 120n) / 100n;
  if (feeData.maxFeePerGas != null) {
    const feePerGas = feeData.maxFeePerGas;
    const tip = feeData.maxPriorityFeePerGas ?? 0n;
    const priorityFeePerGas = tip < feePerGas ? tip : feePerGas;
    return { gasLimit, feePerGas, priorityFeePerGas, maxFee: gasLimit * feePerGas };
  }
  if (feeData.gasPrice == null) throw new Error('Could not read network fees');
  return { gasLimit, feePerGas: feeData.gasPrice, maxFee: gasLimit * feeData.gasPrice };
}

export async function sendTransfer(
  chain: ChainConfig,
  privateKey: string,
  req: EvmTransferRequest,
  quote: EvmFeeQuote,
): Promise<string> {
  const wallet = new Wallet(privateKey, getProvider(chain));
  if (wallet.address !== req.from) throw new Error('Key does not match sender');
  const tx = await buildTx(chain, req);
  // Sign exactly the fee the user approved. Without these fields ethers would ask the
  // RPC for fees again after confirmation, and a bad RPC could make the fee much higher.
  const fees =
    quote.priorityFeePerGas != null
      ? { type: 2, maxFeePerGas: quote.feePerGas, maxPriorityFeePerGas: quote.priorityFeePerGas }
      : { type: 0, gasPrice: quote.feePerGas };
  const request = { ...tx, ...fees, gasLimit: quote.gasLimit };
  if (quote.gasLimit * quote.feePerGas > quote.maxFee) throw new Error('Fee changed, please review again');
  const sent = await wallet.sendTransaction(request);
  return sent.hash;
}
