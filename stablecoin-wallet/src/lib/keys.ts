import { HDNodeWallet, Mnemonic } from 'ethers';
import { tronAddressFromEvmAddress } from './tron-address';

// BIP-44 paths: coin type 60 is Ethereum (shared by BSC), 195 is Tron.
// These match MetaMask/Trust Wallet/TronLink, so the same phrase restores there too.
export const EVM_PATH = "m/44'/60'/0'/0/0";
export const TRON_PATH = "m/44'/195'/0'/0/0";

export interface AccountKey {
  address: string;
  privateKey: string;
}

export interface WalletKeys {
  /** Used for both Ethereum and BSC. */
  evm: AccountKey;
  tron: AccountKey;
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
  const root = HDNodeWallet.fromSeed(mnemonic.computeSeed());
  const evm = root.derivePath(EVM_PATH);
  const tron = root.derivePath(TRON_PATH);
  return {
    evm: { address: evm.address, privateKey: evm.privateKey },
    tron: { address: tronAddressFromEvmAddress(tron.address), privateKey: tron.privateKey },
  };
}
