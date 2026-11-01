import { BitcoinClient } from '../src/lib/bitcoin';
import { getChain } from '../src/lib/config';

// Talks to the real Bitcoin APIs (mempool.space), so it only runs when BITCOIN_LIVE=1 (in CI).
const live = process.env.BITCOIN_LIVE === '1' ? describe : describe.skip;
jest.setTimeout(60_000);

for (const [mode, address] of [
  ['mainnet', '1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa'], // the genesis address: always has a balance
  ['testnet', 'tb1qcr8te4kr609gcawutmrza0j4xv80jy8zmfp6l0'],
] as const) {
  live(`Bitcoin ${mode} (live)`, () => {
    const client = new BitcoinClient(getChain(mode, 'bitcoin').rpcUrl);

    it('answers fees, balances, coins and history in the expected shape', async () => {
      const rates = await client.getFeeRates();
      const balance = await client.getBalance(address);
      const utxos = await client.getUtxos(address);
      const txs = await client.getTransactions(address);
      console.log(`Bitcoin ${mode}:`, JSON.stringify({ rates, balance: balance.toString(), utxos: utxos.length, txs: txs.length }));
      for (const r of Object.values(rates)) expect(r).toBeGreaterThanOrEqual(1);
      expect(rates.fast).toBeGreaterThanOrEqual(rates.slow);
      if (mode === 'mainnet') expect(balance).toBeGreaterThan(0n);
      expect(Array.isArray(utxos)).toBe(true);
      for (const t of txs.slice(0, 3)) {
        expect(typeof t.txid).toBe('string');
        expect(Array.isArray(t.vout)).toBe(true);
      }
    });
  });
}
