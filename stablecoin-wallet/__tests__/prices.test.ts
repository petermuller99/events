import { nativeValue, parsePrices, toMicros } from '../src/lib/prices';

describe('fee coin prices', () => {
  it('reads CoinGecko prices for each network', () => {
    const prices = parsePrices({
      ethereum: { usd: 3456.78 },
      binancecoin: { usd: 612.5 },
      tron: { usd: 0.1234 },
      solana: { usd: 0 },
    });
    expect(prices).toEqual({ ethereum: 3456780000n, bsc: 612500000n, tron: 123400n });
  });

  it('values balances in dollars scaled to 18 decimals', () => {
    const usd = (v: bigint) => Number(v / 10n ** 14n) / 10_000;
    // 0.5 ETH (18 decimals) at $3,000
    expect(usd(nativeValue(5n * 10n ** 17n, 18, toMicros(3000)))).toBe(1500);
    // 2 SOL (9 decimals) at $150.25
    expect(usd(nativeValue(2_000_000_000n, 9, toMicros(150.25)))).toBe(300.5);
    // 100 TRX (6 decimals) at $0.12
    expect(usd(nativeValue(100_000_000n, 6, toMicros(0.12)))).toBe(12);
  });
});
