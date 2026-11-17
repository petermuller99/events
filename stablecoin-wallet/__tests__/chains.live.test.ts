import { JsonRpcProvider } from 'ethers';
import { getChain } from '../src/lib/config';
import { parsePrices } from '../src/lib/prices';
import { SuiClient } from '../src/lib/sui';

// Talks to the real Cronos and Sui networks and CoinGecko, so it only runs when
// CHAINS_LIVE=1 (in CI). Read-only: nothing is signed or sent.
const live = process.env.CHAINS_LIVE === '1' ? describe : describe.skip;
jest.setTimeout(60_000);

// An address that was busy on Sui mainnet when this was written.
const BUSY_SUI = '0x8b7fac6ee4bd36dfff6ed0b342820d10acdc16e0ba834fc93f2203b9386f1d10';

for (const mode of ['mainnet', 'testnet'] as const) {
  live(`Cronos ${mode} (live)`, () => {
    it('answers with the configured chain id and fees', async () => {
      const chain = getChain(mode, 'cronos');
      const provider = new JsonRpcProvider(chain.rpcUrl, chain.chainId, { staticNetwork: true });
      const chainId = Number(await provider.send('eth_chainId', []));
      const fees = await provider.getFeeData();
      console.log(`Cronos ${mode}:`, JSON.stringify({ chainId, maxFee: String(fees.maxFeePerGas), gasPrice: String(fees.gasPrice) }));
      expect(chainId).toBe(chain.chainId);
      expect(fees.maxFeePerGas ?? fees.gasPrice).not.toBeNull();
    });
  });

  live(`Sui ${mode} (live)`, () => {
    const client = new SuiClient(getChain(mode, 'sui').rpcUrl);
    it('answers fees, epoch and chain id', async () => {
      const net = await client.getNetwork();
      console.log(`Sui ${mode}:`, JSON.stringify({ gasPrice: String(net.gasPrice), epoch: String(net.epoch), chain: net.chain }));
      expect(net.gasPrice).toBeGreaterThan(0n);
      expect(net.chain.length).toBeGreaterThan(30);
    });
    it('reads balances, coins, history and status in the expected shape', async () => {
      const b = await client.getBalances(BUSY_SUI);
      const coins = await client.getCoins(BUSY_SUI);
      const txs = await client.getTransactions(BUSY_SUI, 3);
      const status = await client.getStatus('11111111111111111111111111111111');
      console.log(`Sui ${mode} reads:`, JSON.stringify({ total: String(b.total), coins: String(b.coins), ab: String(b.addressBalance), coinObjects: coins.length, txs: txs.length, firstChanges: txs[0]?.changes.length, status }));
      expect(b.total).toBe(b.coins + b.addressBalance);
      expect(Array.isArray(coins)).toBe(true);
      expect(status).toBe('pending');
      if (mode === 'mainnet') expect(txs.length).toBeGreaterThan(0);
    });
  });
}

live('CRO and SUI prices (live)', () => {
  it('CoinGecko knows both ids', async () => {
    const res = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=crypto-com-chain,sui&vs_currencies=usd');
    const prices = parsePrices(await res.json());
    console.log('Prices (micros):', String(prices.cronos), String(prices.sui));
    expect(prices.cronos).toBeGreaterThan(0n);
    expect(prices.sui).toBeGreaterThan(0n);
  });
});
