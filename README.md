# QoreSeal 🔏

**Post-quantum message seals on QoreChain.**

QoreSeal seals a short message inside a QoreChain transaction that is signed
with **both** a classical secp256k1 signature **and** an ML-DSA-87
(Dilithium-5, NIST FIPS 204) post-quantum signature. The seal stays verifiable
forever from public chain data — even in a future where quantum computers can
break classical signatures, the ML-DSA-87 half still proves who sealed the
message and that it was not altered.

Built for the **QoreChain Developer Fest — "Build Before Q-Day"** (Quantum
Pass entry), on the `qorechain-diana` testnet (EVM chain ID 9800).

## The idea

A *seal* is a 1-uqor self-transfer whose memo is:

```
QORESEAL1|<sha256(message)>|<message>
```

The transaction is **hybrid-signed**:

1. The account's ML-DSA-87 public key (2592 bytes) is registered on-chain once
   via `MsgRegisterPQCKeyV2`.
2. For every seal, the ML-DSA-87 key signs the framed transaction sign-bytes;
   the signature (4627 bytes) travels inside the tx body as a
   `PQCHybridSignature` extension, next to the normal secp256k1 signature.
3. The chain's ante handler verifies **both** signatures before the seal is
   written into a block.

## Verify a seal (the original feature)

Anyone can verify any seal — no keys, no trust in this app:

- **In the web app**: paste a seal's transaction hash and QoreSeal checks, live
  against the testnet REST API:
  1. the tx is confirmed and succeeded,
  2. `sha256(message)` in the memo matches the message,
  3. the tx carries a `PQCHybridSignature` extension (algorithm 1 = ML-DSA-87),
  4. the extension's public key equals the sender's on-chain registered
     post-quantum key (`/qorechain/pqc/v1/account/{address}`).
- **In the CLI** (`scripts/verify.mjs`): the same four layers **plus** a full
  local re-verification of the ML-DSA-87 signature — the sign-bytes framing is
  reconstructed from the raw transaction bytes (body without the extension +
  authInfo) and checked with `pqcVerify`. This is a complete cryptographic
  audit of the seal, independent of the chain.

## Live seal on testnet

The first QoreSeal seal is on-chain, created from the builder wallet
`qor1cycgckmh2vxcclsmxlh0ee2d3c996pkqdf6nty` (ML-DSA-87 key registered):

- Message: “Hello Q-Day — sealed with QoreSeal”
- Tx: [9E5664C8…DDC5E82](https://dashboard.qorechain.io/explorer/tx/9E5664C805A6782925094A50532B573F5513C6CE2B572E88B3F59AD79DDC5E82) (height 10429594)
- Verify it yourself: `node scripts/verify.mjs 9E5664C805A6782925094A50532B573F5513C6CE2B572E88B3F59AD79DDC5E82`
  → all 5 layers pass, ending in **SEAL VALID**. The record also lives in
  [`seals/`](seals/9E5664C805A6782925094A50532B573F5513C6CE2B572E88B3F59AD79DDC5E82.json).

## Run it

Prerequisites: Node.js ≥ 18.

```bash
npm install
npm run dev        # web app on http://localhost:5173
```

The web app talks to the public testnet endpoints
(`https://api-testnet.qore.host`, `https://evm-testnet.qore.host`) through the
Vite dev proxy configured in `.env`.

### Create a seal (CLI)

The CLI uses a dedicated testnet account whose mnemonic lives outside this
repo (see `scripts/setup-account.mjs`; fund the account from the QoreChain
dashboard faucet first):

```bash
node scripts/setup-account.mjs            # create/load account, show balance
node scripts/seal.mjs "Hello, Q-Day"      # register PQC key (once) + seal
node scripts/verify.mjs <txHash>          # verify all five layers
```

`seal.mjs` prints the transaction hash and writes a public seal record to
`seals/<txHash>.json`.

## Project layout

```
src/App.tsx            Web app: seal verifier + demo-account seal browser
scripts/setup-account.mjs  Create/load the project testnet account
scripts/seal.mjs       Register ML-DSA-87 key + send a hybrid-signed seal
scripts/verify.mjs     Five-layer seal verification (incl. local ML-DSA-87)
seals/                 Public seal records (message, hash, tx hash)
```

## Tech

- [`@qorechain/sdk`](https://www.npmjs.com/package/@qorechain/sdk) 0.14 —
  unified accounts, `ensurePqcRegistered`, hybrid `TxClient`, `pqcVerify`.
- React + Vite + TypeScript (scaffolded with `create-qorechain-dapp`,
  `fullstack-web` template).
- ML-DSA-87 / Dilithium-5 (FIPS 204) via `@qorechain/pqc`.

## Notes

- Testnet only. The demo account holds test QOR from the faucet; its keys are
  never committed to this repository.
- Messages are limited to 180 characters so the seal fits one memo.
