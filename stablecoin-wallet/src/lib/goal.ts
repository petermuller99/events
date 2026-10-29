import AsyncStorage from '@react-native-async-storage/async-storage';

/** An optional savings goal shown on the honey pot, e.g. "a new bike" for $500. */
export interface SavingsGoal {
  name: string;
  /** Whole dollars. */
  target: number;
}

const KEY = 'pearl.goal.v1';

export async function loadGoal(): Promise<SavingsGoal | null> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as SavingsGoal) : null;
  } catch {
    return null;
  }
}

export async function saveGoal(goal: SavingsGoal | null): Promise<void> {
  if (goal) await AsyncStorage.setItem(KEY, JSON.stringify(goal));
  else await AsyncStorage.removeItem(KEY);
}

/** 0–100, rounded down, for the progress bar. `dollars` is the balance in whole and cents. */
export function goalPercent(goal: SavingsGoal, dollars: number): number {
  if (goal.target <= 0) return 0;
  return Math.max(0, Math.min(100, Math.floor((dollars / goal.target) * 100)));
}
