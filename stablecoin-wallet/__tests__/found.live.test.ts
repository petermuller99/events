import { JsonRpcProvider } from 'ethers';
import { getChain } from '../src/lib/config';
import { MULTICALL3, parseCoinList, parseMarkets } from '../src/lib/found';

// Checks the real services found coins rely on, so it only runs when FOUND_LIVE=1 (in CI).
const live = process.env.FOUND_LIVE === '1' ? describe : describe.skip;
jest.setTimeout(120_000);

live('found coins (live)', () => {
  it('CoinGecko lists tokens for every network', async () => {
    const res = await fetch('https://api.coingecko.com/api/v3/coins/list?include_platform=true');
    expect(res.ok).toBe(true);
    const list = parseCoinList(await res.json());
    const counts = Object.fromEntries(Object.entries(list).map(([k, v]) => [k, Object.keys(v ?? {}).length]));
    console.log('Listed tokens per network:', JSON.stringify(counts));
    for (const chain of ['ethereum', 'bsc', 'solana'] as const) expect(counts[chain]).toBeGreaterThan(100);
    expect(counts.core ?? 0).toBeGreaterThan(0);
  });

  it('CoinGecko answers market data by id', async () => {
    const res = await fetch('https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&ids=jupiter-exchange-solana,pancakeswap-token');
    const m = parseMarkets(await res.json());
    console.log('Markets:', JSON.stringify(m));
    expect(Object.keys(m).length).toBeGreaterThan(0);
  });

  for (const id of ['ethereum', 'bsc', 'core'] as const) {
    it(`Multicall3 is deployed on ${id}`, async () => {
      const chain = getChain('mainnet', id);
      const provider = new JsonRpcProvider(chain.rpcUrl, chain.chainId, { staticNetwork: true });
      const code = await provider.getCode(MULTICALL3);
      console.log(`${id} Multicall3 code length:`, code.length);
      expect(code.length).toBeGreaterThan(2);
    });
  }
});
