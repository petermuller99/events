export type ChainId = 'ethereum' | 'bsc' | 'solana';
export type NetworkMode = 'testnet' | 'mainnet';
export type TokenSymbol = 'USDT' | 'USDC';

export interface TokenConfig {
  symbol: TokenSymbol;
  /** EVM: 0x… checksummed address. Solana: base58 mint address. */
  address: string;
  /** Expected decimals. Checked against the contract at runtime before use. */
  decimals: number;
}

export interface ChainConfig {
  id: ChainId;
  name: string;
  standard: 'ERC-20' | 'BEP-20' | 'SPL';
  kind: 'evm' | 'solana';
  nativeSymbol: string;
  nativeDecimals: number;
  rpcUrl: string;
  /** EVM chain id; undefined for Solana. */
  chainId?: number;
  explorerName: string;
  explorerTxUrl: (hash: string) => string;
  explorerAddressUrl: (address: string) => string;
  /** Where to get free test coins, testnet only. */
  faucetUrl?: string;
  tokens: TokenConfig[];
}

export const CHAIN_IDS: ChainId[] = ['ethereum', 'bsc', 'solana'];

// Each URL can be overridden at build time, e.g. EXPO_PUBLIC_ETHEREUM_RPC_URL=https://…
// Expo only inlines EXPO_PUBLIC_* variables written out literally, hence no loop.
const env = {
  ethereumMainnet: process.env.EXPO_PUBLIC_ETHEREUM_RPC_URL,
  ethereumTestnet: process.env.EXPO_PUBLIC_SEPOLIA_RPC_URL,
  bscMainnet: process.env.EXPO_PUBLIC_BSC_RPC_URL,
  bscTestnet: process.env.EXPO_PUBLIC_BSC_TESTNET_RPC_URL,
  solanaMainnet: process.env.EXPO_PUBLIC_SOLANA_RPC_URL,
  solanaTestnet: process.env.EXPO_PUBLIC_SOLANA_DEVNET_RPC_URL,
};

export const CHAINS: Record<NetworkMode, Record<ChainId, ChainConfig>> = {
  mainnet: {
    ethereum: {
      id: 'ethereum',
      name: 'Ethereum',
      standard: 'ERC-20',
      kind: 'evm',
      nativeSymbol: 'ETH',
      nativeDecimals: 18,
      rpcUrl: env.ethereumMainnet || 'https://ethereum-rpc.publicnode.com',
      chainId: 1,
      explorerName: 'Etherscan',
      explorerTxUrl: (h) => `https://etherscan.io/tx/${h}`,
      explorerAddressUrl: (a) => `https://etherscan.io/address/${a}`,
      tokens: [
        { symbol: 'USDT', address: '0xdAC17F958D2ee523a2206206994597C13D831ec7', decimals: 6 },
        { symbol: 'USDC', address: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48', decimals: 6 },
      ],
    },
    bsc: {
      id: 'bsc',
      name: 'BNB Smart Chain',
      standard: 'BEP-20',
      kind: 'evm',
      nativeSymbol: 'BNB',
      nativeDecimals: 18,
      rpcUrl: env.bscMainnet || 'https://bsc-rpc.publicnode.com',
      chainId: 56,
      explorerName: 'BscScan',
      explorerTxUrl: (h) => `https://bscscan.com/tx/${h}`,
      explorerAddressUrl: (a) => `https://bscscan.com/address/${a}`,
      tokens: [
        // Binance-Peg tokens on BSC use 18 decimals, unlike Ethereum.
        { symbol: 'USDT', address: '0x55d398326f99059fF775485246999027B3197955', decimals: 18 },
        { symbol: 'USDC', address: '0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d', decimals: 18 },
      ],
    },
    solana: {
      id: 'solana',
      name: 'Solana',
      standard: 'SPL',
      kind: 'solana',
      nativeSymbol: 'SOL',
      nativeDecimals: 9,
      rpcUrl: env.solanaMainnet || 'https://api.mainnet-beta.solana.com',
      explorerName: 'Solscan',
      explorerTxUrl: (h) => `https://solscan.io/tx/${h}`,
      explorerAddressUrl: (a) => `https://solscan.io/account/${a}`,
      tokens: [
        { symbol: 'USDC', address: 'EPjFWdd5AufqSSqeM2qN1xxybapC8G4wEGGkZwyTDt1v', decimals: 6 },
        { symbol: 'USDT', address: 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB', decimals: 6 },
      ],
    },
  },
  testnet: {
    ethereum: {
      id: 'ethereum',
      name: 'Ethereum Sepolia',
      standard: 'ERC-20',
      kind: 'evm',
      nativeSymbol: 'ETH',
      nativeDecimals: 18,
      rpcUrl: env.ethereumTestnet || 'https://ethereum-sepolia-rpc.publicnode.com',
      chainId: 11155111,
      explorerName: 'Etherscan',
      explorerTxUrl: (h) => `https://sepolia.etherscan.io/tx/${h}`,
      explorerAddressUrl: (a) => `https://sepolia.etherscan.io/address/${a}`,
      faucetUrl: 'https://faucet.circle.com',
      // There is no official USDT on Sepolia; Circle publishes a test USDC.
      tokens: [{ symbol: 'USDC', address: '0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238', decimals: 6 }],
    },
    bsc: {
      id: 'bsc',
      name: 'BSC Testnet',
      standard: 'BEP-20',
      kind: 'evm',
      nativeSymbol: 'tBNB',
      nativeDecimals: 18,
      rpcUrl: env.bscTestnet || 'https://bsc-testnet-rpc.publicnode.com',
      chainId: 97,
      explorerName: 'BscScan',
      explorerTxUrl: (h) => `https://testnet.bscscan.com/tx/${h}`,
      explorerAddressUrl: (a) => `https://testnet.bscscan.com/address/${a}`,
      faucetUrl: 'https://www.bnbchain.org/en/testnet-faucet',
      tokens: [
        { symbol: 'USDT', address: '0x337610d27c682E347C9cD60BD4b3b107C9d34dDd', decimals: 18 },
        { symbol: 'USDC', address: '0x64544969ed7EBf5f083679233325356EbE738930', decimals: 18 },
      ],
    },
    solana: {
      id: 'solana',
      name: 'Solana Devnet',
      standard: 'SPL',
      kind: 'solana',
      nativeSymbol: 'SOL',
      nativeDecimals: 9,
      rpcUrl: env.solanaTestnet || 'https://api.devnet.solana.com',
      explorerName: 'Solscan',
      explorerTxUrl: (h) => `https://solscan.io/tx/${h}?cluster=devnet`,
      explorerAddressUrl: (a) => `https://solscan.io/account/${a}?cluster=devnet`,
      faucetUrl: 'https://faucet.solana.com',
      // Circle's devnet USDC. There is no official USDT on devnet.
      tokens: [{ symbol: 'USDC', address: '4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU', decimals: 6 }],
    },
  },
};

export function getChain(mode: NetworkMode, chain: ChainId): ChainConfig {
  return CHAINS[mode][chain];
}
