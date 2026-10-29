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
  const feePerGas = feeData.maxFeePerGas ?? feeData.gasPrice;
  if (feePerGas == null) throw new Error('Could not read network fees');
  return { gasLimit, feePerGas, maxFee: gasLimit * feePerGas };
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
  const sent = await wallet.sendTransaction({ ...tx, gasLimit: quote.gasLimit });
  return sent.hash;
}
