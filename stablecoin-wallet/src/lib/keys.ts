import { HDNodeWallet, Mnemonic } from 'ethers';
import { deriveSolanaKey } from './solana';

// BIP-44 path: coin type 60 is Ethereum (shared by BSC). It matches MetaMask and
// Trust Wallet, so the same phrase restores there too.
export const EVM_PATH = "m/44'/60'/0'/0/0";

export interface AccountKey {
  address: string;
  privateKey: string;
}

export interface WalletKeys {
  /** Used for both Ethereum and BSC. */
  evm: AccountKey;
  /** ed25519 key; privateKey is the 32-byte seed. */
  solana: AccountKey;
}

export function normalizeMnemonic(phrase: string): string {
  return phrase.trim().toLowerCase().split(/\s+/).join(' ');
}

export function isValidMnemonic(phrase: string): boolean {
  return Mnemonic.isValidMnemonic(normalizeMnemonic(phrase));
}

/** Builds a 12-word phrase from 16 bytes of secure randomness supplied by the caller. */
export function mnemonicFromEntropy(entropy: Uint8Array): string {
  if (entropy.length !== 16 && entropy.length !== 32) {
    throw new Error('Entropy must be 16 or 32 bytes');
  }
  return Mnemonic.fromEntropy(entropy).phrase;
}

export function deriveKeys(phrase: string): WalletKeys {
  const mnemonic = Mnemonic.fromPhrase(normalizeMnemonic(phrase));
  // Compute the seed once: PBKDF2 is slow in JS and fromPhrase would rerun it per path.
  const seed = mnemonic.computeSeed();
  const root = HDNodeWallet.fromSeed(seed);
  const evm = root.derivePath(EVM_PATH);
  return {
    evm: { address: evm.address, privateKey: evm.privateKey },
    solana: deriveSolanaKey(seed),
  };
}
