import { AbiCoder, Interface } from 'ethers';
import { getChain } from '../src/lib/config';
import {
  allFound,
  coinUsd,
  foundTokens,
  hiddenReason,
  MULTICALL3,
  parseCoinList,
  parseMarkets,
  resetFoundForTests,
  scanFound,
  setFoundEnabled,
  setHiddenByYou,
} from '../src/lib/found';
import { listAssets } from '../src/lib/wallet';

jest.mock('../src/lib/evm', () => ({ getProvider: jest.fn() }));
// eslint-disable-next-line @typescript-eslint/no-require-imports
const evm = require('../src/lib/evm') as { getProvider: jest.Mock };

const coin = (over: Partial<Parameters<typeof hiddenReason>[0]> = {}) => ({
  symbol: 'LAB',
  name: 'Lab Token',
  decimals: 18,
  balance: (10n ** 18n).toString(), // 1 LAB
  coingeckoId: 'lab',
  price: 0.5,
  volume: 50_000,
  ...over,
});

describe('found coin rules', () => {
  it('shows a listed, priced, traded coin worth at least $0.10', () => {
    expect(hiddenReason(coin())).toBeUndefined();
    expect(coinUsd(coin())).toBeCloseTo(0.5);
    expect(hiddenReason(coin({ price: 0.1 }))).toBeUndefined();
  });

  it('hides coins worth less than $0.10, unpriced, untraded or unlisted', () => {
    expect(hiddenReason(coin({ price: 0.09 }))).toBe('too-small');
    expect(hiddenReason(coin({ price: undefined }))).toBe('no-price');
    expect(hiddenReason(coin({ volume: 200 }))).toBe('not-traded');
    expect(hiddenReason(coin({ coingeckoId: undefined }))).toBe('unlisted');
  });

  it('hides coins posing as USDT, USDC or a network coin, and scam names', () => {
    expect(hiddenReason(coin({ symbol: 'USDT' }))).toBe('lookalike');
    expect(hiddenReason(coin({ symbol: 'usd-c' }))).toBe('lookalike');
    expect(hiddenReason(coin({ symbol: 'ETH' }))).toBe('lookalike');
    expect(hiddenReason(coin({ name: 'Claim $500 at sol-gift.xyz' }))).toBe('link-name');
    expect(hiddenReason(coin({ symbol: 'WWW.BONUS.COM' }))).toBe('link-name');
    expect(hiddenReason(coin({ name: 'Visit t.me/airdrop' }))).toBe('link-name');
    // Real coins with similar names are fine.
    expect(hiddenReason(coin({ symbol: 'WETH', name: 'Wrapped Ether' }))).toBeUndefined();
  });

  it('reads CoinGecko’s coin list per network', () => {
    const list = parseCoinList([
      { id: 'lab', symbol: 'lab', platforms: { 'binance-smart-chain': '0xABCDEF0000000000000000000000000000000001' } },
      { id: 'jup', symbol: 'jup', platforms: { solana: 'JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN' } },
      { id: 'core-thing', platforms: { core: '0x00000000000000000000000000000000000000c0' } },
      { id: 'no-platforms' },
      'junk',
    ]);
    expect(list.bsc).toEqual({ '0xabcdef0000000000000000000000000000000001': 'lab' });
    expect(list.solana).toEqual({ JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN: 'jup' });
    expect(list.core).toEqual({ '0x00000000000000000000000000000000000000c0': 'core-thing' });
  });

  it('reads market data and trims names', () => {
    const m = parseMarkets([
      { id: 'lab', symbol: 'lab', name: 'Lab', current_price: 0.25, total_volume: 1234, price_change_percentage_24h: -4.8 },
      { id: 'bad', symbol: 1 },
    ]);
    expect(m).toEqual({ lab: { symbol: 'LAB', name: 'Lab', price: 0.25, volume: 1234, change24h: -4.8 } });
  });
});

describe('scanning the wallet', () => {
  const OWNER_EVM = '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266';
  const OWNER_SOL = '9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM';
  const LAB = '0x1111111111111111111111111111111111111111';
  const FAKE_USDT = '0x2222222222222222222222222222222222222222';
  const DUST = '0x3333333333333333333333333333333333333333';
  const BSC_USDT = getChain('mainnet', 'bsc').tokens[0].address;
  const JUP = 'JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN';
  const SCAM_MINT = 'ScamMint1111111111111111111111111111111111';

  const erc20 = new Interface(['function balanceOf(address) view returns (uint256)', 'function decimals() view returns (uint8)']);
  const mc = new Interface([
    'function tryAggregate(bool requireSuccess, (address target, bytes callData)[] calls) view returns ((bool success, bytes returnData)[])',
  ]);
  const coder = AbiCoder.defaultAbiCoder();
  const balances: Record<string, bigint> = { [LAB]: 3n * 10n ** 18n, [FAKE_USDT]: 10n ** 24n, [DUST]: 10n ** 18n };

  beforeEach(async () => {
    resetFoundForTests();
    const AsyncStorage = (await import('@react-native-async-storage/async-storage')).default;
    await AsyncStorage.clear();
    evm.getProvider.mockImplementation((chain: { id: string }) => ({
      getCode: async () => '0x6080',
      call: async (tx: { to: string; data: string }) => {
        expect(tx.to.toLowerCase()).toBe(MULTICALL3.toLowerCase());
        const [, calls] = mc.decodeFunctionData('tryAggregate', tx.data) as unknown as [boolean, [string, string][]];
        const results = calls.map(([target, data]) => {
          const t = target.toLowerCase();
          if (chain.id !== 'bsc') return [false, '0x'];
          if (data.startsWith(erc20.getFunction('decimals')!.selector)) return [true, coder.encode(['uint8'], [18])];
          return [true, coder.encode(['uint256'], [balances[t] ?? 0n])];
        });
        return mc.encodeFunctionResult('tryAggregate', [results]);
      },
    }));
    global.fetch = jest.fn(async (url: string, init?: { body?: string }) => {
      const json = (v: unknown) => ({ ok: true, status: 200, json: async () => v });
      if (url.includes('coins/list')) {
        return json([
          { id: 'lab', platforms: { 'binance-smart-chain': LAB } },
          { id: 'fake-usdt', platforms: { 'binance-smart-chain': FAKE_USDT } },
          { id: 'dust', platforms: { 'binance-smart-chain': DUST } },
          { id: 'tether', platforms: { 'binance-smart-chain': BSC_USDT.toLowerCase() } },
          { id: 'jupiter', platforms: { solana: JUP } },
        ]);
      }
      if (url.includes('coins/markets')) {
        return json([
          { id: 'lab', symbol: 'lab', name: 'Lab', current_price: 10, total_volume: 420_000 },
          { id: 'fake-usdt', symbol: 'usdt', name: 'Tether USD', current_price: 1, total_volume: 9_999 },
          { id: 'dust', symbol: 'dust', name: 'Dust', current_price: 0.01, total_volume: 5_000 },
          { id: 'jupiter', symbol: 'jup', name: 'Jupiter', current_price: 0.8, total_volume: 1e8 },
        ]);
      }
      const body = JSON.parse(init?.body ?? '{}');
      if (body.method === 'getTokenAccountsByOwner') {
        const acct = (mint: string, amount: string, decimals: number) => ({
          account: { data: { parsed: { info: { mint, tokenAmount: { amount, decimals } } } } },
        });
        return json({ result: { value: [acct(JUP, '52000000', 6), acct(SCAM_MINT, '1000', 0)] } });
      }
      throw new Error(`unexpected ${url}`);
    }) as unknown as typeof fetch;
  });

  it('shows real coins with value and hides the rest with a reason', async () => {
    expect(await scanFound({ evm: OWNER_EVM, solana: OWNER_SOL }, true)).toBe(true);
    const shown = foundTokens('mainnet', 'bsc').map((t) => t.symbol);
    expect(shown).toEqual(['LAB']);
    expect(foundTokens('mainnet', 'solana').map((t) => t.symbol)).toEqual(['JUP']);
    // The USDT Pearl Wallet ships with is never a "found" coin.
    expect(allFound().some((c) => c.address.toLowerCase() === BSC_USDT.toLowerCase())).toBe(false);
    const reasons = Object.fromEntries(allFound().map((c) => [c.symbol + ':' + c.chain, c.hidden ?? 'shown']));
    expect(reasons).toEqual({
      'LAB:bsc': 'shown',
      'USDT:bsc': 'lookalike',
      'DUST:bsc': 'too-small',
      'JUP:solana': 'shown',
      'UNKNOWN:solana': 'unlisted',
    });
    // Found coins become assets on their network, typed in their own units.
    const lab = listAssets('mainnet', 'bsc').find((a) => a.symbol === 'LAB')!;
    expect(lab).toMatchObject({ id: `f:${lab.contract}`, decimals: 18, found: { coingeckoId: 'lab' } });
    // Never on test money.
    expect(foundTokens('testnet', 'bsc')).toEqual([]);
  });

  it('hides a coin when asked, and can be switched off', async () => {
    await scanFound({ evm: OWNER_EVM, solana: OWNER_SOL }, true);
    const lab = foundTokens('mainnet', 'bsc')[0];
    await setHiddenByYou('bsc', lab.address, true);
    expect(foundTokens('mainnet', 'bsc')).toEqual([]);
    // Stays hidden after the next scan.
    await scanFound({ evm: OWNER_EVM, solana: OWNER_SOL }, true);
    expect(foundTokens('mainnet', 'bsc')).toEqual([]);
    await setHiddenByYou('bsc', lab.address, false);
    expect(foundTokens('mainnet', 'bsc').map((t) => t.symbol)).toEqual(['LAB']);
    await setFoundEnabled(false);
    expect(foundTokens('mainnet', 'solana')).toEqual([]);
  });
});
