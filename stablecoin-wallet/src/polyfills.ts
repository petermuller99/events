import { getRandomValues } from 'expo-crypto';

// ethers reads randomness from the Web Crypto API, which Hermes may not provide.
const g = globalThis as { crypto?: { getRandomValues?: unknown } };
if (!g.crypto) g.crypto = {};
if (typeof g.crypto.getRandomValues !== 'function') {
  g.crypto.getRandomValues = getRandomValues;
}
