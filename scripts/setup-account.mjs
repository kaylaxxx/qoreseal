// QoreSeal dev tooling: create (or load) the dedicated QoreChain TESTNET
// account for this project and print its public addresses + balance.
// The mnemonic lives ONLY in ~/workspace/qoreseal-keys/wallet.json (mode 600),
// outside the repo, and is never printed.
import { existsSync, readFileSync, writeFileSync, chmodSync, mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { generateMnemonic, deriveUnifiedAccount, createClient } from "@qorechain/sdk";

const KEY_DIR = join(homedir(), "workspace", "qoreseal-keys");
const WALLET_FILE = join(KEY_DIR, "wallet.json");

let mnemonic;
if (existsSync(WALLET_FILE)) {
  mnemonic = JSON.parse(readFileSync(WALLET_FILE, "utf8")).mnemonic;
  console.log("Loaded existing testnet account.");
} else {
  mnemonic = generateMnemonic(256);
  mkdirSync(KEY_DIR, { recursive: true });
  const account = await deriveUnifiedAccount(mnemonic);
  writeFileSync(
    WALLET_FILE,
    JSON.stringify(
      { mnemonic, cosmos: account.cosmos, evm: account.evm, created: new Date().toISOString() },
      null,
      2,
    ),
  );
  chmodSync(WALLET_FILE, 0o600);
  console.log("Created NEW testnet account, saved to", WALLET_FILE);
}

const account = await deriveUnifiedAccount(mnemonic);
console.log("cosmos (qor1…):", account.cosmos);
console.log("evm (0x…):     ", account.evm);

const client = createClient({ network: "testnet" });
const res = await client.rest.getAllBalances(account.cosmos);
console.log("balances:", JSON.stringify(res.balances));
