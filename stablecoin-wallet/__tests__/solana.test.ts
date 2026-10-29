import {
  Keypair,
  Message,
  PublicKey,
  SystemInstruction,
  SystemProgram,
  Transaction,
} from '@solana/web3.js';
import { derivePath } from 'ed25519-hd-key';
import { Mnemonic } from 'ethers';
import {
  associatedTokenAddress,
  checkSolanaAddress,
  compileMessage,
  createTokenAccountInstruction,
  decodeAddress,
  deriveSolanaKey,
  encodeAddress,
  priorityFeeInstructions,
  signTransaction,
  transferSolInstruction,
  transferTokenInstruction,
  TOKEN_PROGRAM,
} from '../src/lib/solana';
import { TEST_PHRASE } from './helpers';

const USDC = 'EPjFWdd5AufqSSqeM2qN1xxybapC8G4wEGGkZwyTDt1v';
const seed = Mnemonic.fromPhrase(TEST_PHRASE).computeSeed();
const me = deriveSolanaKey(seed);
const other = Keypair.generate().publicKey.toBase58();
const BLOCKHASH = 'EkSnNWid2cvwEVnVx9aBqawnmiCNiDgp3gUdkDPTKN1N';

describe('Solana keys', () => {
  it('derives the same key as ed25519-hd-key and web3.js (Phantom path)', () => {
    const ref = derivePath("m/44'/501'/0'/0'", seed.slice(2));
    expect(me.privateKey.slice(2)).toBe(ref.key.toString('hex'));
    expect(me.address).toBe(Keypair.fromSeed(ref.key).publicKey.toBase58());
  });

  it('round-trips addresses, including ones with leading zero bytes', () => {
    for (const a of [me.address, USDC, '11111111111111111111111111111111']) {
      expect(encodeAddress(decodeAddress(a)!)).toBe(a);
      expect(Buffer.from(decodeAddress(a)!).equals(new PublicKey(a).toBuffer())).toBe(true);
    }
  });

  it('tells wallets, program addresses and junk apart', () => {
    expect(checkSolanaAddress(me.address)).toBe('ok');
    expect(checkSolanaAddress(associatedTokenAddress(me.address, USDC))).toBe('program');
    expect(checkSolanaAddress('0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266')).toBe('invalid');
    expect(checkSolanaAddress('TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t')).toBe('invalid');
  });

  it('finds the same token account address as web3.js', () => {
    const [ref] = PublicKey.findProgramAddressSync(
      [new PublicKey(me.address).toBuffer(), new PublicKey(TOKEN_PROGRAM).toBuffer(), new PublicKey(USDC).toBuffer()],
      new PublicKey('ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL'),
    );
    expect(associatedTokenAddress(me.address, USDC)).toBe(ref.toBase58());
  });
});

describe('Solana transactions', () => {
  it('builds a SOL transfer that web3.js decodes and verifies', () => {
    const message = compileMessage(me.address, [...priorityFeeInstructions(), transferSolInstruction(me.address, other, 1_234_567n)], BLOCKHASH);
    const { wire, signature } = signTransaction(message, me.privateKey);
    const tx = Transaction.from(Buffer.from(wire));
    expect(tx.verifySignatures()).toBe(true);
    expect(tx.feePayer?.toBase58()).toBe(me.address);
    expect(tx.recentBlockhash).toBe(BLOCKHASH);
    const transfer = tx.instructions[2];
    expect(transfer.programId.equals(SystemProgram.programId)).toBe(true);
    const info = SystemInstruction.decodeTransfer(transfer);
    expect(info.toPubkey.toBase58()).toBe(other);
    expect(info.lamports).toBe(1_234_567n);
    expect(signature.length).toBeGreaterThan(80);
  });

  it('builds a token transfer with account setup that web3.js decodes', () => {
    const source = associatedTokenAddress(me.address, USDC);
    const dest = associatedTokenAddress(other, USDC);
    const message = compileMessage(
      me.address,
      [createTokenAccountInstruction(me.address, other, USDC), transferTokenInstruction(source, USDC, dest, me.address, 5_000_000n, 6)],
      BLOCKHASH,
    );
    const parsed = Message.from(Buffer.from(message));
    expect(parsed.header.numRequiredSignatures).toBe(1);
    const tx = Transaction.populate(parsed);
    const [create, transfer] = tx.instructions;
    expect(create.keys[1].pubkey.toBase58()).toBe(dest);
    expect(create.keys[1].isWritable).toBe(true);
    expect(transfer.programId.toBase58()).toBe(TOKEN_PROGRAM);
    expect(transfer.keys.map((k) => k.pubkey.toBase58())).toEqual([source, USDC, dest, me.address]);
    expect(transfer.keys[3].isSigner).toBe(true);
    expect(transfer.data[0]).toBe(12);
    expect(Buffer.from(transfer.data).readBigUInt64LE(1)).toBe(5_000_000n);
    expect(transfer.data[9]).toBe(6);
  });
});
