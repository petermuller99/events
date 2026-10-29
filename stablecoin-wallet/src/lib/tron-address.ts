import { decodeBase58, encodeBase58, getBytes, hexlify, sha256, toBeHex } from 'ethers';

// A Tron address is 0x41 followed by the same 20 bytes an Ethereum address would
// have for that key, base58check-encoded (4-byte double-SHA256 checksum).
const TRON_PREFIX = 0x41;

function checksum(payload: Uint8Array): Uint8Array {
  return getBytes(sha256(sha256(payload))).slice(0, 4);
}

export function tronAddressFromEvmAddress(evmAddress: string): string {
  const body = getBytes(evmAddress);
  if (body.length !== 20) throw new Error('Expected a 20-byte address');
  const payload = new Uint8Array(21);
  payload[0] = TRON_PREFIX;
  payload.set(body, 1);
  const full = new Uint8Array(25);
  full.set(payload);
  full.set(checksum(payload), 21);
  // encodeBase58 drops leading zero bytes, but the 0x41 prefix means there are none.
  return encodeBase58(full);
}

/** Returns the 21-byte payload, or null if the string is not a valid Tron address. */
function decodeTronAddress(address: string): Uint8Array | null {
  if (!/^T[1-9A-HJ-NP-Za-km-z]{33}$/.test(address)) return null;
  let full: Uint8Array;
  try {
    full = getBytes(toBeHex(decodeBase58(address), 25));
  } catch {
    return null;
  }
  const payload = full.slice(0, 21);
  if (payload[0] !== TRON_PREFIX) return null;
  const expected = checksum(payload);
  for (let i = 0; i < 4; i++) {
    if (full[21 + i] !== expected[i]) return null;
  }
  return payload;
}

export function isValidTronAddress(address: string): boolean {
  return decodeTronAddress(address) !== null;
}

/** "41…" hex form (42 chars, no 0x) used inside Tron transactions. */
export function tronAddressToHex(address: string): string {
  const payload = decodeTronAddress(address);
  if (!payload) throw new Error(`Invalid Tron address: ${address}`);
  return hexlify(payload).slice(2);
}

/** 0x-prefixed 20-byte form, as used in ABI-encoded contract parameters. */
export function tronAddressToEvmHex(address: string): string {
  return '0x' + tronAddressToHex(address).slice(2);
}
