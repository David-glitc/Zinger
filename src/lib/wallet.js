import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');
const WALLET_FILE = path.join(ROOT, 'data', 'wallet.json');

export function loadOrCreateWallet() {
  const existing = tryLoadWallet();
  if (existing) return existing;

  const privateKey = generatePrivateKey();
  const account = privateKeyToAccount(privateKey);

  const wallet = {
    address: account.address,
    privateKey,
    createdAt: new Date().toISOString(),
  };

  fs.writeFileSync(WALLET_FILE, JSON.stringify(wallet, null, 2));
  console.log(`\n🔐 Generated new wallet`);
  console.log(`   Address: ${wallet.address}`);
  console.log(`   Key saved to: ${WALLET_FILE}\n`);

  return wallet;
}

export function tryLoadWallet() {
  try {
    if (fs.existsSync(WALLET_FILE)) {
      return JSON.parse(fs.readFileSync(WALLET_FILE, 'utf-8'));
    }
  } catch {}
  return null;
}

export function getWallet() {
  const wallet = tryLoadWallet();
  if (!wallet) return loadOrCreateWallet();
  return wallet;
}
