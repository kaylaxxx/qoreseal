import { useMemo, useState } from "react";

import {
  createClient,
  getTx,
  sha256Hex,
  type QoreChainClient,
} from "@qorechain/sdk";

// Endpoints come from Vite env vars (VITE_-prefixed). In dev, REST goes
// through the Vite proxy (/lcd -> https://api-testnet.qore.host) because the
// public REST API sends no CORS headers.
const REST_URL = import.meta.env.VITE_QORE_REST_URL ?? "/lcd";
const EVM_RPC_URL =
  import.meta.env.VITE_QORE_EVM_RPC_URL ?? "https://evm-testnet.qore.host";

// The QoreSeal demo account on qorechain-diana (testnet only).
const DEMO_ACCOUNT = "qor1cycgckmh2vxcclsmxlh0ee2d3c996pkqdf6nty";

interface LayerResult {
  label: string;
  ok: boolean;
  detail: string;
}

interface SealInfo {
  message: string;
  hash: string;
  from: string;
  height: string;
}

function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

function bytesToBase64(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}

/** Minimal protobuf field reader for the PQCHybridSignature extension. */
function readFields(buf: Uint8Array): Map<number, bigint | Uint8Array> {
  const fields = new Map<number, bigint | Uint8Array>();
  let i = 0;
  const varint = (): bigint => {
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

export function App(): JSX.Element {
  const client: QoreChainClient = useMemo(
    () =>
      createClient({
        network: "testnet",
        endpoints: { rest: REST_URL, evmRpc: EVM_RPC_URL },
      }),
    [],
  );

  const [txHash, setTxHash] = useState("");
  const [layers, setLayers] = useState<LayerResult[] | null>(null);
  const [seal, setSeal] = useState<SealInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [accountTxs, setAccountTxs] = useState<
    Array<{ hash: string; height: string; memo: string }> | null
  >(null);

  async function verifySeal(): Promise<void> {
    setError(null);
    setLayers(null);
    setSeal(null);
    const hash = txHash.trim();
    if (!hash) {
      setError("Paste a transaction hash first.");
      return;
    }
    setLoading(true);
    const results: LayerResult[] = [];
    try {
      // Layer 1: tx exists and succeeded.
      const res: any = await getTx(client.rest, hash);
      const txr = res?.tx_response;
      if (!txr) throw new Error("Transaction not found on qorechain-diana.");
      const ok1 = String(txr.code) === "0";
      results.push({
        label: "Transaction confirmed on-chain",
        ok: ok1,
        detail: `height ${txr.height}, code ${txr.code}`,
      });
      if (!ok1) throw new Error("Transaction failed on-chain.");

      const body = res.tx.body;
      const from: string = body.messages?.[0]?.from_address ?? "";

      // Layer 2: seal memo + message hash.
      const memo: string = body.memo ?? "";
      const m = memo.match(/^QORESEAL1\|([0-9a-f]{64})\|([\s\S]*)$/);
      if (!m) throw new Error("Memo is not a QORESEAL1 seal.");
      const recomputed = sha256Hex(new TextEncoder().encode(m[2])).replace(/^0x/, "");
      const ok2 = recomputed === m[1];
      results.push({
        label: "Message hash matches the seal",
        ok: ok2,
        detail: `sha256("${m[2]}") = ${m[1].slice(0, 16)}…`,
      });
      if (!ok2) throw new Error("Message hash mismatch.");
      setSeal({ message: m[2], hash: m[1], from, height: String(txr.height) });

      // Layer 3: hybrid (PQCHybridSignature) extension present.
      // In REST JSON the extension is decoded inline: "@type", algorithm_id
      // and pqc_signature (base64). The pubkey is usually NOT embedded.
      const ext = (body.extension_options ?? []).find((o: any) =>
        String(o["@type"] ?? o.type_url ?? "").endsWith("PQCHybridSignature"),
      );
      if (!ext) throw new Error("No PQCHybridSignature extension — not hybrid-signed.");
      const algorithmId = Number(ext.algorithm_id ?? 0);
      const sig = ext.pqc_signature ? base64ToBytes(ext.pqc_signature) : undefined;
      const ok3 = algorithmId === 1 && sig?.length === 4627;
      results.push({
        label: "Hybrid signature extension (ML-DSA-87)",
        ok: ok3,
        detail: `algorithm_id=${algorithmId}, signature ${sig?.length} bytes`,
      });
      if (!ok3) throw new Error("Hybrid extension malformed.");

      // Layer 4: the sender has an ML-DSA-87 key registered on-chain (the
      // authoritative signing key; the full cryptographic re-verification
      // runs in scripts/verify.mjs).
      const account: any = await client.rest.getPqcAccount(from);
      const registeredB64: string | undefined =
        account?.account?.public_key ?? account?.public_key;
      const registered = registeredB64 ? base64ToBytes(registeredB64) : undefined;
      const extPub = ext.pqc_public_key ? base64ToBytes(ext.pqc_public_key) : undefined;
      const ok4 =
        registered?.length === 2592 &&
        (!extPub || bytesToBase64(extPub) === registeredB64);
      results.push({
        label: "Signer key is the registered on-chain PQC key",
        ok: Boolean(ok4),
        detail: ok4
          ? "ML-DSA-87 key (2592 bytes) registered for the sender in /qorechain/pqc/v1/account."
          : "Registered key not found or does not match.",
      });
      if (!ok4) throw new Error("PQC key binding check failed.");

      setLayers(results);
    } catch (err) {
      setLayers(results);
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  async function loadAccountSeals(): Promise<void> {
    setError(null);
    setLoading(true);
    try {
      const url = `${REST_URL}/cosmos/tx/v1beta1/txs?events=${encodeURIComponent(
        `message.sender='${DEMO_ACCOUNT}'`,
      )}&order_by=ORDER_BY_DESC&pagination.limit=20`;
      const res = await fetch(url).then((r) => r.json());
      const rows = (res.tx_responses ?? [])
        .filter((t: any) => (t.tx?.body?.memo ?? "").startsWith("QORESEAL1|"))
        .map((t: any) => ({
          hash: t.txhash as string,
          height: String(t.height),
          memo: t.tx.body.memo as string,
        }));
      setAccountTxs(rows);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <main
      style={{
        fontFamily: "system-ui, sans-serif",
        maxWidth: 760,
        margin: "2rem auto",
        padding: "0 1rem",
        lineHeight: 1.55,
        color: "#1a1a2e",
      }}
    >
      <h1 style={{ marginBottom: "0.25rem" }}>🔏 QoreSeal</h1>
      <p style={{ color: "#555", marginTop: 0 }}>
        Post-quantum message seals on <strong>QoreChain testnet</strong> (
        <code>{client.network.chainId}</code>). A seal is a short message carried
        in a transaction signed with <em>both</em> a classical secp256k1 key and
        an <strong>ML-DSA-87</strong> post-quantum key — so it stays verifiable
        even after quantum computers break classical signatures.
      </p>

      <section style={{ marginTop: "1.75rem" }}>
        <h2>Verify a seal</h2>
        <div style={{ display: "flex", gap: "0.5rem" }}>
          <input
            value={txHash}
            onChange={(e) => setTxHash(e.target.value)}
            placeholder="Transaction hash of a seal…"
            style={{ flex: 1, padding: "0.55rem", fontFamily: "monospace" }}
            aria-label="Seal transaction hash"
          />
          <button onClick={verifySeal} disabled={loading}>
            Verify
          </button>
        </div>

        {seal && (
          <div
            style={{
              background: "#eef7ee",
              border: "1px solid #b7dfb7",
              borderRadius: 6,
              padding: "0.75rem 1rem",
              marginTop: "1rem",
            }}
          >
            <div>
              Sealed message: <strong>“{seal.message}”</strong>
            </div>
            <div style={{ fontSize: "0.9em", color: "#444" }}>
              by {seal.from} · height {seal.height} · sha256 {seal.hash.slice(0, 16)}…
            </div>
          </div>
        )}
        {layers && (
          <ul style={{ listStyle: "none", paddingLeft: 0 }}>
            {layers.map((l) => (
              <li key={l.label} style={{ margin: "0.4rem 0" }}>
                {l.ok ? "✅" : "❌"} <strong>{l.label}</strong>
                <div style={{ color: "#555", fontSize: "0.9em" }}>{l.detail}</div>
              </li>
            ))}
          </ul>
        )}
        <p style={{ fontSize: "0.9em", color: "#555" }}>
          The CLI verifier (<code>scripts/verify.mjs</code>) adds a fifth layer:
          full local re-verification of the ML-DSA-87 signature over the exact
          sign-bytes reconstructed from the raw transaction.
        </p>
      </section>

      <section style={{ marginTop: "1.75rem" }}>
        <h2>Seals by the demo account</h2>
        <p style={{ fontSize: "0.95em" }}>
          Account <code>{DEMO_ACCOUNT}</code>{" "}
          <button onClick={loadAccountSeals} disabled={loading}>
            Load its seals
          </button>
        </p>
        {accountTxs && (
          <ul>
            {accountTxs.length === 0 && <li>(no seals yet)</li>}
            {accountTxs.map((t) => (
              <li key={t.hash} style={{ fontFamily: "monospace", fontSize: "0.85em" }}>
                <button
                  onClick={() => setTxHash(t.hash)}
                  style={{ fontFamily: "monospace" }}
                  title="Load into the verifier"
                >
                  {t.hash.slice(0, 20)}…
                </button>{" "}
                · height {t.height} · {t.memo.split("|")[2] ?? ""}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section style={{ marginTop: "1.75rem" }}>
        <h2>How sealing works</h2>
        <ol>
          <li>
            The account registers its ML-DSA-87 public key on-chain once (
            <code>MsgRegisterPQCKeyV2</code>).
          </li>
          <li>
            Sealing sends a 1-uqor self-transfer whose memo is{" "}
            <code>QORESEAL1|sha256(message)|message</code>, signed hybrid:
            secp256k1 over the final body + ML-DSA-87 over the framed
            sign-bytes, carried as a <code>PQCHybridSignature</code> extension.
          </li>
          <li>
            Anyone can verify the seal from public chain data — in this page, or
            with <code>node scripts/verify.mjs &lt;txHash&gt;</code>.
          </li>
        </ol>
        <p style={{ fontSize: "0.9em", color: "#555" }}>
          Create a seal from the CLI:{" "}
          <code>node scripts/seal.mjs "your message"</code> (uses the project's
          testnet account; see README).
        </p>
      </section>

      {error && (
        <p style={{ color: "#b00020", marginTop: "1rem" }} role="alert">
          {error}
        </p>
      )}
    </main>
  );
}
