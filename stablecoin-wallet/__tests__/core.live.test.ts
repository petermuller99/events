import { JsonRpcProvider } from 'ethers';
import { getChain } from '../src/lib/config';
import { parsePrices } from '../src/lib/prices';

// Talks to Core's real nodes and CoinGecko, so it only runs when CORE_LIVE=1 (in CI).
const live = process.env.CORE_LIVE === '1' ? describe : describe.skip;
jest.setTimeout(60_000);

for (const mode of ['mainnet', 'testnet'] as const) {
  live(`Core ${mode} (live)`, () => {
    it('answers with the configured chain id, a block, a balance and fees', async () => {
      const chain = getChain(mode, 'core');
      const provider = new JsonRpcProvider(chain.rpcUrl, chain.chainId, { staticNetwork: true });
      const chainId = Number(await provider.send('eth_chainId', []));
      const block = await provider.getBlockNumber();
      const balance = await provider.getBalance('0x0000000000000000000000000000000000001000');
      const fees = await provider.getFeeData();
      console.log(`Core ${mode}:`, JSON.stringify({ chainId, block, balance: balance.toString(), gasPrice: String(fees.gasPrice), maxFee: String(fees.maxFeePerGas) }));
      expect(chainId).toBe(chain.chainId);
      expect(block).toBeGreaterThan(0);
      expect(fees.gasPrice ?? fees.maxFeePerGas).not.toBeNull();
    });
  });
}

live('CORE price (live)', () => {
  it('CoinGecko knows the coin id', async () => {
    const res = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=coredaoorg&vs_currencies=usd');
    const prices = parsePrices(await res.json());
    console.log('CORE price (micros):', String(prices.core));
    expect(prices.core).toBeGreaterThan(0n);
  });
});
