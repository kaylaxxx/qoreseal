// QoreSeal: seal a short message on QoreChain testnet (qorechain-diana)
// inside a HYBRID-signed transaction (secp256k1 + ML-DSA-87).
//
// Usage: node scripts/seal.mjs "your message"
//
// The seal is a 1-uqor self-send whose memo carries
//   QORESEAL1|<sha256(message)>|<message>
// signed with BOTH the classical key and the account's ML-DSA-87 key
// (registered on-chain first via ensurePqcRegistered). Anyone can later
// verify the seal with scripts/verify.mjs <txHash>.
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import {
  NETWORKS,
  TxClient,
  deriveUnifiedAccount,
  directSignerFromPrivateKey,
  ensurePqcRegistered,
  sha256Hex,
} from "@qorechain/sdk";

const message = process.argv[2];
if (!message) {
  console.error('Usage: node scripts/seal.mjs "your message"');
  process.exit(1);
}
if (message.length > 180) {
  console.error("Message too long (max 180 chars).");
  process.exit(1);
}

const wallet = JSON.parse(
  readFileSync(join(homedir(), "workspace", "qoreseal-keys", "wallet.json"), "utf8"),
);
const account = await deriveUnifiedAccount(wallet.mnemonic);
const net = NETWORKS.testnet;
const rest = net.endpoints.rest;

const signer = directSignerFromPrivateKey(account.privateKey);
const tx = await TxClient.connect({
  rpcEndpoint: net.endpoints.rpc,
  signer,
  pqcKeypair: account.pqc,
  rest,
});

// One-time bootstrap: register the ML-DSA-87 key on-chain (classical-signed).
const reg = await ensurePqcRegistered(tx, { pqcKeypair: account.pqc, rest });
console.log(
  reg.alreadyRegistered
    ? "PQC key already registered on-chain."
    : `PQC key registered in tx ${reg.txHash}`,
);

const hash = sha256Hex(new TextEncoder().encode(message));
const memo = `QORESEAL1|${hash}|${message}`;
const result = await tx.bankSend(
  account.cosmos,
  [{ denom: "uqor", amount: "1" }],
  { fee: "auto", memo },
);
if (result.code !== 0) {
  console.error("Seal tx failed:", result.code, result.rawLog ?? "");
  process.exit(1);
}
console.log("Sealed on-chain. tx hash:", result.transactionHash);

const record = {
  message,
  sha256: hash,
  txHash: result.transactionHash,
  from: account.cosmos,
  evm: account.evm,
  height: result.height ?? null,
  network: net.chainId,
  sealedAt: new Date().toISOString(),
};
const outDir = join(process.cwd(), "seals");
mkdirSync(outDir, { recursive: true });
const outFile = join(outDir, `${result.transactionHash}.json`);
writeFileSync(outFile, JSON.stringify(record, null, 2));
console.log("Seal record:", outFile);
