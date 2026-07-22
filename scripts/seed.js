import { loadOrCreateWallet } from '../src/lib/wallet.js';
import { createPublicClient, http, formatEther } from 'viem';
import { robinhood } from 'viem/chains';

const wallet = loadOrCreateWallet();

console.log('\n  ┌────────────────────────────────────────┐');
console.log('  │  ZINGER WALLET                         │');
console.log('  ├────────────────────────────────────────┤');
console.log(`  │  Address: ${wallet.address}`);
console.log(`  │  Chain:   Robinhood Chain (4663)`);
console.log(`  │  Network: mainnet`);
console.log('  └────────────────────────────────────────┘');
console.log(`\n  Key saved to: data/wallet.json`);

// Check balance
try {
  const client = createPublicClient({
    chain: robinhood,
    transport: http('https://rpc.mainnet.chain.robinhood.com'),
  });
  const balance = await client.getBalance({ address: wallet.address });
  console.log(`  Balance: ${formatEther(balance)} ETH\n`);

  if (balance === 0n) {
    console.log('  ⚠️  Wallet has no ETH. Bridge ETH to Robinhood Chain:');
    console.log('     https://robinhoodchain.blockscout.com/bridge\n');
  }
} catch (err) {
  console.log(`  RPC error: ${err.message}\n`);
}
