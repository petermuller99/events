import AsyncStorage from '@react-native-async-storage/async-storage';
import type { StickerName } from '../components/ui';

/** Money tips for kids: one pops up each time the wallet is unlocked. */
export interface Tip {
  id: number;
  emoji: string;
  /** Short name for the collection grid. */
  short: string;
  title: string;
  text: string;
  color: string;
  sticker: StickerName;
}

export const TIPS: Tip[] = [
  { id: 1, emoji: '🐷', short: 'Save first', title: 'Save first!', color: '#FDE0E6', sticker: 'hello',
    text: 'When you get money, put some in your money pot first. Then you can spend the rest.' },
  { id: 2, emoji: '🍎', short: 'Needs vs wants', title: 'Needs vs wants', color: '#DDF5E5', sticker: 'curious',
    text: 'Needs are things you must have, like food. Wants are nice extras, like toys. Needs come first!' },
  { id: 3, emoji: '🚲', short: 'Set a goal', title: 'Set a goal!', color: '#D9EFFD', sticker: 'wheee',
    text: 'Pick something special to save for. Watching your money grow towards it is super fun!' },
  { id: 4, emoji: '🪙', short: 'Little by little', title: 'Little by little!', color: '#FFF0C2', sticker: 'cheeky',
    text: 'Small coins add up to big money. Saving just a little every week makes your money pot grow and grow!' },
  { id: 5, emoji: '⏳', short: 'Wait a day', title: 'Wait a day', color: '#ECE4FB', sticker: 'hmm',
    text: 'Before you buy something, wait one day. If you still really want it tomorrow, it might be worth it.' },
  { id: 6, emoji: '🤫', short: 'Secret words', title: 'Keep your secret words secret', color: '#FDE0E6', sticker: 'cheeky',
    text: 'Your 12 secret words are the key to your wallet. Never share them, not even with friends.' },
  { id: 7, emoji: '🔍', short: 'Compare prices', title: 'Compare prices', color: '#DDF5E5', sticker: 'curious',
    text: 'The same thing can cost less somewhere else. Looking around first saves you money!' },
  { id: 8, emoji: '💝', short: 'Share kindly', title: 'Share kindly', color: '#FDE0E6', sticker: 'laugh',
    text: 'Giving a little to help someone else feels great. Kindness is worth more than coins!' },
  { id: 9, emoji: '🧹', short: 'Earn it', title: 'Earn it!', color: '#D9EFFD', sticker: 'wheee',
    text: 'Helping out with chores or selling things you made is a great way to earn your own money.' },
  { id: 10, emoji: '🙋', short: 'Ask a grown-up', title: 'Ask a grown-up', color: '#FFF0C2', sticker: 'hello',
    text: 'Not sure about sending money? Always ask a grown-up you trust first.' },
];

export interface TipsState {
  /** Index into TIPS of the next tip to show. */
  next: number;
  /** Ids of tips the child tapped "Got it!" on. */
  collected: number[];
}

const KEY = 'pearl.tips.v1';

export const emptyTips = (): TipsState => ({ next: 0, collected: [] });

export async function loadTips(): Promise<TipsState> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    return raw ? { ...emptyTips(), ...(JSON.parse(raw) as TipsState) } : emptyTips();
  } catch {
    return emptyTips();
  }
}

export function saveTips(state: TipsState): Promise<void> {
  return AsyncStorage.setItem(KEY, JSON.stringify(state));
}

/** The tip to show at this login, and the state once it has been shown. */
export function nextTip(state: TipsState): { tip: Tip; state: TipsState } {
  const tip = TIPS[state.next % TIPS.length];
  return { tip, state: { ...state, next: (state.next + 1) % TIPS.length } };
}

/** The tip shown most recently (for "Today's tip" on Home). */
export function currentTip(state: TipsState): Tip {
  return TIPS[(state.next - 1 + TIPS.length) % TIPS.length];
}

export function collect(state: TipsState, id: number): TipsState {
  return state.collected.includes(id) ? state : { ...state, collected: [...state.collected, id] };
}

export const isMoneyMaster = (state: TipsState) => TIPS.every((t) => state.collected.includes(t.id));
