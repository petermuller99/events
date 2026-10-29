import { getChain } from '../src/lib/config';
import { TronClient } from '../src/lib/tron';
import { tronAddressFromEvmAddress } from '../src/lib/tron-address';

// Asks real Tron nodes to build transfers and checks that the strict pre-sign check
// accepts them. Nothing is signed or sent. Only runs when TRON_LIVE=1 (in CI).
const live = process.env.TRON_LIVE === '1' ? describe : describe.skip;
jest.setTimeout(90_000);

const RECIPIENT = tronAddressFromEvmAddress('0x' + '11'.repeat(20));

/** A recent USDT sender, which holds both USDT and TRX, to build transfers from. */
async function findHolder(apiUrl: string, client: TronClient, token: string): Promise<string> {
  const res = await fetch(`${apiUrl}/v1/contracts/${token}/events?event_name=Transfer&only_confirmed=true&limit=50`);
  const events = ((await res.json()) as { data?: { result?: { from?: string } }[] }).data ?? [];
  for (const e of events) {
    const from = e.result?.from;
    if (!from) continue;
    const address = from.startsWith('T') ? from : tronAddressFromEvmAddress('0x' + from.replace(/^0x|^41/, ''));
    const [trx, usdt] = await Promise.all([client.getTrxBalance(address), client.getTokenBalance(address, token)]);
    if (trx > 1_000_000n && usdt > 0n) return address;
  }
  throw new Error('No funded USDT holder found');
}

for (const mode of ['mainnet', 'testnet'] as const) {
  live(`Tron ${mode} (live)`, () => {
    const chain = getChain(mode, 'tron');
    const client = new TronClient(chain.rpcUrl);
    const token = chain.tokens[0].address;

    it('builds TRX and USDT transfers that pass the pre-sign check', async () => {
      const owner = await findHolder(chain.rpcUrl, client, token);
      const results: Record<string, string> = {};
      results.trx = await client.buildTrxTransfer(owner, RECIPIENT, 1n).then(
        () => 'ok',
        (e: Error) => `error: ${e.message}`,
      );
      results.usdt = await client.buildTrc20Transfer(owner, RECIPIENT, token, 1n).then(
        () => 'ok',
        (e: Error) => `error: ${e.message}`,
      );
      console.log(`Tron ${mode} build checks (from ${owner}):`, JSON.stringify(results));
      expect(results).toEqual({ trx: 'ok', usdt: 'ok' });
    });
  });
}
