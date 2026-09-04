import { describe, expect, it, beforeEach } from 'vitest';
import {
  detectAndExecuteArbPackage,
  detectAndExecuteArbPackages,
  getArbPackageMetrics,
} from '../../src/polymarket/arbEngine.js';
import { saveAllPackages, resetPackages } from '../../src/polymarket/arbPersistence.js';

const deepBook = (upAsk, downAsk, size = 500) => ({
  up: { bestAsk: upAsk, asks: [{ price: upAsk, size, value: upAsk * size }] },
  down: { bestAsk: downAsk, asks: [{ price: downAsk, size, value: downAsk * size }] },
});

const fillOk = async (pending) => ({
  ok: true,
  position: { id: 'pos', shares: pending.plan.shares },
});

describe('Atomic Arb Engine', () => {
  beforeEach(() => {
    saveAllPackages([]);
  });

  it('detects valid orderbook gap and locks an ArbPackage', async () => {
    const market = {
      symbol: 'ETH',
      slug: 'eth-5m-test',
      conditionId: '0xeth5mtest',
      outcomes: ['Up', 'Down'],
      tokenIds: { up: 'token-up-1', down: 'token-down-1' },
      acceptingOrders: true,
    };

    const cfg = {
      clobArbEnabled: true,
      minArbGap: 0.015,
      maxArbPackages: 4,
      paperBankroll: 100,
      paperInitialDeposit: 100,
      arbBankrollFrac: 0.2,
      arbMaxUsd: 50,
      minPositionSize: 0.5,
      minArbPackageUsd: 0,
      mode: 'paper',
    };

    const pkg = await detectAndExecuteArbPackage({
      market,
      depth: deepBook(0.34, 0.62),
      prices: { up: 0.34, down: 0.62 },
      cfg,
      mode: 'paper',
      log: () => {},
      executeTrade: fillOk,
      adjustPaperCash: () => {},
      saveTrade: () => {},
      botState: { config: { maxConcurrentPerSlug: 1 }, positions: [] },
    });

    expect(pkg).not.toBeNull();
    expect(pkg?.status).toBe('LOCKED');
    expect(pkg?.symbol).toBe('ETH');
    expect(pkg?.totalCost).toBe(20);
    expect(pkg?.expectedPayout).toBe(20.83);
    expect(pkg?.lockedProfitUsd).toBe(0.16);
    expect(pkg?.feesEstUsd).toBeCloseTo(0.67, 2);
    expect(pkg!.expectedPayout - pkg!.totalCost - pkg!.feesEstUsd!).toBeCloseTo(pkg!.lockedProfitUsd, 2);
    expect(pkg?.legs.up.filled).toBe(true);
    expect(pkg?.legs.down.filled).toBe(true);
  });

  it('rejects arbitrage execution when ask sum exceeds 1 - minArbGap', async () => {
    const market = { symbol: 'BTC', slug: 'btc-5m-test', conditionId: '0xbtc5m', outcomes: ['Up', 'Down'], tokenIds: { up: 'u', down: 'd' } };
    const cfg = { clobArbEnabled: true, minArbGap: 0.015, maxArbPackages: 4, paperBankroll: 100, minArbPackageUsd: 0 };

    const pkg = await detectAndExecuteArbPackage({
      market,
      depth: deepBook(0.51, 0.50),
      prices: { up: 0.51, down: 0.50 },
      cfg,
      mode: 'paper',
      log: () => {},
      executeTrade: fillOk,
      adjustPaperCash: () => {},
      saveTrade: () => {},
      botState: { config: {}, positions: [] },
    });

    expect(pkg).toBeNull();
  });

  it('refuses arb without a real ask ladder', async () => {
    const market = {
      symbol: 'ETH', slug: 'eth-touch', conditionId: '0xtouch',
      outcomes: ['Up', 'Down'], tokenIds: { up: 'u', down: 'd' },
    };
    const cfg = { clobArbEnabled: true, minArbGap: 0.015, paperBankroll: 100, minArbPackageUsd: 0 };
    const pkg = await detectAndExecuteArbPackage({
      market,
      depth: { up: { bestAsk: 0.34 }, down: { bestAsk: 0.62 } },
      prices: { up: 0.34, down: 0.62 },
      cfg,
      mode: 'paper',
      log: () => {},
      executeTrade: fillOk,
      adjustPaperCash: () => {},
      saveTrade: () => {},
      botState: { config: {}, positions: [] },
    });
    expect(pkg).toBeNull();
  });

  it('locks arb on a complementary binary even when negRisk is false', async () => {
    const market = {
      symbol: 'ETH',
      slug: 'eth-updown-5m-1787012400',
      conditionId: '0x6e68da643a31',
      outcomes: ['Up', 'Down'],
      tokenIds: { up: 'token-up-1', down: 'token-down-1' },
      negRisk: false,
    };
    const cfg = {
      clobArbEnabled: true, minArbGap: 0.015, maxArbPackages: 4,
      paperBankroll: 100, paperInitialDeposit: 100, minArbPackageUsd: 0, mode: 'paper',
    };

    const pkg = await detectAndExecuteArbPackage({
      market, depth: deepBook(0.34, 0.62), prices: { up: 0.34, down: 0.62 }, cfg, mode: 'paper',
      log: () => {}, executeTrade: fillOk, adjustPaperCash: () => {}, saveTrade: () => {},
      botState: { config: {}, positions: [] },
    });

    expect(pkg?.status).toBe('LOCKED');
  });

  it.each([
    ['no conditionId', { outcomes: ['Up', 'Down'], tokenIds: { up: 'u', down: 'd' } }],
    ['more than two outcomes', { conditionId: '0xabc', outcomes: ['A', 'B', 'C'], tokenIds: { up: 'u', down: 'd' } }],
    ['a missing leg token', { conditionId: '0xabc', outcomes: ['Up', 'Down'], tokenIds: { up: 'u' } }],
    ['both legs sharing one token', { conditionId: '0xabc', outcomes: ['Up', 'Down'], tokenIds: { up: 'u', down: 'u' } }],
  ])('rejects arb execution on a market with %s', async (_label, marketShape) => {
    const market = { symbol: 'ETH', slug: 'eth-not-a-binary', ...marketShape };
    const cfg = { clobArbEnabled: true, minArbGap: 0.015, maxArbPackages: 4, paperBankroll: 100, minArbPackageUsd: 0, mode: 'paper' };

    const pkg = await detectAndExecuteArbPackage({
      market, depth: deepBook(0.34, 0.62), prices: { up: 0.34, down: 0.62 }, cfg, mode: 'paper',
      log: () => {}, executeTrade: fillOk, adjustPaperCash: () => {}, saveTrade: () => {},
      botState: { config: {}, positions: [] },
    });

    expect(pkg).toBeNull();
  });

  it('enforces maxArbPackages capacity limit', async () => {
    const market1 = { symbol: 'ETH', slug: 'eth-1', conditionId: '0xeth1', outcomes: ['Up', 'Down'], tokenIds: { up: 'u1', down: 'd1' } };
    const market2 = { symbol: 'ETH', slug: 'eth-2', conditionId: '0xeth2', outcomes: ['Up', 'Down'], tokenIds: { up: 'u2', down: 'd2' } };

    const cfg = {
      clobArbEnabled: true, minArbGap: 0.015, maxArbPackages: 1,
      paperBankroll: 100, paperInitialDeposit: 100, minArbPackageUsd: 0, mode: 'paper',
    };
    const depth = deepBook(0.34, 0.62);

    const pkg1 = await detectAndExecuteArbPackage({
      market: market1, depth, prices: { up: 0.34, down: 0.62 }, cfg, mode: 'paper',
      log: () => {}, executeTrade: fillOk, adjustPaperCash: () => {}, saveTrade: () => {},
      botState: { config: {}, positions: [] },
    });
    expect(pkg1?.status).toBe('LOCKED');

    const pkg2 = await detectAndExecuteArbPackage({
      market: market2, depth, prices: { up: 0.34, down: 0.62 }, cfg, mode: 'paper',
      log: () => {}, executeTrade: fillOk, adjustPaperCash: () => {}, saveTrade: () => {},
      botState: { config: {}, positions: [] },
    });
    expect(pkg2).toBeNull();
  });

  it('multi-fill loop locks up to maxArbPerSlug from residual depth', async () => {
    const market = {
      symbol: 'ETH',
      slug: 'eth-5m-same',
      conditionId: '0xethsame',
      outcomes: ['Up', 'Down'],
      tokenIds: { up: 'u', down: 'd' },
    };
    const cfg = {
      clobArbEnabled: true,
      minArbGap: 0.015,
      maxArbPackages: 6,
      maxArbPerSlug: 3,
      paperBankroll: 500,
      paperInitialDeposit: 500,
      arbMaxUsd: 50,
      arbBankrollFrac: 0.2,
      minArbPackageUsd: 0,
      mode: 'paper',
    };
    const botState = { config: { maxConcurrentPerSlug: 1 }, positions: [] };

    const pkgs = await detectAndExecuteArbPackages({
      market,
      depth: deepBook(0.34, 0.62, 2000),
      prices: { up: 0.34, down: 0.62 },
      cfg,
      mode: 'paper',
      log: () => {},
      executeTrade: fillOk,
      adjustPaperCash: () => {},
      saveTrade: () => {},
      botState,
    });
    expect(pkgs.length).toBe(3);
    expect(pkgs.every((p) => p.status === 'LOCKED')).toBe(true);

    const blocked = await detectAndExecuteArbPackage({
      market, depth: deepBook(0.34, 0.62, 2000), prices: { up: 0.34, down: 0.62 }, cfg, mode: 'paper',
      log: () => {}, executeTrade: fillOk, adjustPaperCash: () => {}, saveTrade: () => {},
      botState,
    });
    expect(blocked).toBeNull();
  });

  it('sizes leg 2 from leg 1 matched shares', async () => {
    const market = {
      symbol: 'ETH', slug: 'eth-parity', conditionId: '0xparity',
      outcomes: ['Up', 'Down'], tokenIds: { up: 'u', down: 'd' },
    };
    const cfg = {
      clobArbEnabled: true, minArbGap: 0.015, paperBankroll: 100, paperInitialDeposit: 100,
      arbMaxUsd: 50, arbBankrollFrac: 0.2, minArbPackageUsd: 0, mode: 'paper',
    };
    const plans = [];
    const executeTrade = async (pending) => {
      plans.push(pending.plan);
      if (pending.outcome === 'up') {
        return { ok: true, position: { shares: 10 } };
      }
      return { ok: true, position: { shares: pending.plan.shares } };
    };

    const pkg = await detectAndExecuteArbPackage({
      market, depth: deepBook(0.34, 0.62), prices: { up: 0.34, down: 0.62 }, cfg, mode: 'paper',
      log: () => {}, executeTrade, adjustPaperCash: () => {}, saveTrade: () => {},
      botState: { config: {}, positions: [] },
    });

    expect(pkg?.status).toBe('LOCKED');
    expect(plans[1].shares).toBe(10);
    expect(pkg?.shares).toBe(10);
  });

  it('computes package metrics correctly', () => {
    saveAllPackages([
      { packageId: 'p1', mode: 'paper', status: 'SETTLED', lockedProfitUsd: 0.83 },
      { packageId: 'p2', mode: 'paper', status: 'SETTLED', lockedProfitUsd: 1.20 },
      { packageId: 'p3', mode: 'paper', status: 'LOCKED', lockedProfitUsd: 0.50 },
    ] as any);

    const metrics = getArbPackageMetrics('paper');
    expect(metrics.totalPackages).toBe(3);
    expect(metrics.settledCount).toBe(2);
    expect(metrics.activeLocked).toBe(1);
    expect(metrics.winRatePct).toBe(100);
    expect(metrics.netProfitUsd).toBe(2.03);
  });

  it('passes valid numeric entryPrice in order plans to trade execution', async () => {
    const market = { symbol: 'ETH', slug: 'eth-plan-test', conditionId: '0xethplan', outcomes: ['Up', 'Down'], tokenIds: { up: 'u', down: 'd' } };
    const cfg = {
      clobArbEnabled: true, minArbGap: 0.015, paperBankroll: 100, paperInitialDeposit: 100,
      minArbPackageUsd: 0, mode: 'paper',
    };

    const capturedPlans: any[] = [];
    const interceptExecuteTrade = async (pending: any) => {
      capturedPlans.push(pending.plan);
      return { ok: true, position: { id: 'p1', shares: pending.plan.shares } };
    };

    await detectAndExecuteArbPackage({
      market, depth: deepBook(0.34, 0.62), prices: { up: 0.34, down: 0.62 }, cfg, mode: 'paper',
      log: () => {}, executeTrade: interceptExecuteTrade, adjustPaperCash: () => {}, saveTrade: () => {},
      botState: { config: {}, positions: [] },
    });

    expect(capturedPlans.length).toBe(2);
    for (const plan of capturedPlans) {
      expect(plan.entryPrice).toBeDefined();
      expect(typeof plan.entryPrice).toBe('number');
      expect(plan.entryPrice).toBeGreaterThan(0);
      expect(plan.packageId).toBeDefined();
      expect(plan.isArbLeg).toBe(true);
      expect(plan.exitMode).toBe('arb_capture');
      expect(plan.slPct).toBeUndefined();
      expect(plan.targetTp).toBeUndefined();
    }
  });

  it('paper-merges locked package immediately when both legs exist', async () => {
    const { captureArbPackage, evaluateSpreadCapture } = await import('../../src/polymarket/arbEngine.js');
    const pkg: any = {
      packageId: 'pkg-merge-test',
      symbol: 'BTC',
      slug: 'btc-merge',
      shares: 20,
      totalCost: 19.2,
      expectedPayout: 20,
      lockedProfitUsd: 0.55,
      feesEstUsd: 0.25,
      status: 'LOCKED',
      mode: 'paper',
      legs: { up: { tokenId: 'u' }, down: { tokenId: 'd' } },
    };
    saveAllPackages([pkg]);
    const botState = {
      positions: [
        { id: '1', packageId: 'pkg-merge-test', outcome: 'up', shares: 20, entryPrice: 0.48, entryFee: 0.12, mode: 'paper', symbol: 'BTC', closed: false },
        { id: '2', packageId: 'pkg-merge-test', outcome: 'down', shares: 20, entryPrice: 0.48, entryFee: 0.13, mode: 'paper', symbol: 'BTC', closed: false },
      ],
    };
    let cash = 0;
    const trades: any[] = [];
    const res = await captureArbPackage({
      pkg,
      mode: 'paper',
      cfg: { arbExitMode: 'merge' },
      botState,
      adjustPaperCash: (n) => { cash += n; },
      saveTrade: (t) => trades.push(t),
      prefer: 'merge',
    });
    expect(res.ok).toBe(true);
    expect(pkg.status).toBe('MERGED');
    expect(botState.positions.every((p) => p.closed)).toBe(true);
    expect(cash).toBeCloseTo(20, 1);
    expect(trades).toHaveLength(2);
    expect(trades[0].exitReason).toBe('arb_merge');

    const thin = evaluateSpreadCapture({
      pkg: { shares: 100, totalCost: 99.5, lockedProfitUsd: 0.3, feesEstUsd: 0.2 },
      bidUp: 0.49,
      bidDown: 0.49,
      minBidSum: 0.985,
      minCaptureFrac: 0.7,
    });
    expect(thin.ok).toBe(false);

    const fat = evaluateSpreadCapture({
      pkg: { shares: 100, totalCost: 96, lockedProfitUsd: 3.5, feesEstUsd: 0.5 },
      bidUp: 0.50,
      bidDown: 0.495,
      feeParams: { rate: 0, exponent: 1 },
      minBidSum: 0.985,
      minCaptureFrac: 0.7,
    });
    expect(fat.ok).toBe(true);
  });

  it('skips crumb packages below minArbLockedProfitUsd', async () => {
    const market = {
      symbol: 'ETH',
      slug: 'eth-crumb',
      conditionId: '0xcrumb',
      outcomes: ['Up', 'Down'],
      tokenIds: { up: 'u', down: 'd' },
    };
    const cfg = {
      clobArbEnabled: true,
      minArbGap: 0.005,
      arbMinMarginPct: 0.001,
      minArbLockedProfitUsd: 5,
      minArbPackageUsd: 0,
      paperBankroll: 500,
      paperInitialDeposit: 500,
      arbBankrollFrac: 0.5,
      arbMaxUsd: 200,
    };
    const pkg = await detectAndExecuteArbPackage({
      market,
      depth: deepBook(0.34, 0.62),
      prices: { up: 0.34, down: 0.62 },
      cfg,
      mode: 'paper',
      log: () => {},
      executeTrade: fillOk,
      adjustPaperCash: () => {},
      saveTrade: () => {},
      botState: { config: {}, positions: [] },
    });
    expect(pkg).toBeNull();
  });

  it('resets packages by mode cleanly (item 24)', () => {
    saveAllPackages([
      { packageId: 'paper-1', mode: 'paper', status: 'SETTLED', lockedProfitUsd: 1.0 },
      { packageId: 'paper-2', mode: 'paper', status: 'LOCKED', lockedProfitUsd: 0.5 },
      { packageId: 'live-1', mode: 'live', status: 'LOCKED', lockedProfitUsd: 0.8 },
    ] as any);

    const { removed } = resetPackages('paper');
    expect(removed).toBe(2);

    const paperMetrics = getArbPackageMetrics('paper');
    expect(paperMetrics.totalPackages).toBe(0);
    expect(paperMetrics.netProfitUsd).toBe(0);

    const liveMetrics = getArbPackageMetrics('live');
    expect(liveMetrics.totalPackages).toBe(1);
    expect(liveMetrics.activeLocked).toBe(1);

    const { removed: removedLive } = resetPackages('live');
    expect(removedLive).toBe(1);
    expect(getArbPackageMetrics('live').totalPackages).toBe(0);
  });
});
