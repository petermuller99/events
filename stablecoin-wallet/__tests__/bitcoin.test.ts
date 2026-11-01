import * as btc from '@scure/btc-signer';
import { HDNodeWallet, Mnemonic } from 'ethers';
import {
  checkBitcoinAddress,
  deriveBitcoinKey,
  netChange,
  planTransfer,
  signPlan,
  type EsploraTx,
  type Utxo,
} from '../src/lib/bitcoin';

const root = (phrase: string) => HDNodeWallet.fromSeed(Mnemonic.fromPhrase(phrase).computeSeed());
const ABANDON = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';

describe('Bitcoin keys and addresses', () => {
  it('matches the BIP84 test vector (same address as other wallets)', () => {
    const key = deriveBitcoinKey(root(ABANDON));
    expect(key.address).toBe('bc1qcr8te4kr609gcawutmrza0j4xv80jy8z306fyu');
    expect(key.testAddress.startsWith('tb1q')).toBe(true);
  });

  it('checks addresses for the right network', () => {
    expect(checkBitcoinAddress('bc1qcr8te4kr609gcawutmrza0j4xv80jy8z306fyu', 'mainnet')).toBe('ok');
    expect(checkBitcoinAddress('1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa', 'mainnet')).toBe('ok');
    expect(checkBitcoinAddress('bc1qcr8te4kr609gcawutmrza0j4xv80jy8z306fyu', 'testnet')).toBe('wrong-network');
    expect(checkBitcoinAddress('bc1qcr8te4kr609gcawutmrza0j4xv80jy8z306fyv', 'mainnet')).toBe('invalid');
    expect(checkBitcoinAddress('0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266', 'mainnet')).toBe('invalid');
  });
});

describe('Bitcoin transfers', () => {
  const key = deriveBitcoinKey(root(ABANDON));
  const to = 'bc1q8c6fshw2dlwun7ekn9qwf37cu2rn755upcp6el';
  const utxos: Utxo[] = [
    { txid: 'aa'.repeat(32), vout: 0, value: 50_000, status: { confirmed: true } },
    { txid: 'bb'.repeat(32), vout: 1, value: 30_000, status: { confirmed: true } },
  ];

  it('pays the recipient exactly, returns change to us and signs a valid transaction', () => {
    const plan = planTransfer(key, 'mainnet', utxos, to, 20_000n, 10);
    expect(plan.outputs.find((o) => o.address === to)?.amount).toBe('20000');
    for (const o of plan.outputs) expect([to, key.address]).toContain(o.address);
    const fee = BigInt(plan.fee);
    expect(fee).toBeGreaterThan(1_000n); // ~141 vB at 10 sat/vB
    expect(fee).toBeLessThan(3_000n);

    const { hex, txid } = signPlan(key, 'mainnet', plan, to, 20_000n);
    const tx = btc.Transaction.fromRaw(Buffer.from(hex, 'hex'));
    expect(tx.id).toBe(txid);
    expect(tx.isFinal).toBe(true);
    const spent = plan.inputs.map((i) => i.txid);
    for (let i = 0; i < tx.inputsLength; i++) expect(spent).toContain(Buffer.from(tx.getInput(i).txid!).toString('hex'));
  });

  it('refuses when the balance can’t cover amount and fee', () => {
    expect(() => planTransfer(key, 'mainnet', utxos, to, 79_900n, 10)).toThrow(/Not enough bitcoin/);
  });

  it('refuses to sign a plan that pays someone else or more', () => {
    const plan = planTransfer(key, 'mainnet', utxos, to, 20_000n, 10);
    const attacker = 'bc1qar0srrr7xfkvy5l643lydnw9re59gtzzwf5mdq';
    const swapped = { ...plan, outputs: plan.outputs.map((o) => (o.address === to ? { ...o, address: attacker } : o)) };
    expect(() => signPlan(key, 'mainnet', swapped, to, 20_000n)).toThrow(/changed/);
    expect(() => signPlan(key, 'mainnet', plan, to, 25_000n)).toThrow(/changed/);
    const greedy = { ...plan, fee: (BigInt(plan.fee) + 1n).toString() };
    expect(() => signPlan(key, 'mainnet', greedy, to, 20_000n)).toThrow(/Fee changed/);
  });
});

describe('Bitcoin history', () => {
  it('works out money in and out of the address', () => {
    const me = 'bc1qme';
    const tx = (vin: [string, number][], vout: [string, number][]): EsploraTx => ({
      txid: 't', fee: 200, status: { confirmed: true, block_time: 1 },
      vin: vin.map(([a, v]) => ({ prevout: { scriptpubkey_address: a, value: v } })),
      vout: vout.map(([a, v]) => ({ scriptpubkey_address: a, value: v })),
    });
    expect(netChange(tx([['other', 10_000]], [[me, 9_800]]), me)).toBe(9_800n);
    expect(netChange(tx([[me, 10_000]], [['other', 4_000], [me, 5_800]]), me)).toBe(-4_200n);
  });
});
