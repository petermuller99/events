import type { ActivityItem } from './activity';
import { formatAmount, formatDollars } from './amount';
import { getChain, type NetworkMode } from './config';
import type { Prefs } from './prefs';
import type { SyncOutcome } from './sync';

const short = (a?: string) => (a ? `${a.slice(0, 6)}…${a.slice(-4)}` : 'them');
const amountOf = (i: ActivityItem) =>
  `${i.assetId === 'native' ? formatAmount(BigInt(i.amount), i.decimals, 4) : formatDollars(BigInt(i.amount), i.decimals)} ${i.symbol}`;

export interface NotificationText {
  title: string;
  body: string;
}

/** The notifications a sync outcome should produce, given the user's settings. */
export function describeOutcome(mode: NetworkMode, outcome: SyncOutcome, prefs: Prefs): NotificationText[] {
  const out: NotificationText[] = [];
  if (prefs.notifyReceived && outcome.received.length > 3) {
    out.push({ title: 'Money in! 🎉', body: `You got ${outcome.received.length} payments. Open Pearl to see them.` });
  } else if (prefs.notifyReceived) {
    for (const i of outcome.received) {
      out.push({ title: 'Money in! 🎉', body: `You got ${amountOf(i)} on ${getChain(mode, i.chain).name}.` });
    }
  }
  if (prefs.notifySends) {
    for (const i of outcome.settled) {
      const chain = getChain(mode, i.chain).name;
      out.push(
        i.status === 'confirmed'
          ? { title: 'It arrived ✓', body: `Your ${amountOf(i)} reached ${short(i.counterparty)} on ${chain}.` }
          : {
              title: 'Uh-oh, a send didn’t go through',
              body: `${amountOf(i)} on ${chain} failed. That money is still in your wallet.`,
            },
      );
    }
  }
  return out;
}
