// @ts-nocheck
import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const DATA_DIR = path.join(ROOT, 'data');
const ASSETS_DIR = path.join(ROOT, 'assets');
const LAUNCHES_LOG = path.join(DATA_DIR, 'launches.json');

const OPENBID_PATH = process.env.OPENBID_PATH || '/tmp/openbid';
const OPENBID_CONFIG_DIR = path.join(OPENBID_PATH, 'src/helpers/configs/evm');

const PRIVATE_KEY = process.env.PRIVATE_KEY;
const DEV_ADDRESS = process.env.DEV_ADDRESS;

if (!PRIVATE_KEY) {
  console.error('ERROR: PRIVATE_KEY not set in .env');
  process.exit(1);
}
if (!DEV_ADDRESS) {
  console.error('ERROR: DEV_ADDRESS not set in .env');
  process.exit(1);
}

const LAUNCHES = [
  {
    id: 1,
    name: 'Zinger Test A',
    symbol: 'ZINGA',
    description: 'Experimental stress test launch A on Robinhood Chain via BasedBid. Testing 3% fee tier with dynamic fee multipliers.',
    feeTier: 3,
    liquidity: 1,
    buyback: 1,
    rewardAmount: 1,
    totalSupply: 1000000,
    marketCap: 10000,
  },
  {
    id: 2,
    name: 'Zinger Test B',
    symbol: 'ZINGB',
    description: 'Experimental stress test launch B on Robinhood Chain via BasedBid. Testing 4% fee tier with cooldown protection + tiered fees.',
    feeTier: 4,
    liquidity: 1,
    buyback: 1,
    rewardAmount: 1,
    customWalletPercent: 1,
    totalSupply: 500000,
    marketCap: 15000,
  },
  {
    id: 3,
    name: 'Zinger Test C',
    symbol: 'ZINGC',
    description: 'Experimental stress test launch C on Robinhood Chain via BasedBid. Testing 5% fee tier with max protections.',
    feeTier: 5,
    liquidity: 2,
    buyback: 1,
    rewardAmount: 1,
    customWalletPercent: 1,
    totalSupply: 2000000,
    marketCap: 20000,
  },
];

function loadLaunches() {
  try {
    if (fs.existsSync(LAUNCHES_LOG)) {
      return JSON.parse(fs.readFileSync(LAUNCHES_LOG, 'utf-8'));
    }
  } catch {}
  return [];
}

function saveLaunch(record) {
  const launches = loadLaunches();
  launches.push(record);
  fs.writeFileSync(LAUNCHES_LOG, JSON.stringify(launches, null, 2));
}

function generateConfig(launch) {
  const cfg = {
    isSandboxMode: false,
    chainId: 4663,
    initialBuySupplyPercent: 0,
    distributionWallets: [],
    distributionAmounts: [],
    token: {
      name: launch.name,
      symbol: launch.symbol,
      totalSupply: launch.totalSupply,
      initialBuyAmount: 0.001,
      metadata: {
        logo: './assets/placeholder.png',
        twitter: '',
        telegram: '',
        website: '',
        discord: '',
        description: launch.description,
      },
    },
    sale: {
      marketCap: launch.marketCap,
      maxTxAmountPercent: 0.1,
      protectBlocks: 20,
    },
    dex: {
      version: 'uniswap_v4',
      feeTier: launch.feeTier,
    },
    fees: {
      v4: {
        liquidity: launch.liquidity,
        buyback: launch.buyback,
        reward: {
          token: 'ETH',
          amount: launch.rewardAmount,
          minTokenBalanceForDividends: 0.01,
        },
        customWallets: launch.customWalletPercent
          ? [{
              name: 'dev',
              address: DEV_ADDRESS,
              percent: launch.customWalletPercent,
            }]
          : [],
        feeThreshold: 0.1,
        tieredFeesEnabled: true,
        dynamicFees: {
          hasHookDynamicFee: true,
          volatilityDecayPeriod: 'medium',
          volatilityMultiplier: 'high',
          volatilityTrigger: 'per_block',
        },
        cooldownProtection: {
          cooldownDuration: 'medium',
          penaltyFee: 'high',
        },
        buyLimits: {
          protectPeriod: 600,
          maxBuyPerOrigin: 5,
          isHookWhitelist: false,
        },
        mevProtectionEnabled: true,
      },
    },
  };

  const configFile = path.join(OPENBID_CONFIG_DIR, 'create-flash-token.json');
  fs.writeFileSync(configFile, JSON.stringify(cfg, null, 2));
  return configFile;
}

async function runLaunch(launch) {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`LAUNCH ${launch.id}/3: ${launch.name} (${launch.symbol})`);
  console.log(`Fee Tier: ${launch.feeTier}% | Supply: ${launch.totalSupply} | MCap: $${launch.marketCap}`);
  console.log(`${'='.repeat(60)}\n`);

  const configFile = generateConfig(launch);

  console.log(`Config written: ${configFile}`);

  const startTime = Date.now();

  try {
    const env = {
      ...process.env,
      SKIP_TX_CONFIRMATION: 'true',
    };

    const output = execSync('npm run evm:create-flash-token', {
      cwd: OPENBID_PATH,
      env,
      stdio: 'pipe',
      timeout: 120000,
    });

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    const stdout = output.toString();

    console.log(stdout);

    const txHashMatch = stdout.match(/0x[a-fA-F0-9]{64}/);
    const tokenAddrMatch = stdout.match(/address[:\s]+(0x[a-fA-F0-9]{40})/i);
    const contractAddrMatch = stdout.match(/contract[:\s]+(0x[a-fA-F0-9]{40})/i);
    const mintMatch = stdout.match(/mint[:\s]+(0x[a-fA-F0-9]{40})/i);
    const tokenAddress = mintMatch?.[1] || contractAddrMatch?.[1] || tokenAddrMatch?.[1] || 'unknown';
    const txHash = txHashMatch?.[0] || 'unknown';

    const record = {
      id: launch.id,
      name: launch.name,
      symbol: launch.symbol,
      feeTier: launch.feeTier,
      totalSupply: launch.totalSupply,
      marketCap: launch.marketCap,
      tokenAddress,
      txHash,
      elapsed,
      status: txHash !== 'unknown' ? 'success' : 'completed',
      timestamp: new Date().toISOString(),
    };

    saveLaunch(record);

    console.log(`\n✓ Launch ${launch.id} complete in ${elapsed}s`);
    console.log(`  Token: ${tokenAddress}`);
    console.log(`  TX:    ${txHash}`);

    return record;
  } catch (err) {
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    const errorMsg = err.stderr?.toString() || err.stdout?.toString() || err.message;

    console.error(`\n✗ Launch ${launch.id} FAILED after ${elapsed}s`);
    console.error(`  Error: ${errorMsg.substring(0, 500)}`);

    const record = {
      id: launch.id,
      name: launch.name,
      symbol: launch.symbol,
      feeTier: launch.feeTier,
      status: 'failed',
      error: errorMsg.substring(0, 500),
      elapsed,
      timestamp: new Date().toISOString(),
    };

    saveLaunch(record);
    return record;
  }
}

async function main() {
  console.log('╔══════════════════════════════════════════════╗');
  console.log('║   ZINGER AUTOMATION - Robinhood Chain        ║');
  console.log('║   BasedBid Flash Token × 3 Stress Test       ║');
  console.log('╚══════════════════════════════════════════════╝');
  console.log(`\nDev Address: ${DEV_ADDRESS}`);
  console.log(`OpenBid SDK: ${OPENBID_PATH}`);
  console.log(`Chain:       Robinhood (4663)`);
  console.log(`Time:        ${new Date().toISOString()}\n`);

  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }

  const results = [];
  for (const launch of LAUNCHES) {
    const result = await runLaunch(launch);
    results.push(result);
    if (result.status === 'failed') {
      console.log('\n⚠️  Launch failed. Continuing with next...\n');
    }
  }

  console.log('\n' + '='.repeat(60));
  console.log('SUMMARY');
  console.log('='.repeat(60));
  const successCount = results.filter(r => r.status === 'success').length;
  const failCount = results.filter(r => r.status === 'failed').length;
  console.log(`Total: ${results.length} | Success: ${successCount} | Failed: ${failCount}`);
  for (const r of results) {
    const icon = r.status === 'success' ? '✓' : r.status === 'failed' ? '✗' : '→';
    console.log(`  ${icon} ${r.symbol} (fee: ${r.feeTier}%) | ${r.tokenAddress || r.status} | ${r.elapsed}s`);
  }
  console.log('');
}

main().catch(console.error);
