export type ChainId = 'bitcoin' | 'ethereum' | 'bsc' | 'core' | 'solana';
export type NetworkMode = 'testnet' | 'mainnet';
export type TokenSymbol = 'USDT' | 'USDC';

export interface TokenConfig {
  symbol: TokenSymbol;
  /** EVM: 0x… checksummed address. Solana: base58 mint address. (Bitcoin has no tokens.) */
  address: string;
  /** Expected decimals. Checked against the contract at runtime before use. */
  decimals: number;
}

export interface ChainConfig {
  id: ChainId;
  name: string;
  standard: 'ERC-20' | 'BEP-20' | 'SPL' | 'Bitcoin' | 'Core';
  kind: 'evm' | 'solana' | 'bitcoin';
  nativeSymbol: string;
  nativeDecimals: number;
  rpcUrl: string;
  /** EVM chain id; undefined for Solana and Bitcoin. */
  chainId?: number;
  explorerName: string;
  explorerTxUrl: (hash: string) => string;
  explorerAddressUrl: (address: string) => string;
  /** Where to get free test coins, testnet only. */
  faucetUrl?: string;
  tokens: TokenConfig[];
}

export const CHAIN_IDS: ChainId[] = ['bitcoin', 'ethereum', 'bsc', 'core', 'solana'];

// Each URL can be overridden at build time, e.g. EXPO_PUBLIC_ETHEREUM_RPC_URL=https://…
// Expo only inlines EXPO_PUBLIC_* variables written out literally, hence no loop.
const env = {
  ethereumMainnet: process.env.EXPO_PUBLIC_ETHEREUM_RPC_URL,
  ethereumTestnet: process.env.EXPO_PUBLIC_SEPOLIA_RPC_URL,
  bscMainnet: process.env.EXPO_PUBLIC_BSC_RPC_URL,
  bscTestnet: process.env.EXPO_PUBLIC_BSC_TESTNET_RPC_URL,
  coreMainnet: process.env.EXPO_PUBLIC_CORE_RPC_URL,
  coreTestnet: process.env.EXPO_PUBLIC_CORE_TESTNET_RPC_URL,
  solanaMainnet: process.env.EXPO_PUBLIC_SOLANA_RPC_URL,
  solanaTestnet: process.env.EXPO_PUBLIC_SOLANA_DEVNET_RPC_URL,
  bitcoinMainnet: process.env.EXPO_PUBLIC_BITCOIN_API_URL,
  bitcoinTestnet: process.env.EXPO_PUBLIC_BITCOIN_TESTNET_API_URL,
};

export const CHAINS: Record<NetworkMode, Record<ChainId, ChainConfig>> = {
  mainnet: {
    bitcoin: {
      id: 'bitcoin',
      name: 'Bitcoin',
      standard: 'Bitcoin',
      kind: 'bitcoin',
      nativeSymbol: 'BTC',
      nativeDecimals: 8,
      rpcUrl: env.bitcoinMainnet || 'https://mempool.space/api',
      explorerName: 'mempool.space',
      explorerTxUrl: (h) => `https://mempool.space/tx/${h}`,
      explorerAddressUrl: (a) => `https://mempool.space/address/${a}`,
      tokens: [],
    },
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
      ],
    },
    core: {
      id: 'core',
      name: 'Core',
      standard: 'Core',
      kind: 'evm',
      nativeSymbol: 'CORE',
      nativeDecimals: 18,
      rpcUrl: env.coreMainnet || 'https://rpc.coredao.org',
      chainId: 1116,
      explorerName: 'Core Scan',
      explorerTxUrl: (h) => `https://scan.coredao.org/tx/${h}`,
      explorerAddressUrl: (a) => `https://scan.coredao.org/address/${a}`,
      // CORE only: stablecoins on Core are bridged copies, not issued by Tether or Circle.
      tokens: [],
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
    bitcoin: {
      id: 'bitcoin',
      name: 'Bitcoin Testnet',
      standard: 'Bitcoin',
      kind: 'bitcoin',
      nativeSymbol: 'tBTC',
      nativeDecimals: 8,
      rpcUrl: env.bitcoinTestnet || 'https://mempool.space/testnet4/api',
      explorerName: 'mempool.space',
      explorerTxUrl: (h) => `https://mempool.space/testnet4/tx/${h}`,
      explorerAddressUrl: (a) => `https://mempool.space/testnet4/address/${a}`,
      faucetUrl: 'https://mempool.space/testnet4/faucet',
      tokens: [],
    },
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
      faucetUrl: 'https://cloud.google.com/application/web3/faucet/ethereum/sepolia',
      // Real money has only USDT on Ethereum, and there is no official USDT on Sepolia.
      tokens: [],
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
      ],
    },
    core: {
      id: 'core',
      name: 'Core Testnet',
      standard: 'Core',
      kind: 'evm',
      nativeSymbol: 'tCORE2',
      nativeDecimals: 18,
      rpcUrl: env.coreTestnet || 'https://rpc.test2.btcs.network',
      chainId: 1114,
      explorerName: 'Core Scan',
      explorerTxUrl: (h) => `https://scan.test2.btcs.network/tx/${h}`,
      explorerAddressUrl: (a) => `https://scan.test2.btcs.network/address/${a}`,
      faucetUrl: 'https://scan.test2.btcs.network/faucet',
      tokens: [],
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
