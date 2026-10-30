import { deriveKeys, isValidMnemonic, mnemonicFromEntropy, normalizeMnemonic } from '../src/lib/keys';
import { TEST_PHRASE } from './helpers';

describe('deriveKeys', () => {
  const keys = deriveKeys(TEST_PHRASE);

  it('derives the standard first Ethereum account', () => {
    expect(keys.evm.address).toBe('0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266');
  });

  it('ignores case and extra whitespace in the phrase', () => {
    const messy = '  ' + TEST_PHRASE.toUpperCase().replace(/ /g, '   ') + '\n';
    expect(deriveKeys(messy).evm.address).toBe(keys.evm.address);
    expect(normalizeMnemonic(messy)).toBe(TEST_PHRASE);
  });
});

describe('mnemonics', () => {
  it('builds a valid 12-word phrase from 16 bytes', () => {
    const phrase = mnemonicFromEntropy(new Uint8Array(16).fill(7));
    expect(phrase.split(' ')).toHaveLength(12);
    expect(isValidMnemonic(phrase)).toBe(true);
  });

  it('rejects a phrase with a bad checksum word', () => {
    expect(isValidMnemonic(TEST_PHRASE.replace(/junk$/, 'test'))).toBe(false);
    expect(isValidMnemonic('not a real phrase')).toBe(false);
  });

  it('rejects entropy of the wrong size', () => {
    expect(() => mnemonicFromEntropy(new Uint8Array(8))).toThrow();
  });
});
