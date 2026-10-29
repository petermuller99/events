import { id as keccakId, toBeHex, zeroPadValue } from 'ethers';
import { pendingSend } from '../src/lib/activity';
import { getChain } from '../src/lib/config';
import { recordSend, syncActivity } from '../src/lib/sync';

// A fake chain per network: Ethereum Sepolia has one token (USDC); BSC stays empty;
// Tron answers TronGrid HTTP calls through a mocked fetch.

jest.mock('../src/lib/evm', () => ({ getProvider: jest.fn() }));
// eslint-disable-next-line @typescript-eslint/no-require-imports
const evm = require('../src/lib/evm') as { getProvider: jest.Mock };

const ME_EVM = '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266';
const OTHER_EVM = '0x70997970C51812dc3A010C7d01b50e0d17dc79C8';
const ME_TRON = 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t';
const OTHER_TRON = 'TXYZopYRdj2D9XRtbG411XZZ3kM5VkAeBf';
const T = keccakId('Transfer(address,address,uint256)');
const sepolia = getChain('testnet', 'ethereum');
const nile = getChain('testnet', 'tron');

const chainState = { latest: 10_000, balance: 10n ** 18n, logs: [] as { block: number; from: string; to: string; value: bigint; hash: string }[] };
const getLogsCalls: { fromBlock: number; toBlock: number }[] = [];

function sepoliaProvider() {
  return {
    send: async (method: string) => (method === 'eth_blockNumber' ? toBeHex(chainState.latest) : null),
    getBalance: async () => chainState.balance,
    getBlock: async (n: number) => ({ timestamp: n }),
    getTransactionReceipt: async () => null,
    getLogs: async (f: { fromBlock: number; toBlock: number; topics: (string | null)[] }) => {
      getLogsCalls.push({ fromBlock: f.fromBlock, toBlock: f.toBlock });
      const wantTo = f.topics[2];
      const wantFrom = f.topics[1];
      return chainState.logs
        .filter((l) => l.block >= f.fromBlock && l.block <= f.toBlock)
        .filter((l) => (wantTo ? zeroPadValue(l.to, 32) === wantTo : true))
        .filter((l) => (wantFrom ? zeroPadValue(l.from, 32) === wantFrom : true))
        .map((l) => ({
          address: sepolia.tokens[0].address,
          topics: [T, zeroPadValue(l.from, 32).toLowerCase(), zeroPadValue(l.to, 32).toLowerCase()],
          data: toBeHex(l.value, 32),
          transactionHash: l.hash,
          blockNumber: l.block,
        }));
    },
  };
}
const emptyProvider = {
  send: async () => toBeHex(5_000),
  getBalance: async () => 0n,
  getBlock: async () => ({ timestamp: 1 }),
  getTransactionReceipt: async () => null,
  getLogs: async () => [],
};

const tronState = {
  trc20: [] as object[],
  trx: [] as object[],
  txInfo: {} as Record<string, object>,
};

beforeEach(() => {
  evm.getProvider.mockImplementation((c: { id: string }) => (c.id === 'ethereum' ? sepoliaProvider() : emptyProvider));
  global.fetch = jest.fn(async (url: string, init?: { body?: string }) => {
    const json = (body: unknown) => ({ ok: true, status: 200, json: async () => body });
    if (url.includes('/transactions/trc20')) return json({ data: tronState.trc20 });
    if (url.includes('/v1/accounts/')) return json({ data: tronState.trx });
    if (url.endsWith('/wallet/gettransactioninfobyid')) {
      const { value } = JSON.parse(init!.body!);
      return json(tronState.txInfo[value] ?? {});
    }
    return { ok: false, status: 404, json: async () => ({}) };
  }) as unknown as typeof fetch;
});

const trc20 = (hash: string, from: string, to: string, value: string, ts: number, token = nile.tokens[0].address) => ({
  transaction_id: hash,
  token_info: { address: token, decimals: 6, symbol: 'USDT' },
  block_timestamp: ts,
  from,
  to,
  type: 'Transfer',
  value,
});

const addresses = { evm: ME_EVM, tron: ME_TRON, solana: '9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM' };

it('treats the first sync as a baseline, then reports new money and settled sends', async () => {
  // Already in the wallet before Pearl ever looked: shown in Activity, but no notifications.
  tronState.trc20 = [trc20('old1', OTHER_TRON, ME_TRON, '1000000', 1)];
  chainState.logs = [{ block: 9_500, from: OTHER_EVM, to: ME_EVM, value: 3_000_000n, hash: '0xold' }];
  const first = await syncActivity('testnet', addresses);
  expect(first.received).toEqual([]);
  expect(first.items.map((i) => i.hash).sort()).toEqual(['0xold', 'old1']);
  expect(getLogsCalls[0].fromBlock).toBe(8_000); // latest - initial lookback

  // A send made in Pearl, still pending.
  await recordSend('testnet', pendingSend('tron', { id: 'USDT', symbol: 'USDT', decimals: 6 }, OTHER_TRON, 5_000_000n, 'mysend'));

  // Then: new USDT on Tron, new USDC and ETH on Sepolia, and the send gets confirmed.
  tronState.trc20 = [trc20('new1', OTHER_TRON, ME_TRON, '25000000', 3), ...tronState.trc20];
  tronState.txInfo.mysend = { blockNumber: 123, receipt: { result: 'SUCCESS' } };
  chainState.latest = 10_100;
  chainState.logs.push({ block: 10_050, from: OTHER_EVM, to: ME_EVM, value: 2_000_000n, hash: '0xnew' });
  chainState.balance += 5n * 10n ** 16n;
  getLogsCalls.length = 0;

  const second = await syncActivity('testnet', addresses);
  expect(getLogsCalls[0]).toEqual({ fromBlock: 10_001, toBlock: 10_100 });
  expect(second.received.map((i) => `${i.chain}:${i.symbol}:${i.amount}`).sort()).toEqual([
    'ethereum:ETH:50000000000000000',
    'ethereum:USDC:2000000',
    'tron:USDT:25000000',
  ]);
  expect(second.settled.map((i) => [i.hash, i.status])).toEqual([['mysend', 'confirmed']]);

  // Nothing new: nothing to report.
  const third = await syncActivity('testnet', addresses);
  expect(third.received).toEqual([]);
  expect(third.settled).toEqual([]);
});

it('keeps going when one network is unreachable', async () => {
  evm.getProvider.mockImplementation(() => ({ ...emptyProvider, send: async () => { throw new Error('down'); } }));
  tronState.trc20 = [trc20('x1', OTHER_TRON, ME_TRON, '1', 9, getChain('mainnet', 'tron').tokens[0].address)];
  const res = await syncActivity('mainnet', addresses);
  expect(res.items.map((i) => i.hash)).toContain('x1');
});
