import {
  emptyState,
  fromTransferLogs,
  fromTrc20History,
  fromTrxHistory,
  groupByDay,
  mergeItems,
  pendingSend,
  type ActivityItem,
} from '../src/lib/activity';
import { getChain } from '../src/lib/config';
import { describeOutcome } from '../src/lib/notify-text';
import { fromSolanaTx } from '../src/lib/activity';
import { defaultPrefs } from '../src/lib/prefs';
import { tronAddressToHex } from '../src/lib/tron-address';

const tron = getChain('testnet', 'tron');
const sepolia = getChain('testnet', 'ethereum');
const ME_TRON = 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t';
const OTHER_TRON = 'TXYZopYRdj2D9XRtbG411XZZ3kM5VkAeBf';
const ME_EVM = '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266';
const OTHER_EVM = '0x70997970C51812dc3A010C7d01b50e0d17dc79C8';
const NILE_USDT = tron.tokens[0].address;
const SEPOLIA_USDC = sepolia.tokens[0].address;

describe('Tron history parsing', () => {
  it('maps TRC-20 transfers in and out, ignoring unknown tokens', () => {
    const items = fromTrc20History(tron, ME_TRON, [
      { transaction_id: 'aa', token_info: { address: NILE_USDT, decimals: 6, symbol: 'USDT' }, block_timestamp: 2, from: OTHER_TRON, to: ME_TRON, type: 'Transfer', value: '25000000' },
      { transaction_id: 'bb', token_info: { address: NILE_USDT, decimals: 6, symbol: 'USDT' }, block_timestamp: 1, from: ME_TRON, to: OTHER_TRON, type: 'Transfer', value: '5000000' },
      { transaction_id: 'cc', token_info: { address: 'TFakeToken', decimals: 6, symbol: 'SCAM' }, block_timestamp: 3, from: OTHER_TRON, to: ME_TRON, type: 'Transfer', value: '1' },
    ]);
    expect(items.map((i) => [i.hash, i.direction, i.amount, i.counterparty])).toEqual([
      ['aa', 'in', '25000000', OTHER_TRON],
      ['bb', 'out', '5000000', OTHER_TRON],
    ]);
  });

  it('maps TRX transfers given as hex addresses and marks failures', () => {
    const tx = (txID: string, from: string, to: string, contractRet = 'SUCCESS') => ({
      txID,
      block_timestamp: 5,
      ret: [{ contractRet }],
      raw_data: {
        contract: [
          {
            type: 'TransferContract',
            parameter: { value: { amount: 2_000_000, owner_address: tronAddressToHex(from), to_address: tronAddressToHex(to) } },
          },
        ],
      },
    });
    const items = fromTrxHistory(tron, ME_TRON, [tx('t1', OTHER_TRON, ME_TRON), tx('t2', ME_TRON, OTHER_TRON, 'REVERT')]);
    expect(items.map((i) => [i.direction, i.symbol, i.status, i.counterparty])).toEqual([
      ['in', 'TRX', 'confirmed', OTHER_TRON],
      ['out', 'TRX', 'failed', OTHER_TRON],
    ]);
  });
});

describe('EVM log parsing', () => {
  it('maps Transfer logs case-insensitively to the configured token', () => {
    const [item] = fromTransferLogs(sepolia, ME_EVM, [
      { token: SEPOLIA_USDC.toLowerCase(), from: OTHER_EVM.toLowerCase(), to: ME_EVM.toLowerCase(), value: 7n, hash: '0xAB', timestamp: 9 },
    ]);
    expect(item).toMatchObject({ direction: 'in', symbol: 'USDC', amount: '7', counterparty: OTHER_EVM, status: 'confirmed' });
  });
});

describe('mergeItems', () => {
  it('turns a pending own send into confirmed when the chain reports it, and never back', () => {
    const pending = pendingSend('ethereum', { id: 'USDC', symbol: 'USDC', decimals: 6 }, OTHER_EVM, 5n, '0xAB');
    let { state } = mergeItems(emptyState(), [pending]);
    const [fromChain] = fromTransferLogs(sepolia, ME_EVM, [
      { token: SEPOLIA_USDC, from: ME_EVM, to: OTHER_EVM, value: 5n, hash: '0xab', timestamp: 10 },
    ]);
    expect(fromChain.id).toBe(pending.id);
    const res = mergeItems(state, [fromChain]);
    expect(res.added).toEqual([]);
    expect(res.updated.map((i) => i.status)).toEqual(['confirmed']);
    state = res.state;
    expect(mergeItems(state, [pending]).state.items[0].status).toBe('confirmed');
  });

  it('keeps items newest first', () => {
    const a = { ...pendingSend('tron', { id: 'USDT', symbol: 'USDT', decimals: 6 }, OTHER_TRON, 1n, 'a1'), timestamp: 1 };
    const b = { ...a, id: 'b', hash: 'b1', timestamp: 2 };
    expect(mergeItems(emptyState(), [a, b]).state.items.map((i) => i.id)).toEqual(['b', a.id]);
  });
});

describe('groupByDay', () => {
  it('labels today and yesterday', () => {
    const now = new Date(2026, 9, 29, 12);
    const at = (d: number) => ({ timestamp: new Date(2026, 9, d, 9).getTime() }) as ActivityItem;
    const groups = groupByDay([at(29), at(29), at(28), at(20)], now);
    expect(groups.map((g) => [g.title.startsWith('20') || /\d/.test(g.title) ? 'date' : g.title, g.items.length])).toEqual([
      ['Today', 2],
      ['Yesterday', 1],
      ['date', 1],
    ]);
  });
});

describe('describeOutcome', () => {
  const got = (n: number): ActivityItem => ({
    id: `g${n}`, chain: 'tron', assetId: 'USDT', symbol: 'USDT', decimals: 6, direction: 'in',
    amount: '25000000', hash: `h${n}`, timestamp: n, status: 'confirmed', counterparty: OTHER_TRON,
  });
  const sent = (status: 'confirmed' | 'failed'): ActivityItem => ({ ...got(9), direction: 'out', status });

  it('describes money in, arrived and failed sends', () => {
    const texts = describeOutcome('testnet', { items: [], received: [got(1)], settled: [sent('confirmed'), sent('failed')] }, defaultPrefs);
    expect(texts).toEqual([
      { title: 'Money in! 🎉', body: 'You got 25.00 USDT on Tron Nile.' },
      { title: 'It arrived ✓', body: 'Your 25.00 USDT reached TXYZop…AeBf on Tron Nile.' },
      { title: 'Uh-oh, a send didn’t go through', body: '25.00 USDT on Tron Nile failed. That money is still in your wallet.' },
    ]);
  });

  it('summarises many payments and respects switched-off settings', () => {
    const many = { items: [], received: [got(1), got(2), got(3), got(4)], settled: [sent('confirmed')] };
    expect(describeOutcome('testnet', many, defaultPrefs)[0].body).toBe('You got 4 payments. Open Pearl Wallet to see them.');
    expect(describeOutcome('testnet', many, { notifyReceived: false, notifySends: false })).toEqual([]);
  });
});

describe('Solana transaction parsing', () => {
  const solana = getChain('testnet', 'solana');
  const USDC = solana.tokens[0].address;
  const ME = '9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM';
  const FRIEND = '7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU';
  const tb = (owner: string, amount: string) => ({ accountIndex: 1, mint: USDC, owner, uiTokenAmount: { amount, decimals: 6 } });

  it('reads incoming USDC from token balance changes', () => {
    const [item] = fromSolanaTx(solana, ME, 'sig1', {
      blockTime: 1_700_000_000,
      meta: {
        err: null, fee: 5000, preBalances: [1, 1], postBalances: [1, 1],
        preTokenBalances: [tb(FRIEND, '9000000'), tb(ME, '1000000')],
        postTokenBalances: [tb(FRIEND, '4000000'), tb(ME, '6000000')],
      },
      transaction: { signatures: ['sig1'], message: { accountKeys: [FRIEND, ME] } },
    });
    expect(item).toMatchObject({ direction: 'in', symbol: 'USDC', amount: '5000000', counterparty: FRIEND, timestamp: 1_700_000_000_000 });
  });

  it('shows a USDC send with account setup as the USDC send only', () => {
    const items = fromSolanaTx(solana, ME, 'sig2', {
      blockTime: 1,
      meta: {
        err: null, fee: 7000, preBalances: [100_000_000, 0], postBalances: [97_953_720, 2_039_280],
        preTokenBalances: [tb(ME, '6000000')],
        postTokenBalances: [tb(ME, '1000000'), tb(FRIEND, '5000000')],
      },
      transaction: { signatures: ['sig2'], message: { accountKeys: [{ pubkey: ME, signer: true }, { pubkey: FRIEND }] } },
    });
    expect(items.map((i) => [i.direction, i.symbol, i.amount, i.counterparty])).toEqual([['out', 'USDC', '5000000', FRIEND]]);
  });

  it('reads SOL sent, leaving out the fee, and ignores failed transactions', () => {
    const tx = (err: unknown) => ({
      blockTime: 1,
      meta: { err, fee: 5000, preBalances: [1_000_000_000, 0], postBalances: [899_995_000, 100_000_000] },
      transaction: { signatures: ['s'], message: { accountKeys: [ME, FRIEND] } },
    });
    expect(fromSolanaTx(solana, ME, 's', tx(null))[0]).toMatchObject({ direction: 'out', symbol: 'SOL', amount: '100000000', counterparty: FRIEND });
    expect(fromSolanaTx(solana, FRIEND, 's', tx(null))[0]).toMatchObject({ direction: 'in', amount: '100000000', counterparty: ME });
    expect(fromSolanaTx(solana, ME, 's', tx({ InstructionError: [0, 'Custom'] }))).toEqual([]);
  });
});
