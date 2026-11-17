import { HDNodeWallet, Mnemonic } from 'ethers';
import { deriveKeys } from '../src/lib/keys';
import {
  deriveSuiKey,
  encodeSuiTransfer,
  isSuiAddress,
  isSuiCoinType,
  pickGasCoins,
  signSuiTransaction,
  suiDigest,
} from '../src/lib/sui';

// Vectors from the official Sui TypeScript SDK (@mysten/sui 2.38.0): Ed25519Keypair.deriveKeypair,
// Transaction.build / signTransaction / getDigest for the same transfer.
const ABANDON = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';
const SDK_ADDRESS = '0x5e93a736d04fbb25737aa40bee40171ef79f65fae833749e3c089fe7cc2161f1';
const SDK_SECRET = '0x8869cb07178bf67e08d7c4abdf45487dbf379c9a452fcec2836854bf4a3d29b0';
const SDK_TX =
  '000002000887d61200000000000020abababababababababababababababababababababababababababababababab02020001010000010103000000000101005e93a736d04fbb25737aa40bee40171ef79f65fae833749e3c089fe7cc2161f10211111111111111111111111111111111111111111111111111111111111111112a000000000000002035834a8ac17ca48fb14ac8f99c17c98747e95dd07294ae41a46b382246a4499b22222222222222222222222222222222222222222222222222222222222222220700000000000000204c78adacf2a2f5ad80f27ed7d54aa69d3a78f1ca67fdef9ecf5754f5b8bb77b05e93a736d04fbb25737aa40bee40171ef79f65fae833749e3c089fe7cc2161f1e803000000000000404b4c000000000000';
const SDK_SIGNATURE =
  'AAELOw5O5pxjC0AVbZXTAdSK5DO3kSETmjUY6Zj0EIx+87RZOSIS7AkmqSLDUZ3zckDl91oU8nNerM3aFt2zxQGQC02B7s6j3y90sUIAxPTPP0mvrKemNP/Sz2/4K9rs8g==';
const SDK_DIGEST = '6aEQfWdcuScyg7vkhgWrds7pj1F8tQVzuFnvD3mmBvxW';
// The same transfer paid from the address balance (coinWithBalance, no gas coins, valid
// during epochs 1314-1315 on mainnet, nonce 7).
const SDK_AB_TX =
  '0000040020abababababababababababababababababababababababababababababababab020087d61200000000000007000000000000000000000000000000000000000000000000000000000000000203737569035355490000000887d612000000000000205e93a736d04fbb25737aa40bee40171ef79f65fae833749e3c089fe7cc2161f10400000000000000000000000000000000000000000000000000000000000000000204636f696e0c72656465656d5f66756e64730107000000000000000000000000000000000000000000000000000000000000000203737569035355490001010100020200000101020000000000000000000000000000000000000000000000000000000000000000000204636f696e0a73656e645f66756e64730107000000000000000000000000000000000000000000000000000000000000000203737569035355490002020000010300010103010000000100005e93a736d04fbb25737aa40bee40171ef79f65fae833749e3c089fe7cc2161f1005e93a736d04fbb25737aa40bee40171ef79f65fae833749e3c089fe7cc2161f1e803000000000000404b4c00000000000201220500000000000001230500000000000000002035834a8ac17ca48fb14ac8f99c17c98747e95dd07294ae41a46b382246a4499b07000000';
const SDK_AB_SIGNATURE =
  'AJJ+0uDK9Wm2GcnNgwPqpr/ukCwB/IhJ79FXcelhVYu2Af7r8rZfJmf3WkxN4pwVLc2j0j7E8VSjN0cDsvBQ7ASQC02B7s6j3y90sUIAxPTPP0mvrKemNP/Sz2/4K9rs8g==';
const SDK_AB_DIGEST = 'ANZtoMMbJFZMyhK3vUSVtr73nWSrNF1ASgzZKFjUfzMJ';

const key = deriveSuiKey(Mnemonic.fromPhrase(ABANDON).computeSeed());
const transfer = {
  sender: key.address,
  recipient: '0x' + 'ab'.repeat(32),
  amount: 1_234_567n,
  source: {
    kind: 'coins' as const,
    gasCoins: [
      { objectId: '0x' + '11'.repeat(32), version: '42', digest: '4btiuiMPvEENsttpZC7CZ53DruC3MAgfznDbASZ7DR6S' },
      { objectId: '0x' + '22'.repeat(32), version: '7', digest: '69WiPg3DAQiwdxfncX6wYQ2siKwAe6L9BZthQea3JNMD' },
    ],
  },
  gasPrice: 1000n,
  gasBudget: 5_000_000n,
};

describe('Sui', () => {
  it('derives the same key and address as the official SDK (and Slush/Phantom)', () => {
    expect(key.address).toBe(SDK_ADDRESS);
    expect(key.privateKey).toBe(SDK_SECRET);
    expect(deriveKeys(ABANDON).sui.address).toBe(SDK_ADDRESS);
    // Not the Ethereum address, even though both start with 0x.
    expect(key.address).not.toBe(HDNodeWallet.fromPhrase(ABANDON).address.toLowerCase());
  });

  it('builds byte-for-byte the transaction the SDK builds, and signs it the same', () => {
    const bytes = encodeSuiTransfer(transfer);
    expect(Buffer.from(bytes).toString('hex')).toBe(SDK_TX);
    expect(signSuiTransaction(bytes, key.privateKey)).toBe(SDK_SIGNATURE);
    expect(suiDigest(bytes)).toBe(SDK_DIGEST);
  });

  it('builds the SDK’s address-balance transfer byte for byte', () => {
    const bytes = encodeSuiTransfer({
      ...transfer,
      source: { kind: 'address-balance', epoch: 1314n, chain: '4btiuiMPvEENsttpZC7CZ53DruC3MAgfznDbASZ7DR6S', nonce: 7 },
    });
    expect(Buffer.from(bytes).toString('hex')).toBe(SDK_AB_TX);
    expect(signSuiTransaction(bytes, key.privateKey)).toBe(SDK_AB_SIGNATURE);
    expect(suiDigest(bytes)).toBe(SDK_AB_DIGEST);
  });

  it('refuses bad input', () => {
    expect(() => encodeSuiTransfer({ ...transfer, amount: 0n })).toThrow(/amount/);
    expect(() => encodeSuiTransfer({ ...transfer, recipient: '0x1234' })).toThrow(/Sui address/);
    expect(() => encodeSuiTransfer({ ...transfer, source: { kind: 'coins', gasCoins: [] } })).toThrow(/No SUI/);
  });

  it('checks addresses and coin types', () => {
    expect(isSuiAddress(SDK_ADDRESS)).toBe(true);
    expect(isSuiAddress('0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266')).toBe(false);
    expect(isSuiCoinType('0x2::sui::SUI')).toBe(true);
    expect(isSuiCoinType('0x0000000000000000000000000000000000000000000000000000000000000002::sui::SUI')).toBe(true);
    expect(isSuiCoinType('0xdead::sui::SUI')).toBe(false);
  });

  it('picks coin pieces to cover amount plus fee', () => {
    const c = (b: bigint, id: string) => ({ objectId: id, version: '1', digest: '1', balance: b });
    expect(pickGasCoins([c(5n, 'a'), c(3n, 'b')], 4n, 1n).map((x) => x.objectId)).toEqual(['a']);
    expect(pickGasCoins([c(5n, 'a'), c(3n, 'b')], 6n, 1n).map((x) => x.objectId)).toEqual(['a', 'b']);
    expect(() => pickGasCoins([c(5n, 'a')], 5n, 1n)).toThrow(/Not enough SUI/);
  });
});
