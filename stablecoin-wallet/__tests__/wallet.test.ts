import { getAddress } from 'ethers';
import { formatAmount, parseAmount, toInputAmount } from '../src/lib/amount';
import { CHAINS, CHAIN_IDS } from '../src/lib/config';
import { isValidTronAddress } from '../src/lib/tron-address';
import { listAssets, validateRecipient } from '../src/lib/wallet';

describe('token config', () => {
  for (const mode of ['mainnet', 'testnet'] as const) {
    for (const id of CHAIN_IDS) {
      const chain = CHAINS[mode][id];
      for (const token of chain.tokens) {
        it(`${mode} ${chain.name} ${token.symbol} address has a valid checksum`, () => {
          if (chain.kind === 'tron') expect(isValidTronAddress(token.address)).toBe(true);
          else expect(getAddress(token.address)).toBe(token.address);
        });
      }
    }
  }

  it('lists tokens before the native coin', () => {
    expect(listAssets('mainnet', 'bsc').map((a) => a.symbol)).toEqual(['USDT', 'USDC', 'BNB']);
    expect(listAssets('mainnet', 'tron').map((a) => a.symbol)).toEqual(['USDT', 'TRX']);
  });
});

describe('validateRecipient', () => {
  const evmAddr = '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266';
  const tronAddr = 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t';

  it('accepts valid addresses for each chain', () => {
    expect(validateRecipient('ethereum', evmAddr)).toBeNull();
    expect(validateRecipient('bsc', evmAddr.toLowerCase())).toBeNull();
    expect(validateRecipient('tron', ` ${tronAddr} `)).toBeNull();
  });

  it('blocks sending to the wrong network', () => {
    expect(validateRecipient('ethereum', tronAddr)).toMatch(/Tron address/);
    expect(validateRecipient('tron', evmAddr)).toMatch(/Ethereum\/BSC address/);
  });

  it('catches typos via checksums', () => {
    expect(validateRecipient('ethereum', evmAddr.replace('f39F', 'f39f'))).toMatch(/Not a valid/);
    expect(validateRecipient('tron', tronAddr.replace('R7N', 'R7M'))).toMatch(/Not a valid/);
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
    expect(toInputAmount(1_500_000n, 6)).toBe('1.5');
    expect(toInputAmount(2_000_000n, 6)).toBe('2');
  });
});
