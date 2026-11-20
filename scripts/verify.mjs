// QoreSeal verification: prove a seal is genuine and post-quantum.
//
// Usage: node scripts/verify.mjs <txHash>
//
// Layers checked, all from public chain data (no keys needed):
//  1. The tx exists on qorechain-diana and succeeded.
//  2. Its memo is a QORESEAL1 seal and sha256(message) matches the memo.
//  3. The tx body carries the PQCHybridSignature extension (algorithm 1 =
//     ML-DSA-87 / Dilithium-5) — i.e. it was hybrid-signed.
//  4. The ML-DSA-87 public key in the extension equals the key registered
//     on-chain for the sender account.
//  5. FULL local re-verification: the ML-DSA-87 signature is re-checked
//     locally against the exact sign-bytes framing reconstructed from the
//     raw transaction (body without extension + authInfo).
import { TxBody, TxRaw } from "cosmjs-types/cosmos/tx/v1beta1/tx";
import {
  NETWORKS,
  createClient,
  getTx,
  hybridSignBytes,
  pqcVerify,
  resolveSignBytesVersion,
  sha256Hex,
} from "@qorechain/sdk";

const txHash = process.argv[2];
if (!txHash) {
  console.error("Usage: node scripts/verify.mjs <txHash>");
  process.exit(1);
}
const net = NETWORKS.testnet;
const rest = net.endpoints.rest;
const client = createClient({ network: "testnet" });
const fail = (msg) => {
  console.log("FAIL:", msg);
  process.exit(1);
};

// --- tiny protobuf field reader for the PQCHybridSignature extension -------
function readFields(buf) {
  const fields = new Map();
  let i = 0;
  const varint = () => {
    let v = 0n;
    let s = 0n;
    for (;;) {
      const b = buf[i++];
      v |= BigInt(b & 0x7f) << s;
      if (!(b & 0x80)) return v;
      s += 7n;
    }
  };
  while (i < buf.length) {
    const tag = varint();
    const num = Number(tag >> 3n);
    const wire = Number(tag & 7n);
    if (wire === 0) fields.set(num, varint());
    else if (wire === 2) {
      const len = Number(varint());
      fields.set(num, buf.subarray(i, i + len));
      i += len;
    } else if (wire === 5) i += 4;
    else if (wire === 1) i += 8;
    else break;
  }
  return fields;
}

// --- 1. tx exists + succeeded ----------------------------------------------
const txRes = await getTx(client.rest, txHash).catch(() => null);
if (!txRes?.tx_response) fail("transaction not found");
const txr = txRes.tx_response;
if (String(txr.code) !== "0") fail(`transaction failed on-chain (code ${txr.code})`);
const body = txRes.tx.body;
const sender = body.messages?.[0]?.from_address;
console.log(`1. Tx ${txHash.slice(0, 16)}… confirmed at height ${txr.height}, code 0. From ${sender}`);

// --- 2. memo seal + message hash -------------------------------------------
const memo = body.memo ?? "";
const m = memo.match(/^QORESEAL1\|([0-9a-f]{64})\|([\s\S]*)$/);
if (!m) fail("memo is not a QORESEAL1 seal");
const [, memoHash, message] = m;
const recomputed = sha256Hex(new TextEncoder().encode(message)).replace(/^0x/, "");
if (recomputed !== memoHash) fail("message hash mismatch");
console.log(`2. Seal memo OK. Message: "${message}"  sha256=${memoHash.slice(0, 16)}…`);

// --- 3. hybrid extension present -------------------------------------------
// The REST JSON view names the type via "@type" and inlines the fields, so
// read the extension from the raw tx bytes (RPC) where it is a proper Any.
const rpcRes = await fetch(
  `${net.endpoints.rpc}/tx?hash=0x${txHash.toUpperCase()}`,
).then((r) => r.json());
const rawB64 = rpcRes?.result?.tx;
if (!rawB64) fail("raw tx bytes unavailable from RPC");
const raw = TxRaw.decode(Buffer.from(rawB64, "base64"));
const decodedBody = TxBody.decode(raw.bodyBytes);
const ext = (decodedBody.extensionOptions ?? []).find((o) =>
  (o.typeUrl ?? "").endsWith("PQCHybridSignature"),
);
if (!ext) fail("no PQCHybridSignature extension — tx was NOT hybrid-signed");
const fields = readFields(Buffer.from(ext.value));
const algorithmId = fields.get(1);
const pqcSignature = fields.get(2);
const extPublicKey = fields.get(3); // optional: most signers omit it
if (Number(algorithmId) !== 1 || !pqcSignature)
  fail("extension malformed (algorithm/signature missing)");
console.log(
  `3. Hybrid extension present: algorithm_id=${algorithmId} (ML-DSA-87), signature ${pqcSignature.length} bytes.`,
);

// --- 4. the signing key is the sender's registered on-chain key ------------
// The extension rarely embeds the pubkey; the authoritative copy is the
// ML-DSA-87 key registered on-chain for the sender account.
const account = await client.rest.getPqcAccount(sender).catch(() => null);
const registeredB64 = account?.account?.public_key ?? account?.public_key;
if (!registeredB64) fail("sender has no registered PQC key on-chain");
const pqcPublicKey = Buffer.from(registeredB64, "base64");
if (pqcPublicKey.length !== 2592)
  fail(`registered PQC key has unexpected length ${pqcPublicKey.length}`);
if (extPublicKey && !Buffer.from(extPublicKey).equals(pqcPublicKey))
  fail("extension pubkey does not match the sender's registered PQC key");
console.log(
  "4. Signing key is the sender's on-chain registered ML-DSA-87 key (2592 bytes).",
);

// --- 5. full local ML-DSA-87 re-verification --------------------------------
decodedBody.extensionOptions = [];
const b0 = TxBody.encode(decodedBody).finish();
const version = await resolveSignBytesVersion({ rest, chainId: net.chainId });
const framed = hybridSignBytes(version, net.chainId, b0, raw.authInfoBytes);
const ok = pqcVerify(pqcPublicKey, framed, pqcSignature);
if (!ok) fail(`ML-DSA-87 signature does NOT verify locally (sign-bytes ${version})`);
console.log(`5. ML-DSA-87 signature re-verified LOCALLY over the reconstructed sign-bytes (${version} framing).`);

console.log("\nSEAL VALID — classical + post-quantum signatures both check out.");
