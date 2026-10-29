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
  const trx = (value: Record<string, unknown> = {}, feeLimit?: number, extra?: Record<string, unknown>) =>
    buildRawTx(
      {
        type: 'TransferContract',
        value: { owner_address: tronAddressToHex(FROM), to_address: tronAddressToHex(TO), amount: 1_500_000, ...value },
      },
      feeLimit,
      extra,
    ) as TronTransaction;
  const expected = { type: 'TransferContract' as const, owner: FROM, to: TO, amount: 1_500_000n };
  const attacker = tronAddressFromEvmAddress('0x' + '66'.repeat(20));

  const trc20 = (data: string, value: Record<string, unknown> = {}, feeLimit = 100_000_000) =>
    buildRawTx(
      {
        type: 'TriggerSmartContract',
        value: {
          owner_address: tronAddressToHex(FROM),
          contract_address: tronAddressToHex(USDT),
          data,
          ...value,
        },
      },
      feeLimit,
    ) as TronTransaction;
  const params = encodeTransferParams(TO, 2_000_000n);
  const expectedTrc20 = {
    type: 'TriggerSmartContract' as const,
    owner: FROM,
    contract: USDT,
    data: 'a9059cbb' + params,
    maxFeeLimit: 100_000_000n,
  };

  it('accepts a transaction matching the request', () => {
    expect(() => assertTransaction(trx(), expected)).not.toThrow();
    expect(() => assertTransaction(trc20('a9059cbb' + params), expectedTrc20)).not.toThrow();
  });

  it('rejects when txID does not hash from raw_data_hex', () => {
    const tx = trx();
    tx.txID = '00'.repeat(32);
    expect(() => assertTransaction(tx, expected)).toThrow('hash mismatch');
  });

  it('rejects a different recipient or amount', () => {
    expect(() => assertTransaction(trx({ to_address: tronAddressToHex(attacker) }), expected)).toThrow('recipient');
    expect(() => assertTransaction(trx({ amount: 15_000_000 }), expected)).toThrow('amount');
  });

  it('rejects the wrong contract type', () => {
    expect(() => assertTransaction(trx(), expectedTrc20)).toThrow('Unexpected');
  });

  it('ignores the node JSON: the signed bytes decide', () => {
    // JSON claims a TRX transfer, the signed bytes are a TRC-20 call.
    const tx = trc20('a9059cbb' + params);
    tx.raw_data.contract = [{ type: 'TransferContract' }];
    expect(() => assertTransaction(tx, expected)).toThrow('Unexpected');
  });

  it('rejects the expected values hidden in a memo next to a different contract', () => {
    // The memo carries the expected owner, recipient and amount bytes; the contract pays the attacker.
    const memo = tronAddressToHex(FROM) + tronAddressToHex(TO) + '18' + encodeVarint(1_500_000n);
    const tx = trx({ to_address: tronAddressToHex(attacker) }, undefined, { data: memo });
    expect(tx.raw_data_hex).toContain(tronAddressToHex(TO).toLowerCase());
    expect(() => assertTransaction(tx, expected)).toThrow();
  });

  it('rejects TRC-20 call data with anything after the transfer arguments', () => {
    const evil = 'a9059cbb' + encodeTransferParams(attacker, 10n ** 12n) + 'a9059cbb' + params;
    expect(() => assertTransaction(trc20(evil), expectedTrc20)).toThrow('call data');
  });

  it('rejects TRX sent along with a TRC-20 call, or a fee limit above ours', () => {
    expect(() => assertTransaction(trc20('a9059cbb' + params, { call_value: 5 }), expectedTrc20)).toThrow(
      'call value',
    );
    expect(() => assertTransaction(trc20('a9059cbb' + params, {}, 1_000_000_000), expectedTrc20)).toThrow(
      'fee limit',
    );
  });

  it('rejects a transaction that stays valid too long', () => {
    expect(() => assertTransaction(trx({}, undefined, { expiration: Date.now() + 24 * 3600_000 }), expected)).toThrow(
      'expiry',
    );
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
