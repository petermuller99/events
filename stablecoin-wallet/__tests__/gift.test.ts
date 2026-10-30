import { deriveKeys } from '../src/lib/keys';
import { GIFT_PAGE_URL, giftLink } from '../src/lib/gift';
import { TEST_PHRASE } from './helpers';

describe('gift links', () => {
  const keys = deriveKeys(TEST_PHRASE);

  it('puts the name and receive addresses in the fragment', () => {
    const link = giftLink(keys, 'Pearl', { photo: false });
    expect(link.startsWith(GIFT_PAGE_URL + '#')).toBe(true);
    const q = new URLSearchParams(link.split('#')[1]);
    expect(q.get('n')).toBe('Pearl');
    expect(q.get('sol')).toBe(keys.solana.address);
    expect(q.get('evm')).toBe(keys.evm.address);
    expect(q.has('p')).toBe(false);
  });

  it('adds the photo flag only when switched on', () => {
    expect(new URLSearchParams(giftLink(keys, 'Pearl', { photo: true }).split('#')[1]).get('p')).toBe('1');
  });

  it('never includes anything secret', () => {
    const link = giftLink(keys, 'Pearl', { photo: true });
    expect(link).not.toContain(keys.evm.privateKey.slice(2));
    expect(link).not.toContain(keys.solana.privateKey.slice(2, 20));
  });
});
