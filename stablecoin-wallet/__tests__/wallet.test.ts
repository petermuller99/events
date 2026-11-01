import { getAddress } from 'ethers';
import { formatAmount, formatDollars, parseAmount, toInputAmount } from '../src/lib/amount';
import { CHAINS, CHAIN_IDS } from '../src/lib/config';
import { decodeAddress } from '../src/lib/solana';
import { listAssets, normalizeRecipient, validateRecipient } from '../src/lib/wallet';

describe('token config', () => {
  for (const mode of ['mainnet', 'testnet'] as const) {
    for (const id of CHAIN_IDS) {
      const chain = CHAINS[mode][id];
      for (const token of chain.tokens) {
        it(`${mode} ${chain.name} ${token.symbol} address has a valid checksum`, () => {
          if (chain.kind === 'solana') expect(decodeAddress(token.address)).not.toBeNull();
          else expect(getAddress(token.address)).toBe(token.address);
        });
      }
    }
  }

  it('lists tokens before the native coin', () => {
    expect(listAssets('mainnet', 'bsc').map((a) => a.symbol)).toEqual(['USDT', 'BNB']);
    expect(listAssets('mainnet', 'bitcoin').map((a) => a.symbol)).toEqual(['BTC']);
    expect(listAssets('mainnet', 'solana').map((a) => a.symbol)).toEqual(['USDC', 'USDT', 'SOL']);
  });
});

describe('validateRecipient', () => {
  const evmAddr = '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266';
  const tronAddr = 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t';

  it('accepts valid addresses for each chain', () => {
    expect(validateRecipient('ethereum', evmAddr)).toBeNull();
    expect(validateRecipient('bsc', evmAddr.toLowerCase())).toBeNull();
  });

  it('blocks sending to the wrong network', () => {
    expect(validateRecipient('ethereum', ` ${tronAddr} `)).toMatch(/doesn’t support Tron/);
    expect(validateRecipient('solana', evmAddr)).toMatch(/Ethereum\/BSC address/);
  });

  it('catches typos via checksums', () => {
    expect(validateRecipient('ethereum', evmAddr.replace('f39F', 'f39f'))).toMatch(/Not a valid/);
  });

  it('checks Solana addresses and points to the right network', () => {
    const sol = '9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM';
    expect(validateRecipient('solana', sol)).toBeNull();
    expect(validateRecipient('solana', evmAddr)).toMatch(/Ethereum\/BSC/);
    expect(validateRecipient('solana', tronAddr)).toMatch(/doesn’t support Tron/);
    expect(validateRecipient('solana', 'EPjFWdd5AufqSSqeM2qN1xxybapC8G4wEGGkZwyTDt1v')).toBeNull();
    expect(validateRecipient('ethereum', sol)).toMatch(/Solana address/);
    expect(validateRecipient('bsc', sol)).toMatch(/Solana address/);
    expect(validateRecipient('solana', sol, sol)).toMatch(/own address/);
  });

  it('checks Bitcoin addresses and keeps them off the other networks', () => {
    const btc = 'bc1qcr8te4kr609gcawutmrza0j4xv80jy8z306fyu';
    expect(validateRecipient('bitcoin', btc)).toBeNull();
    expect(validateRecipient('bitcoin', btc, undefined, 'testnet')).toMatch(/real-money Bitcoin address/);
    expect(validateRecipient('bitcoin', evmAddr)).toMatch(/Ethereum\/BSC/);
    expect(validateRecipient('bitcoin', '9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM')).toMatch(/Solana address/);
    expect(validateRecipient('bitcoin', btc.slice(0, -1) + 'v')).toMatch(/Not a valid Bitcoin/);
    expect(validateRecipient('ethereum', btc)).toMatch(/Bitcoin address/);
    expect(validateRecipient('solana', '1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa')).toMatch(/Bitcoin address/);
    expect(validateRecipient('bitcoin', btc, btc)).toMatch(/own address/);
    // QR codes often carry bech32 addresses in capitals.
    expect(normalizeRecipient('bitcoin', ` ${btc.toUpperCase()} `)).toBe(btc);
    expect(validateRecipient('bitcoin', btc.toUpperCase())).toBeNull();
    expect(validateRecipient('bitcoin', btc.toUpperCase(), btc)).toMatch(/own address/);
    expect(normalizeRecipient('bitcoin', '1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa')).toBe('1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa');
  });

  it('flags the wallet sending to itself', () => {
    expect(validateRecipient('bsc', evmAddr.toLowerCase(), evmAddr)).toMatch(/own address/);
  });
});

describe('amounts', () => {
  it('parses decimals for the token precision', () => {
    expect(parseAmount('10.5', 6)).toBe(10_500_000n);
    expect(parseAmount('1', 18)).toBe(10n ** 18n);
    expect(parseAmount('0,25', 6)).toBe(250_000n);
  });

  it('rejects bad input', () => {
    expect(() => parseAmount('', 6)).toThrow();
    expect(() => parseAmount('abc', 6)).toThrow();
    expect(() => parseAmount('-1', 6)).toThrow();
    expect(() => parseAmount('0', 6)).toThrow(/greater than zero/);
    expect(() => parseAmount('1.1234567', 6)).toThrow(/6 decimal/);
  });

  it('formats with grouping and trimmed decimals', () => {
    expect(formatAmount(1_234_567_890_000n, 6)).toBe('1,234,567.89');
    expect(formatAmount(10n ** 18n, 18)).toBe('1');
    expect(formatAmount(1n, 18)).toBe('0');
    expect(formatDollars(40_000_000n, 6)).toBe('40.00');
    expect(formatDollars(125_505_000n, 6)).toBe('125.50');
    expect(formatDollars(1_234_567n * 10n ** 18n, 18)).toBe('1,234,567.00');
    expect(toInputAmount(1_500_000n, 6)).toBe('1.5');
    expect(toInputAmount(2_000_000n, 6)).toBe('2');
  });
});

describe('savings goal', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { goalPercent } = require('../src/lib/goal') as typeof import('../src/lib/goal');
  it('shows progress as a whole percentage, capped at 100', () => {
    expect(goalPercent({ name: 'bike', target: 500 }, 375.75)).toBe(75);
    expect(goalPercent({ name: 'bike', target: 500 }, 900)).toBe(100);
    expect(goalPercent({ name: 'bike', target: 0 }, 10)).toBe(0);
  });
});
