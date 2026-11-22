# Changelog — QoreSeal

All notable work on QoreSeal, the Quantum Pass entry for the QoreChain
Developer Fest "Build Before Q-Day" (testnet `qorechain-diana`, EVM chain ID
9800). Built with `@qorechain/sdk` 0.14.0.

## 2026-11-20 — Day 1: scaffold, seal, verify

- Scaffolded the project from `create-qorechain-dapp` (`fullstack-web`
  template): React + Vite + TypeScript web app.
- Built the seal/verify CLI tooling (`scripts/setup-account.mjs`,
  `scripts/seal.mjs`, `scripts/verify.mjs`):
  - A seal is a 1-uqor self-transfer whose memo is
    `QORESEAL1|<sha256(message)>|<message>` (messages up to 180 characters).
  - Each seal is hybrid-signed: classical secp256k1 plus ML-DSA-87
    (Dilithium-5, FIPS 204), with the 4627-byte post-quantum signature carried
    in a `PQCHybridSignature` extension (algorithm 1).
  - The ML-DSA-87 public key (2592 bytes) is registered on-chain once per
    account via `ensurePqcRegistered`.
- Built the web app (`src/App.tsx`): in-browser seal verifier (4 layers) plus
  a demo-account seal browser.
- Pointed the demo account at the registered builder wallet
  `qor1cycgckmh2vxcclsmxlh0ee2d3c996pkqdf6nty` (ML-DSA-87 key verified
  on-chain; balance 99,055 QOR at account #17390).
- **First live seal, verified end-to-end:** message
  "Hello Q-Day — sealed with QoreSeal", tx
  `9E5664C805A6782925094A50532B573F5513C6CE2B572E88B3F59AD79DDC5E82`
  (height 10429594). The verifier was fixed for real dashboard transactions
  along the way (0x-prefixed `sha256Hex`, REST inline extension, public key
  from the registered account, RPC `GET tx`). Record kept in
  `seals/9E5664C805A6782925094A50532B573F5513C6CE2B572E88B3F59AD79DDC5E82.json`.

## 2026-11-21 — Day 2: demo script

- Added `DEMO.md`: the sub-3-minute demo video script (target 2 min 45 s) —
  open the app, show the live seal in the explorer, run
  `node scripts/verify.mjs …` to **SEAL VALID**, explain hybrid
  secp256k1 + ML-DSA-87.

## 2026-11-22 — Day 3: changelog and final pass

- Added this changelog.
- Re-read `README.md` against the current code and fixed the project-layout
  section (now lists `DEMO.md`, `CHANGELOG.md`, `.env.example`, and
  `vite.config.ts`). Commands, paths, endpoints, and numbers verified
  against the code: `npm run dev` serves on `http://localhost:5173`, the web
  app reaches the testnet REST API through the Vite dev proxy
  (`/lcd` → `QORE_REST_PROXY_TARGET`), message limit 180 characters, SDK
  `@qorechain/sdk` 0.14.0.
- Re-ran the full verification of the first live seal (2026-11-22):
  `node scripts/verify.mjs 9E5664C805A6782925094A50532B573F5513C6CE2B572E88B3F59AD79DDC5E82`
  → all 5 layers pass, ending in **SEAL VALID** (tx confirmed at height
  10429594, memo hash matches, `PQCHybridSignature` algorithm 1 present with
  a 4627-byte signature, signing key equals the sender's registered 2592-byte
  ML-DSA-87 key, signature re-verified locally over the reconstructed
  sign-bytes with v2 framing).
- Ran `npm run build` → passes (`tsc --noEmit && vite build`, 1945 modules
  transformed; only warnings: a Rollup comment annotation in
  `@scure/base` and the >500 kB chunk-size note for the 2.9 MB bundle).
- **Fest commit requirement complete:** 6 commits across 3 different days
  (4 on 2026-11-20, 1 on 2026-11-21, 1 on 2026-11-22).

## Features

- **Hybrid-signed seals** — secp256k1 + ML-DSA-87 on every seal transaction.
- **Five-layer seal verification (CLI)** — tx confirmed and succeeded; memo
  hash matches the message; `PQCHybridSignature` extension present;
  extension public key equals the sender's on-chain registered key; full
  local re-verification of the ML-DSA-87 signature over reconstructed
  sign-bytes.
- **Four-layer verification in the web app** — same as the CLI minus the
  local cryptographic re-verification, live against the testnet REST API.
- **Demo-account seal browser** — lists the seals of the builder wallet.
- **Public seal records** — every seal is saved as `seals/<txHash>.json`.

## How to verify

```bash
npm install
npm run build            # typecheck + production build
node scripts/verify.mjs 9E5664C805A6782925094A50532B573F5513C6CE2B572E88B3F59AD79DDC5E82
# → SEAL VALID
```

Or open the web app (`npm run dev`, http://localhost:5173), paste the same
transaction hash into the verifier, and check the four layers in the browser.
