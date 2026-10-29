import { getChain } from '../src/lib/config';
import {
  associatedTokenAddress,
  compileMessage,
  createTokenAccountInstruction,
  deriveSolanaKey,
  priorityFeeInstructions,
  signTransaction,
  SolanaClient,
  toBase64,
  transferSolInstruction,
  transferTokenInstruction,
} from '../src/lib/solana';

// Talks to real Solana nodes, so it only runs when SOLANA_LIVE=1 (in CI).
const live = process.env.SOLANA_LIVE === '1' ? describe : describe.skip;
jest.setTimeout(60_000);

live('Solana network (live)', () => {
  const mainnet = getChain('mainnet', 'solana');
  const devnet = getChain('testnet', 'solana');

  it('token contracts report the configured decimals', async () => {
    for (const chain of [mainnet, devnet]) {
      const client = new SolanaClient(chain.rpcUrl);
      for (const t of chain.tokens) expect(await client.getTokenDecimals(t.address)).toBe(t.decimals);
    }
  });

  // An unfunded sender: the node must parse and signature-check the transaction, then
  // reject it only because the fee payer has no SOL. A format or signing bug would fail
  // earlier with a different error.
  it('accepts the format and signature of SOL and USDC transfers', async () => {
    const client = new SolanaClient(devnet.rpcUrl);
    const sender = deriveSolanaKey(new Uint8Array(64).map((_, i) => (i * 7 + Date.now()) % 256));
    const recipient = deriveSolanaKey(new Uint8Array(64).fill(3)).address;
    const usdc = devnet.tokens[0].address;
    const blockhash = await client.getLatestBlockhash();
    const messages = [
      compileMessage(sender.address, [...priorityFeeInstructions(), transferSolInstruction(sender.address, recipient, 1_000_000n)], blockhash),
      compileMessage(
        sender.address,
        [
          ...priorityFeeInstructions(),
          createTokenAccountInstruction(sender.address, recipient, usdc),
          transferTokenInstruction(associatedTokenAddress(sender.address, usdc), usdc, associatedTokenAddress(recipient, usdc), sender.address, 1n, 6),
        ],
        blockhash,
      ),
    ];
    for (const message of messages) {
      const { wire } = signTransaction(message, sender.privateKey);
      const result = await client.call<{ value: { err: unknown } }>('simulateTransaction', [
        toBase64(wire),
        { encoding: 'base64', sigVerify: true, commitment: 'confirmed' },
      ]);
      expect(result.value.err).toBe('AccountNotFound');
    }
  });
});
