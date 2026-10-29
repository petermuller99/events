# Stablecoin Wallet

A simple non-custodial mobile wallet (iOS and Android, built with Expo) for USDT and USDC on:

| Network | Standard | Tokens | Fee coin |
|---|---|---|---|
| Ethereum | ERC-20 | USDT, USDC | ETH |
| BNB Smart Chain | BEP-20 | USDT, USDC | BNB |
| Tron | TRC-20 | USDT | TRX |

One 12-word recovery phrase controls all three. Ethereum and BSC share one `0x…` address; Tron
gets its own `T…` address. The phrase uses standard BIP-44 paths (`m/44'/60'/0'/0/0` and
`m/44'/195'/0'/0/0`), so it also restores in MetaMask, Trust Wallet and TronLink.

> USDC on Tron is not listed because Circle ended support for it in 2024.

## Features

- Create a wallet (with a written-backup check) or import an existing phrase
- Balances for each token plus the fee coin, and a total across chains
- Receive screen with QR code, copy button and a wrong-network warning
- Send with recipient checks (checksum, and blocking 0x↔T mix-ups), a fee estimate before you
  confirm, and a warning when the fee coin is missing
- Testnet/mainnet switch. It defaults to testnet, and mainnet asks for confirmation first.
- Face ID, fingerprint or device passcode to unlock, send and reveal the phrase; the wallet
  locks again after 2 minutes in the background

## Run it

```bash
cd stablecoin-wallet
npm install
npx expo start
```

Scan the QR code with the **Expo Go** app on your phone (Android or iOS). Every native module
used here ships with Expo Go, so no custom build is needed to try the app. (On iOS, Expo Go
can't use Face ID for third-party apps, so it falls back to the passcode; a real build uses
Face ID.)

For store builds use EAS (`npx eas-cli@latest build`). Set your own `ios.bundleIdentifier` and
`android.package` in `app.json` first; they are placeholders (`com.example…`).

## Testing with free test tokens

Testnet mode uses Sepolia, BSC Testnet and Tron Nile. Open **Receive** on each network for a
faucet link:

- **Sepolia:** test ETH from any Sepolia faucet, plus test USDC from https://faucet.circle.com
  (there is no official USDT on Sepolia)
- **BSC Testnet:** tBNB and test USDT/USDC from https://www.bnbchain.org/en/testnet-faucet
- **Tron Nile:** TRX and USDT from https://nileex.io/join/getJoinPage

## Configuration

Default RPC endpoints are free public ones (publicnode.com, TronGrid). For real use, set your
own in a `.env` file (copy `.env.example` to `.env.local`). Mainnet TronGrid in particular rate-limits requests
without an API key (free at https://www.trongrid.io).

Token contracts live in `src/lib/config.ts`. Checks protect them in two ways:

- Unit tests verify the address checksums.
- At runtime, the app compares each token's `decimals()` with the configured value before it
  shows a balance or sends anything.

If you change a contract address, verify it on Etherscan, BscScan or Tronscan.

## Code layout

```
src/
  app/                 screens (Expo Router)
  lib/
    config.ts          networks, RPC URLs, token contracts
    keys.ts            recovery phrase -> EVM and Tron keys
    evm.ts             Ethereum + BSC via ethers.js
    tron.ts            Tron via the TronGrid HTTP API (build, check, sign, broadcast)
    tron-address.ts    T… address encoding/validation
    wallet.ts          chain-agnostic layer used by the screens
    storage.ts         recovery phrase in iOS Keychain / Android Keystore (expo-secure-store)
    auth.ts            biometric / passcode prompt
  state/WalletContext.tsx   lock/unlock state
__tests__/             unit tests (TronWeb is used only here, as a reference implementation)
```

Tron transactions are built by the node and then checked locally before signing: the hash
must match and the bytes must contain the expected sender, recipient and amount. A faulty or
malicious node therefore cannot get a different transfer signed.

## Checks

```bash
npm test            # unit tests
npm run typecheck
npm run lint
```

## Security notes and limits

- This is a starter wallet and has not been audited. Try it on testnet and use small amounts
  on mainnet.
- Keys never leave the phone. There is no server and no analytics.
- The phrase is stored with `WHEN_UNLOCKED_THIS_DEVICE_ONLY`, so it is never included in
  iCloud or Google backups. Losing the phone and the written phrase means losing the funds.
- If the phone has no screen lock, the app shows a warning, because it cannot protect itself.
- Not included yet: transaction history, address book, screenshot blocking on the phrase
  screen, multiple accounts, and fiat prices (the total assumes $1 per stablecoin).
- This wallet is non-custodial. Holding funds for other people instead would make it a
  regulated service (in Nigeria, for example, under the SEC's rules for virtual asset service
  providers).
