import AsyncStorage from '@react-native-async-storage/async-storage';
import type { NetworkMode } from './config';
import type { WatchedAddresses } from './sync';

// Non-secret settings, in plain app storage so the background check can read them
// while the phone is locked (secure storage is only readable when unlocked).

export interface Prefs {
  notifyReceived: boolean;
  notifySends: boolean;
}

const PREFS_KEY = 'pearl.prefs.v1';
const WATCH_KEY = 'pearl.watch.v1';
const ASKED_KEY = 'pearl.askedNotifications.v1';
const LAST_CHECK_KEY = 'pearl.lastBackgroundCheck.v1';

/** When the OS last ran the background check, so Settings can show it's working. */
export async function loadLastBackgroundCheck(): Promise<number | null> {
  const raw = await AsyncStorage.getItem(LAST_CHECK_KEY).catch(() => null);
  return raw ? Number(raw) : null;
}

export function saveLastBackgroundCheck(at: number): Promise<void> {
  return AsyncStorage.setItem(LAST_CHECK_KEY, String(at));
}

export const defaultPrefs: Prefs = { notifyReceived: true, notifySends: true };

export async function loadPrefs(): Promise<Prefs> {
  try {
    const raw = await AsyncStorage.getItem(PREFS_KEY);
    return raw ? { ...defaultPrefs, ...(JSON.parse(raw) as Partial<Prefs>) } : defaultPrefs;
  } catch {
    return defaultPrefs;
  }
}

export function savePrefs(prefs: Prefs): Promise<void> {
  return AsyncStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
}

/** What the background check watches: public addresses only, never keys. */
export interface WatchState {
  mode: NetworkMode;
  addresses: WatchedAddresses;
}

export async function loadWatch(): Promise<WatchState | null> {
  try {
    const raw = await AsyncStorage.getItem(WATCH_KEY);
    return raw ? (JSON.parse(raw) as WatchState) : null;
  } catch {
    return null;
  }
}

export function saveWatch(watch: WatchState): Promise<void> {
  return AsyncStorage.setItem(WATCH_KEY, JSON.stringify(watch));
}

export function clearWatch(): Promise<void> {
  return AsyncStorage.multiRemove([WATCH_KEY, ASKED_KEY, LAST_CHECK_KEY]);
}

export async function hasAskedForNotifications(): Promise<boolean> {
  return (await AsyncStorage.getItem(ASKED_KEY)) === '1';
}

export function setAskedForNotifications(): Promise<void> {
  return AsyncStorage.setItem(ASKED_KEY, '1');
}
