import type { ActivityItem } from '../src/lib/activity';
import { portfolioSeries } from '../src/lib/portfolio';
import { priceAt } from '../src/lib/prices';

const item = (over: Partial<ActivityItem>): ActivityItem => ({
  id: Math.random().toString(),
  chain: 'ethereum',
  assetId: 'USDC',
  symbol: 'USDC',
  decimals: 6,
  direction: 'in',
  amount: '0',
  hash: 'h',
  timestamp: 0,
  status: 'confirmed',
  ...over,
});

describe('portfolio growth', () => {
  it('walks back through money received and sent', () => {
    // Now: $30 USDC. At t=50 $10 came in, at t=80 $5 went out.
    const series = portfolioSeries(
      [{ chain: 'ethereum', assetId: 'USDC', decimals: 6, balance: 30_000_000n, stable: true }],
      [item({ amount: '10000000', timestamp: 50 }), item({ direction: 'out', amount: '5000000', timestamp: 80 })],
      {},
      {},
      0,
      100,
      3,
    );
    expect(series.map((p) => p.usd)).toEqual([25, 35, 30]);
  });

  it('values fee coins at the price of the time', () => {
    const series = portfolioSeries(
      [{ chain: 'ethereum', assetId: 'native', decimals: 18, balance: 10n ** 18n, stable: false }],
      [],
      { ethereum: [[0, 2000], [60, 3000]] },
      {},
      0,
      100,
      2,
    );
    expect(series.map((p) => p.usd)).toEqual([2000, 3000]);
  });

  it('ignores pending and failed activity', () => {
    const series = portfolioSeries(
      [{ chain: 'ethereum', assetId: 'USDC', decimals: 6, balance: 1_000_000n, stable: true }],
      [item({ amount: '1000000', timestamp: 50, status: 'pending' }), item({ amount: '1000000', timestamp: 50, status: 'failed' })],
      {},
      {},
      0,
      100,
      2,
    );
    expect(series.map((p) => p.usd)).toEqual([1, 1]);
  });

  it('looks up the last known price', () => {
    expect(priceAt([[10, 1], [20, 2], [30, 3]], 25)).toBe(2);
    expect(priceAt([[10, 1]], 5)).toBe(1);
  });
});
