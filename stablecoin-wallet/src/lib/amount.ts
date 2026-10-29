import { formatUnits, parseUnits } from 'ethers';

/**
 * Parses a user-typed amount like "12.5" into base units.
 * Throws an Error with a message suitable for showing to the user.
 */
export function parseAmount(input: string, decimals: number): bigint {
  const value = input.trim().replace(',', '.');
  if (!/^\d+(\.\d+)?$/.test(value)) {
    throw new Error('Enter an amount like 10 or 10.50');
  }
  const fraction = value.split('.')[1] ?? '';
  if (fraction.length > decimals) {
    throw new Error(`At most ${decimals} decimal places are allowed`);
  }
  const amount = parseUnits(value, decimals);
  if (amount <= 0n) {
    throw new Error('Amount must be greater than zero');
  }
  return amount;
}

/**
 * Formats base units for display, trimming to `maxFraction` digits (rounded down)
 * and padding to at least `minFraction` (2 for dollar amounts: "40.00").
 */
export function formatAmount(amount: bigint, decimals: number, maxFraction = 6, minFraction = 0): string {
  const [whole, fraction = ''] = formatUnits(amount, decimals).split('.');
  const trimmed = fraction.slice(0, maxFraction).replace(/0+$/, '').padEnd(minFraction, '0');
  const wholeGrouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return trimmed ? `${wholeGrouped}.${trimmed}` : wholeGrouped;
}

/** Stablecoin amounts as dollars: always two decimals. */
export function formatDollars(amount: bigint, decimals: number): string {
  return formatAmount(amount, decimals, 2, 2);
}

/** Plain decimal string with no grouping, for pre-filling an input. */
export function toInputAmount(amount: bigint, decimals: number): string {
  const s = formatUnits(amount, decimals);
  return s.endsWith('.0') ? s.slice(0, -2) : s;
}
