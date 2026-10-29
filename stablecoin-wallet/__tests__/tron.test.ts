import { SigningKey, recoverAddress } from 'ethers';
import { deriveKeys } from '../src/lib/keys';
import {
  assertTransaction,
  encodeTransferParams,
  encodeVarint,
  signTronTransaction,
  TronClient,
  type TronTransaction,
} from '../src/lib/tron';
import {
  isValidTronAddress,
  tronAddressFromEvmAddress,
  tronAddressToEvmHex,
  tronAddressToHex,
} from '../src/lib/tron-address';
import { buildRawTx, TEST_PHRASE, tronUtils, tronWeb } from './helpers';

const USDT = 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t';
const keys = deriveKeys(TEST_PHRASE);
const FROM = keys.tron.address;
const TO = tronAddressFromEvmAddress('0x' + '11'.repeat(20));

describe('Tron addresses', () => {
  it('validates real addresses and rejects typos', () => {
    expect(isValidTronAddress(USDT)).toBe(true);
    expect(isValidTronAddress(USDT.slice(0, -1) + 'u')).toBe(false);
    expect(isValidTronAddress('0xdAC17F958D2ee523a2206206994597C13D831ec7')).toBe(false);
    expect(isValidTronAddress('')).toBe(false);
  });

  it('matches TronWeb hex conversion both ways', () => {
    expect(tronAddressToHex(USDT)).toBe(tronWeb.address.toHex(USDT).toLowerCase());
    const hex = tronWeb.address.toHex(USDT);
    expect(tronAddressFromEvmAddress('0x' + hex.slice(2))).toBe(USDT);
    expect(tronAddressToEvmHex(USDT)).toBe('0x' + hex.slice(2).toLowerCase());
  });
});

describe('signTronTransaction', () => {
  const tx = buildRawTx({
    type: 'TransferContract',
    value: { owner_address: tronAddressToHex(FROM), to_address: tronAddressToHex(TO), amount: 1_500_000 },
  }) as TronTransaction;

  it('produces the same signature as TronWeb (hex case aside)', () => {
    const ours = signTronTransaction(tx, keys.tron.privateKey);
    const theirs = tronUtils.crypto.signTransaction(keys.tron.privateKey.slice(2), { ...tx, signature: [] });
    expect(ours.signature![0]).toBe(theirs.signature[0].toLowerCase());
  });

  it('signs with a key that recovers to the sender address', () => {
    const sig = '0x' + signTronTransaction(tx, keys.tron.privateKey).signature![0];
    expect(tronAddressFromEvmAddress(recoverAddress('0x' + tx.txID, sig))).toBe(FROM);
    expect(SigningKey.recoverPublicKey('0x' + tx.txID, sig)).toBe(
      new SigningKey(keys.tron.privateKey).publicKey,
    );
  });
});

describe('assertTransaction', () => {
  const trxTx = () =>
    buildRawTx({
      type: 'TransferContract',
      value: { owner_address: tronAddressToHex(FROM), to_address: tronAddressToHex(TO), amount: 1_500_000 },
    }) as TronTransaction;
  const expected = [tronAddressToHex(FROM), tronAddressToHex(TO), '18' + encodeVarint(1_500_000n)];

  it('accepts a transaction matching the request', () => {
    expect(() => assertTransaction(trxTx(), 'TransferContract', expected)).not.toThrow();
  });

  it('rejects when txID does not hash from raw_data_hex', () => {
    const tx = trxTx();
    tx.txID = '00'.repeat(32);
    expect(() => assertTransaction(tx, 'TransferContract', expected)).toThrow('hash mismatch');
  });

  it('rejects a different recipient or amount', () => {
    const other = tronAddressFromEvmAddress('0x' + '22'.repeat(20));
    expect(() =>
      assertTransaction(trxTx(), 'TransferContract', [tronAddressToHex(FROM), tronAddressToHex(other)]),
    ).toThrow('does not match');
    expect(() =>
      assertTransaction(trxTx(), 'TransferContract', ['18' + encodeVarint(15_000_000n)]),
    ).toThrow('does not match');
  });

  it('rejects the wrong contract type', () => {
    expect(() => assertTransaction(trxTx(), 'TriggerSmartContract', [])).toThrow('Unexpected');
  });
});

describe('encodeVarint', () => {
  it('matches protobuf encoding', () => {
    expect(encodeVarint(0n)).toBe('00');
    expect(encodeVarint(1n)).toBe('01');
    expect(encodeVarint(300n)).toBe('ac02');
    expect(encodeVarint(1_500_000n)).toBe('e0c65b');
  });
});

/** Fake node: answers each path from a table and records requests. */
function fakeFetch(routes: Record<string, unknown>) {
  const calls: { path: string; body: any }[] = [];
  const fn = (async (url: string, init?: { body?: string }) => {
    const path = url.replace('http://node', '');
    calls.push({ path, body: init?.body ? JSON.parse(init.body) : undefined });
    if (!(path in routes)) return { ok: false, status: 404, json: async () => ({}) };
    return { ok: true, status: 200, json: async () => routes[path] };
  }) as unknown as typeof fetch;
  return { fn, calls };
}

describe('TronClient', () => {
  const trc20Tx = (to: string, amount: bigint) =>
    buildRawTx(
      {
        type: 'TriggerSmartContract',
        value: {
          owner_address: tronAddressToHex(FROM),
          contract_address: tronAddressToHex(USDT),
          data: 'a9059cbb' + encodeTransferParams(to, amount),
          call_value: 0,
        },
      },
      100_000_000,
    );

  it('builds a TRC-20 transfer and checks it before returning', async () => {
    const tx = trc20Tx(TO, 2_000_000n);
    const { fn, calls } = fakeFetch({ '/wallet/triggersmartcontract': { result: { result: true }, transaction: tx } });
    const client = new TronClient('http://node', 'key', fn);
    await expect(client.buildTrc20Transfer(FROM, TO, USDT, 2_000_000n)).resolves.toEqual(tx);
    expect(calls[0].body).toMatchObject({
      owner_address: FROM,
      contract_address: USDT,
      function_selector: 'transfer(address,uint256)',
      visible: true,
    });
  });

  it('refuses a node-built TRC-20 transfer to a different address', async () => {
    const attacker = tronAddressFromEvmAddress('0x' + '66'.repeat(20));
    const { fn } = fakeFetch({
      '/wallet/triggersmartcontract': { result: { result: true }, transaction: trc20Tx(attacker, 2_000_000n) },
    });
    const client = new TronClient('http://node', undefined, fn);
    await expect(client.buildTrc20Transfer(FROM, TO, USDT, 2_000_000n)).rejects.toThrow('does not match');
  });

  it('reads TRC-20 balances and TRX balances', async () => {
    const { fn, calls } = fakeFetch({
      '/wallet/triggerconstantcontract': { result: { result: true }, constant_result: ['00'.repeat(31) + '64'] },
      '/wallet/getaccount': { address: FROM, balance: 5_000_000 },
    });
    const client = new TronClient('http://node', undefined, fn);
    await expect(client.getTokenBalance(FROM, USDT)).resolves.toBe(100n);
    await expect(client.getTrxBalance(FROM)).resolves.toBe(5_000_000n);
    expect(calls[0].body.parameter).toBe('0'.repeat(24) + tronAddressToHex(FROM).slice(2));
  });

  it('treats a missing balance as zero (unactivated account)', async () => {
    const { fn } = fakeFetch({ '/wallet/getaccount': {} });
    const client = new TronClient('http://node', undefined, fn);
    await expect(client.getTrxBalance(TO)).resolves.toBe(0n);
    await expect(client.isActivated(TO)).resolves.toBe(false);
  });

  it('surfaces hex-encoded node errors as text', async () => {
    const message = Buffer.from('balance is not sufficient').toString('hex');
    const { fn } = fakeFetch({ '/wallet/broadcasttransaction': { result: false, code: 'CONTRACT_VALIDATE_ERROR', message } });
    const client = new TronClient('http://node', undefined, fn);
    await expect(client.broadcast(trc20Tx(TO, 1n) as TronTransaction)).rejects.toThrow('balance is not sufficient');
  });
});
