import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { AppState } from 'react-native';
import { authenticate, deviceHasScreenLock } from '../lib/auth';
import type { NetworkMode } from '../lib/config';
import { deriveKeys, normalizeMnemonic, type WalletKeys } from '../lib/keys';
import { disableBackgroundCheck } from '../lib/background';
import { clearWatch } from '../lib/prefs';
import * as storage from '../lib/storage';
import { clearActivity } from '../lib/sync';

export type WalletStatus = 'loading' | 'empty' | 'locked' | 'unlocked';

interface WalletContextValue {
  status: WalletStatus;
  /** Only set while unlocked; cleared again on lock. */
  keys: WalletKeys | null;
  mode: NetworkMode;
  hasScreenLock: boolean;
  setMode: (mode: NetworkMode) => void;
  unlock: () => Promise<boolean>;
  lock: () => void;
  saveWallet: (phrase: string) => Promise<void>;
  removeWallet: () => Promise<void>;
  revealPhrase: () => Promise<string | null>;
}

const WalletContext = createContext<WalletContextValue | null>(null);

/** Lock again if the app was in the background longer than this. */
const AUTO_LOCK_MS = 2 * 60 * 1000;

// Key derivation runs PBKDF2 in JS and blocks for a moment; yield first so a spinner can render.
const nextFrame = () => new Promise((resolve) => setTimeout(resolve, 50));

export function WalletProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<WalletStatus>('loading');
  const [keys, setKeys] = useState<WalletKeys | null>(null);
  const [mode, setModeState] = useState<NetworkMode>('testnet');
  const [hasScreenLock, setHasScreenLock] = useState(true);
  const backgroundedAt = useRef<number | null>(null);

  useEffect(() => {
    (async () => {
      const [exists, savedMode, screenLock] = await Promise.all([
        storage.hasStoredWallet(),
        storage.loadNetworkMode(),
        deviceHasScreenLock(),
      ]);
      setModeState(savedMode);
      setHasScreenLock(screenLock);
      setStatus(exists ? 'locked' : 'empty');
    })();
  }, []);

  const lock = useCallback(() => {
    setKeys(null);
    setStatus((s) => (s === 'unlocked' ? 'locked' : s));
  }, []);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (next) => {
      if (next === 'background') {
        backgroundedAt.current = Date.now();
      } else if (next === 'active') {
        const since = backgroundedAt.current;
        backgroundedAt.current = null;
        if (since && Date.now() - since > AUTO_LOCK_MS) lock();
        deviceHasScreenLock().then(setHasScreenLock);
      }
    });
    return () => sub.remove();
  }, [lock]);

  const unlock = useCallback(async () => {
    if (!(await authenticate('Unlock your wallet'))) return false;
    const phrase = await storage.loadMnemonic();
    if (!phrase) {
      setStatus('empty');
      return false;
    }
    await nextFrame();
    setKeys(deriveKeys(phrase));
    setStatus('unlocked');
    return true;
  }, []);

  const saveWallet = useCallback(async (phrase: string) => {
    const normalized = normalizeMnemonic(phrase);
    await nextFrame();
    const derived = deriveKeys(normalized);
    await storage.saveMnemonic(normalized);
    setKeys(derived);
    setStatus('unlocked');
  }, []);

  const removeWallet = useCallback(async () => {
    await storage.deleteMnemonic();
    // Forget the addresses and history too, so a removed wallet leaves nothing behind.
    await Promise.all([clearActivity(), clearWatch(), disableBackgroundCheck()]).catch(() => {});
    setKeys(null);
    setStatus('empty');
  }, []);

  const revealPhrase = useCallback(async () => {
    if (!(await authenticate('Show recovery phrase'))) return null;
    return storage.loadMnemonic();
  }, []);

  const setMode = useCallback((next: NetworkMode) => {
    setModeState(next);
    storage.saveNetworkMode(next);
  }, []);

  const value = useMemo(
    () => ({ status, keys, mode, hasScreenLock, setMode, unlock, lock, saveWallet, removeWallet, revealPhrase }),
    [status, keys, mode, hasScreenLock, setMode, unlock, lock, saveWallet, removeWallet, revealPhrase],
  );
  return <WalletContext.Provider value={value}>{children}</WalletContext.Provider>;
}

export function useWallet(): WalletContextValue {
  const ctx = useContext(WalletContext);
  if (!ctx) throw new Error('useWallet must be used inside WalletProvider');
  return ctx;
}

/**
 * For screens that are only reachable while unlocked. On lock, the router removes
 * these screens, but they can render once more first; keep the last keys for that
 * render rather than crashing.
 */
export function useUnlockedWallet(): WalletContextValue & { keys: WalletKeys } {
  const wallet = useWallet();
  const [lastKeys, setLastKeys] = useState(wallet.keys);
  if (wallet.keys && wallet.keys !== lastKeys) setLastKeys(wallet.keys);
  const keys = wallet.keys ?? lastKeys;
  if (!keys) throw new Error('Wallet is locked');
  return { ...wallet, keys };
}
