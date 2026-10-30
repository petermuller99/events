import AsyncStorage from '@react-native-async-storage/async-storage';
import type { WalletKeys } from './keys';

// Gift links open a small page (docs/gift in this repo, on GitHub Pages) that shows
// relatives where to send pocket money. The addresses travel in the #fragment, which
// browsers keep to themselves, so the page's server never sees them.

export const GIFT_PAGE_URL = 'https://petermuller99.github.io/events/gift/';
const KEY = 'pearl.gift.v1';

export interface GiftSettings {
  /** Show the child's photo on the gift page (anyone with the link can see it). */
  photo: boolean;
}

export function giftLink(keys: WalletKeys, name: string, settings: GiftSettings): string {
  const q = new URLSearchParams({ n: name, sol: keys.solana.address, evm: keys.evm.address });
  if (settings.photo) q.set('p', '1');
  return `${GIFT_PAGE_URL}#${q.toString()}`;
}

export function giftMessage(name: string, link: string): string {
  return `Send ${name} pocket money 🎁 She saves digital dollars in her own Pearl Wallet: ${link}`;
}

export async function loadGiftSettings(): Promise<GiftSettings> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    return { photo: false, ...(raw ? (JSON.parse(raw) as Partial<GiftSettings>) : {}) };
  } catch {
    return { photo: false };
  }
}

export function saveGiftSettings(settings: GiftSettings): Promise<void> {
  return AsyncStorage.setItem(KEY, JSON.stringify(settings));
}
