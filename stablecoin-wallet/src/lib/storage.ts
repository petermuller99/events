import * as SecureStore from 'expo-secure-store';
import type { NetworkMode } from './config';

// The recovery phrase lives in the iOS Keychain / Android Keystore-backed storage,
// readable only while the device is unlocked and never synced to backups.
const MNEMONIC_KEY = 'wallet.mnemonic.v1';
const MODE_KEY = 'wallet.networkMode';

const secret: SecureStore.SecureStoreOptions = {
  keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
};

export async function hasStoredWallet(): Promise<boolean> {
  return (await SecureStore.getItemAsync(MNEMONIC_KEY, secret)) != null;
}

export function loadMnemonic(): Promise<string | null> {
  return SecureStore.getItemAsync(MNEMONIC_KEY, secret);
}

export function saveMnemonic(phrase: string): Promise<void> {
  return SecureStore.setItemAsync(MNEMONIC_KEY, phrase, secret);
}

export function deleteMnemonic(): Promise<void> {
  return SecureStore.deleteItemAsync(MNEMONIC_KEY, secret);
}

export async function loadNetworkMode(): Promise<NetworkMode> {
  // Real money unless test money was switched on in Settings.
  return (await SecureStore.getItemAsync(MODE_KEY)) === 'testnet' ? 'testnet' : 'mainnet';
}

export function saveNetworkMode(mode: NetworkMode): Promise<void> {
  return SecureStore.setItemAsync(MODE_KEY, mode);
}
