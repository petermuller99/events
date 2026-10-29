import { TronWeb, utils as tronUtils } from 'tronweb';

export const tronWeb = new TronWeb({ fullHost: 'http://127.0.0.1:1' });
export { tronUtils };

// Well-known development phrase (Hardhat/Anvil default). Never use it for real funds.
export const TEST_PHRASE = 'test test test test test test test test test test test junk';

/** Serialises a transaction JSON (hex addresses) the way a Tron node would. */
export function buildRawTx(contract: { type: string; value: Record<string, unknown> }, feeLimit?: number) {
  const tx = {
    visible: false,
    txID: '',
    raw_data_hex: '',
    raw_data: {
      contract: [{ parameter: { value: contract.value, type_url: `type.googleapis.com/protocol.${contract.type}` }, type: contract.type }],
      ref_block_bytes: 'a1b2',
      ref_block_hash: '0123456789abcdef',
      expiration: 1_800_000_000_000,
      timestamp: 1_799_999_940_000,
      ...(feeLimit ? { fee_limit: feeLimit } : {}),
    },
  };
  const pb = tronUtils.transaction.txJsonToPb(tx);
  tx.raw_data_hex = tronUtils.transaction.txPbToRawDataHex(pb).toLowerCase();
  tx.txID = tronUtils.transaction.txPbToTxID(pb).replace(/^0x/, '');
  return tx;
}
