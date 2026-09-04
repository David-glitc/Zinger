// @ts-nocheck
/**
 * Full-strategy historical backtest: Polymarket targets → synthetic CLOB →
 * directional + arb + governor regimes + fund reload + Bayesian loop.
 */
import { analyze } from '../signal.js';
import { applyAlphaFusion } from '../alphaFusion.js';
import { buildDecision, resolveOrderSize } from '../engines/directional.js';
import { buildDynamicPlan } from '../kelly.js';
import { evaluateArbOpportunity } from '../arbDepth.js';
import { openCostWithFee, closeProceedsWithFee, takerFeeUsdc } from '../fees.js';
import { detectRegime, REGIME_PROFILES } from '../../ai/governor.js';
import { classicPaperStrategy } from '../modeConfig.js';
import { simulateMarketBooks } from './bookSim.js';
import { forecastAboveStrike, volPerMinuteFromSignal } from '../strikeForecast.js';
import { bookQuality, estimateBuyCost } from '../bookMicrostructure.js';
import { candlesUpTo, candlesBetween, candleIndexAt } from './fetchHistory.js';
import {
  createBayesianState,
  recordTradeSample,
  recordArbSample,
  applyBayesianLoop,
  applyArbBayesianLoop,
} from './bayesian.js';

const WINDOW_5M = 300;
const SCAN_FRACS = [0.12, 0.35, 0.58];

function alignWindowStart(tSec) {
  return Math.floor(tSec / WINDOW_5M) * WINDOW_5M;
}

function mergeRegimeCfg(base, regime, { breakerActive = false } = {}) {
  const overlay = REGIME_PROFILES[regime] || {};
  let cfg = { ...base, ...overlay };
  if (breakerActive || regime === 'arb-only') {
    cfg.forceArbOnly = true;
    cfg.clobArbEnabled = true;
  }
  return cfg;
}

function mkMarket(asset, ws, strike) {
  return {
    symbol: asset,
    slug: `${asset.toLowerCase()}-updown-5m-${ws}`,
    duration: '5m',
    isCurrent: true,
    acceptingOrders: true,
    conditionId: `bt-${asset}-${ws}`,
    outcomes: ['Up', 'Down'],
    tokenIds: { up: `${asset}-up`, down: `${asset}-down` },
    priceToBeat: strike,
    windowStart: ws,
  };
}

function settleWindow(oneCandles, ws) {
  const path = candlesBetween(oneCandles, ws - 1, ws + WINDOW_5M);
  if (path.length < 2) return null;
  const o = path[0].open;
  const c = path[path.length - 1].close;
  return { open: o, close: c, upWon: c >= o };
}

function simulateDirectionalExit({
  cfg,
  plan,
  outcome,
  entryPrice,
  shares,
  oneCandles,
  entryT,
  ws,
  booksAtExit,
}) {
  const entryCost = openCostWithFee(shares, entryPrice, cfg.feeCategory || 'crypto').total;
  const tpPct = Number(plan.tpPct ?? 20);
  const slPct = Number(plan.slPct ?? 12);

  if (plan.holdToSettle) {
    const s = settleWindow(oneCandles, ws);
    if (!s) return { exitReason: 'orphan', gross: 0, fee: 0 };
    const won = (outcome === 'up') === s.upWon;
    if (won) {
      const gross = shares * 1 - entryCost;
      return { exitReason: 'settle_win', gross, fee: entryCost - shares * entryPrice };
    }
    return { exitReason: 'settle_loss', gross: -entryCost, fee: entryCost - shares * entryPrice };
  }

  const steps = candlesBetween(oneCandles, entryT, ws + WINDOW_5M);
  for (const c of steps) {
    const rem = ws + WINDOW_5M - c.time;
    const strike = oneCandles.find((x) => x.time >= ws)?.open ?? c.open;
    const book = simulateMarketBooks({
      spot: c.close,
      strike,
      secondsRemaining: rem,
      atrPct: 0.03,
    });
    const bid = outcome === 'up' ? book.depth.up.bestBid : book.depth.down.bestBid;
    if (bid >= entryPrice * (1 + tpPct / 100)) {
      const proceeds = closeProceedsWithFee(shares, bid, cfg.feeCategory || 'crypto', 'clob_sell');
      return {
        exitReason: 'tp',
        gross: proceeds.net - entryCost,
        fee: entryCost - shares * entryPrice + (proceeds.premium - proceeds.net),
        exitPrice: bid,
      };
    }
    if (bid <= entryPrice * (1 - slPct / 100)) {
      const proceeds = closeProceedsWithFee(shares, bid, cfg.feeCategory || 'crypto', 'clob_sell');
      return {
        exitReason: 'sl',
        gross: proceeds.net - entryCost,
        fee: entryCost - shares * entryPrice + (proceeds.premium - proceeds.net),
        exitPrice: bid,
      };
    }
  }

  const s = settleWindow(oneCandles, ws);
  if (!s) return { exitReason: 'orphan', gross: 0, fee: 0 };
  const won = (outcome === 'up') === s.upWon;
  if (won) {
    return { exitReason: 'settle_win', gross: shares - entryCost, fee: entryCost - shares * entryPrice };
  }
  return { exitReason: 'settle_loss', gross: -entryCost, fee: entryCost - shares * entryPrice };
}

function executeArbPaper({ cfg, opp, cash }) {
  const feeParams = cfg.feeCategory || 'crypto';
  const { shares, upAsk, downAsk, lockedProfitUsd, totalCost } = opp;
  const fees = takerFeeUsdc(shares, upAsk, feeParams) + takerFeeUsdc(shares, downAsk, feeParams);
  const cost = totalCost + fees;
  if (cost > cash) return null;
  return {
    shares,
    cost,
    lockedProfitUsd,
    netPnl: lockedProfitUsd,
  };
}

/**
 * Run the backtest.
 */
export async function runHistoricalBacktest({
  candlesByAsset = {},
  fusionCtx = {},
  baseCfg = null,
  bankroll = 10_000,
  reloadAmount = 10_000,
  startSec = null,
  endSec = null,
  assets = ['BTC', 'ETH'],
  bayesianEvery = 40,
  arbBayesianEvery = 25,
  onProgress = null,
} = {}) {
  const cfg0 = {
    mode: 'paper',
    ...classicPaperStrategy(),
    paperBankroll: bankroll,
    paperInitialDeposit: bankroll,
    ...(baseCfg || {}),
  };
  const arbOnlyFast = Boolean(cfg0.forceArbOnly && cfg0.clobArbEnabled !== false);

  let cash = bankroll;
  let peakEquity = bankroll;
  let breakerActive = false;
  let reloads = 0;
  let totalReloaded = 0;
  let cfg = { ...cfg0 };

  const trades = [];
  const arbPackages = [];
  const openPositions = [];
  const bayes = createBayesianState();
  const regimeCounts = { 'trend-ride': 0, scalp: 0, 'arb-only': 0 };
  const dbg = {
    windows: 0,
    scans: 0,
    arbHits: 0,
    dirHits: 0,
    skippedBand: 0,
    skippedConf: 0,
    skippedDecision: 0,
  };

  const allStarts = [];
  for (const asset of assets) {
    const sym = asset === 'BTC' ? 'BTCUSDT' : 'ETHUSDT';
    const one = candlesByAsset[sym]?.one || candlesByAsset[asset]?.one;
    if (!one?.length) continue;
    const t0 = startSec ?? one[0].time;
    const t1 = endSec ?? one[one.length - 1].time;
    for (let ws = alignWindowStart(t0); ws <= t1 - WINDOW_5M; ws += WINDOW_5M) {
      allStarts.push({ ws, asset, one });
    }
  }
  allStarts.sort((a, b) => a.ws - b.ws || a.asset.localeCompare(b.asset));

  const signals = {};
  let lastRegime = 'scalp';

  for (let wi = 0; wi < allStarts.length; wi++) {
    const { ws, asset, one } = allStarts[wi];
    dbg.windows++;

    if (onProgress && wi % 500 === 0) {
      onProgress({ wi, total: allStarts.length, cash, trades: trades.length, regime: lastRegime });
    }

  // Settle arb packages from prior windows
    for (let i = arbPackages.length - 1; i >= 0; i--) {
      const pkg = arbPackages[i];
      if (pkg.settleAt <= ws) {
        cash += pkg.shares;
        cash = Math.round(cash * 100) / 100;
        trades.push({
          asset: pkg.asset,
          method: 'arb',
          ts: pkg.settleAt,
          netPnl: pkg.lockedProfitUsd,
          gross: pkg.lockedProfitUsd,
          exitReason: 'arb_settle',
          regime: pkg.regime,
          confidence: 1,
          entryPrice: pkg.sum,
          arbGap: pkg.gap,
          arbSum: pkg.sum,
          duration: '5m',
        });
        recordArbSample(bayes, trades[trades.length - 1]);
        cfg = applyArbBayesianLoop(bayes, cfg, { every: arbBayesianEvery });
        arbPackages.splice(i, 1);
      }
    }

    // Close directional positions at window end
    for (let i = openPositions.length - 1; i >= 0; i--) {
      const pos = openPositions[i];
      if (pos.settleAt <= ws) {
        const res = simulateDirectionalExit({
          cfg: pos.cfg,
          plan: pos.plan,
          outcome: pos.outcome,
          entryPrice: pos.entryPrice,
          shares: pos.shares,
          oneCandles: pos.one,
          entryT: pos.entryT,
          ws: pos.ws,
        });
        cash += res.gross;
        cash = Math.round(cash * 100) / 100;
        const trade = {
          asset: pos.asset,
          method: 'directional',
          ts: pos.settleAt,
          outcome: pos.outcome,
          entryPrice: pos.entryPrice,
          shares: pos.shares,
          confidence: pos.confidence,
          netPnl: res.gross,
          gross: res.gross,
          exitReason: res.exitReason,
          regime: pos.regime,
          duration: '5m',
        };
        trades.push(trade);
        recordTradeSample(bayes, trade);
        cfg = applyBayesianLoop(bayes, cfg, { every: bayesianEvery });
        openPositions.splice(i, 1);
      }
    }

    // Fund reload
    if (cash <= 0) {
      reloads++;
      totalReloaded += reloadAmount;
      cash = reloadAmount;
      peakEquity = cash;
      breakerActive = false;
    }

    const strike = one.find((c) => c.time >= ws)?.open;
    if (!strike) continue;

    for (const frac of SCAN_FRACS) {
      dbg.scans++;
      const entryT = ws + Math.round(WINDOW_5M * frac);
      const remaining = ws + WINDOW_5M - entryT;
      if (remaining < 30) continue;

      const body = arbOnlyFast ? null : candlesUpTo(one, entryT);
      if (!arbOnlyFast && (!body || body.length < 55)) continue;

      let atrPct = 0.03;
      let sig = null;
      let spot;
      if (arbOnlyFast) {
        const idx = candleIndexAt(one, entryT);
        if (idx < 54) continue;
        spot = one[idx].close;
        const start = Math.max(0, idx - 19);
        const closes = [];
        for (let ci = start; ci <= idx; ci++) closes.push(one[ci].close);
        if (closes.length >= 5) {
          const rets = [];
          for (let ri = 1; ri < closes.length; ri++) {
            rets.push(Math.abs((closes[ri] - closes[ri - 1]) / closes[ri - 1]));
          }
          atrPct = (rets.reduce((a, b) => a + b, 0) / rets.length) * 100 * Math.sqrt(20);
        }
        lastRegime = 'arb-only';
        regimeCounts['arb-only'] = (regimeCounts['arb-only'] || 0) + 1;
      } else {
        const base = analyze(body, { funding: null });
        if (!base) continue;

        const isEth = asset === 'ETH';
        const ctx = { ...(fusionCtx[isEth ? 'eth' : 'btc'] || {}), isEth };
        sig = applyAlphaFusion(base, ctx);
        signals[asset.toLowerCase()] = base;

        const btcSig = signals.btc || (asset === 'BTC' ? base : null);
        const ethSig = signals.eth || (asset === 'ETH' ? base : null);
        const regimeDet = detectRegime({
          signals: { btc: btcSig, eth: ethSig },
        });
        lastRegime = regimeDet.regime;
        regimeCounts[lastRegime] = (regimeCounts[lastRegime] || 0) + 1;
        atrPct = base?.volatility?.atrPct ?? 0.03;
      }

      const equity = cash + openPositions.reduce((s, p) => s + p.sizeUsd, 0)
        + arbPackages.reduce((s, p) => s + p.cost, 0);
      if (equity > peakEquity) peakEquity = equity;
      const dd = peakEquity > 0 ? (peakEquity - equity) / peakEquity : 0;
      const breakerPct = Number(cfg0.governorDrawdownPct ?? 0.12);
      if (dd >= breakerPct) breakerActive = true;
      else if (breakerActive && dd < breakerPct * 0.3) breakerActive = false;

      cfg = mergeRegimeCfg(
        { ...cfg0, paperBankroll: cash },
        lastRegime,
        { breakerActive },
      );
      cfg.paperBankroll = cash;

      if (!arbOnlyFast) spot = body[body.length - 1].close;
      // 0..1 oscillation — triggers synthetic CLOB mispricing gaps in bookSim
      const mispriceSeed =
        ((Math.sin(ws / 47 + entryT / 7) + Math.sin(ws / 113 + asset.length)) / 2 + 1) / 2;
      const book = simulateMarketBooks({
        spot,
        strike,
        secondsRemaining: remaining,
        atrPct,
        mispriceSeed,
      });

      const market = mkMarket(asset, ws, strike);
      const depth = book.depth;
      const prices = book.prices;

      // Arb first (always when enabled)
      if (cfg.clobArbEnabled !== false) {
        const shareBudget = Math.min(
          cash * Number(cfg.arbBankrollFrac ?? 0.18),
          Number(cfg.arbMaxUsd ?? 100),
        );
        const opp = evaluateArbOpportunity({
          depth,
          prices,
          maxBudgetUsd: shareBudget,
          feeParams: cfg.feeCategory || 'crypto',
          marginPct: Number(cfg.arbMinMarginPct ?? 0.003),
          minGap: Number(cfg.minArbGap ?? 0.006),
        });
        if (opp && arbPackages.length < Number(cfg.maxArbPackages ?? 6)) {
          const exec = executeArbPaper({ cfg, opp, cash });
          if (exec) {
            cash -= exec.cost;
            arbPackages.push({
              asset,
              ws,
              settleAt: ws + WINDOW_5M,
              cost: exec.cost,
              shares: exec.shares,
              lockedProfitUsd: exec.lockedProfitUsd,
              sum: opp.upAsk + opp.downAsk,
              gap: opp.gap,
              regime: lastRegime,
            });
            dbg.arbHits++;
          }
        }
      }

      if (cfg.forceArbOnly) continue;

      const base = signals[asset.toLowerCase()] || analyze(body, { funding: null });
      if (!base) continue;
      if (false && cfg.requireTightSpread !== false && cfg.useBookMicrostructure !== false) {
        const qUp = bookQuality(depth.up);
        const qDown = bookQuality(depth.down);
        const arbGapQuick = depth.up?.bestAsk && depth.down?.bestAsk ? (1 - depth.up.bestAsk - depth.down.bestAsk) : 0;
        if (Math.max(qUp, qDown) < Number(cfg.bookQualityMin ?? 0.18) && arbGapQuick < Number(cfg.minArbGap ?? 0.012)) {
          continue;
        }
      }

      // Target-context veto — DISABLED for report baseline (new live filter, not in 6mo history)
      if (false && cfg.useStrikeForecast !== false) {
        const vol = volPerMinuteFromSignal(sig);
        const fc = vol ? forecastAboveStrike({ spot, strike, secondsRemaining: remaining, volPerMinute: vol, spotAgeMs: 0 }) : null;
        if (fc) {
          const z = fc.z;
          // coin-flip with no decisive geometry -> skip unless strong TA
          if (Math.abs(z) < 0.18 && sig.confidence < 0.28) { dbg.skippedConf++; continue; }
          if (remaining < 50 && Math.abs(z) > 1.2) { continue; }
          if (Math.abs(z) > 1.5) { continue; }
          // if forecast strongly opposes direction, skip
          const probSide = sig.direction === 'up' ? fc.probUp : fc.probDown;
          if (probSide < 0.18 && remaining < 90) { continue; }
        }
      }

      const dir = sig?.direction;
      if (dir !== 'up' && dir !== 'down') continue;
      const conf = Number(sig?.confidence ?? 0);
      if (conf < Number(cfg.minConfidence ?? 0.15)) {
        dbg.skippedConf++;
        continue;
      }

      const outcome = dir;
      const entryPrice = outcome === 'up' ? prices.upAsk : prices.downAsk;
      // hard absolute bounds only — dynamic entry inside buildDecision handles real gate
      const hardMin = Number(cfg.hardMinPrice ?? cfg.minPrice ?? 0.05);
      const hardMax = Number(cfg.hardMaxPrice ?? cfg.maxPrice ?? 0.95);
      if (entryPrice < hardMin || entryPrice > hardMax) {
        dbg.skippedBand++;
        continue;
      }
      if (cfg.requireTightSpread !== false) {
        const sideDepth = depth[outcome];
        const cost = estimateBuyCost(sideDepth?.asks || [], 6);
        if (cost && (cost.exhausted || cost.slippagePct > Number(cfg.liquiditySlippageMaxPct ?? 1.5))) {
          continue;
        }
      }

      if (openPositions.length >= Number(cfg.maxOpenPositions ?? 4)) continue;
      if (openPositions.some((p) => p.asset === asset && p.ws === ws)) continue;

      const wins = trades.filter((t) => t.method === 'directional' && (t.netPnl ?? 0) > 0).length;
      const totalDir = trades.filter((t) => t.method === 'directional').length;
      const stats = {
        wins,
        totalTrades: totalDir,
        up: trades.filter((t) => t.outcome === 'up').length,
        down: trades.filter((t) => t.outcome === 'down').length,
        total: trades.length,
      };
      stats.upShare = stats.total ? stats.up / stats.total : 0.5;

      const decision = buildDecision({
        cfg,
        market,
        outcome,
        price: entryPrice,
        remaining,
        signal: sig,
        existingPosition: null,
        readiness: { spendableBalance: cash },
        depth,
        prices,
        portfolio: {
          hasOpenOnSlug: false,
          sideBalance: stats,
          dataAssurance: { canBuy: true, blockBuys: false },
        },
      });

      if (!decision.eligible) {
        dbg.skippedDecision++;
        continue;
      }

      const sizing = resolveOrderSize(cfg, {
        price: entryPrice,
        signal: sig,
        readiness: { spendableBalance: cash },
        stats,
        remaining,
        windowSec: WINDOW_5M,
        duration: '5m',
        symbol: asset,
      });
      if (!sizing?.sizeUsd || sizing.sizeUsd <= 0) continue;
      if (cash < sizing.sizeUsd * 0.95) continue;

      const shares = Math.round((sizing.sizeUsd / entryPrice) * 1000) / 1000;
      if (!(shares > 0)) continue;

      const plan = buildDynamicPlan({ cfg, price: entryPrice, analysis: base, signal: sig });
      const entryCost = openCostWithFee(shares, entryPrice, cfg.feeCategory || 'crypto').total;
      cash -= entryCost;

      openPositions.push({
        asset,
        ws,
        settleAt: ws + WINDOW_5M,
        entryT,
        outcome,
        entryPrice,
        shares,
        sizeUsd: sizing.sizeUsd,
        confidence: conf,
        plan,
        cfg: { ...cfg },
        one,
        regime: lastRegime,
      });
      dbg.dirHits++;
    }
  }

  // Flush remaining positions at end
  for (const pos of openPositions) {
    const res = simulateDirectionalExit({
      cfg: pos.cfg,
      plan: pos.plan,
      outcome: pos.outcome,
      entryPrice: pos.entryPrice,
      shares: pos.shares,
      oneCandles: pos.one,
      entryT: pos.entryT,
      ws: pos.ws,
    });
    cash += res.gross;
    trades.push({
      asset: pos.asset,
      method: 'directional',
      ts: pos.settleAt,
      outcome: pos.outcome,
      entryPrice: pos.entryPrice,
      netPnl: res.gross,
      gross: res.gross,
      exitReason: res.exitReason,
      regime: pos.regime,
      confidence: pos.confidence,
      duration: '5m',
    });
    recordTradeSample(bayes, trades[trades.length - 1]);
  }
  for (const pkg of arbPackages) {
    cash += pkg.shares;
    trades.push({
      asset: pkg.asset,
      method: 'arb',
      ts: pkg.settleAt,
      netPnl: pkg.lockedProfitUsd,
      gross: pkg.lockedProfitUsd,
      exitReason: 'arb_settle',
      regime: pkg.regime,
      duration: '5m',
    });
    recordArbSample(bayes, trades[trades.length - 1]);
  }

  const dirTrades = trades.filter((t) => t.method === 'directional');
  const arbTrades = trades.filter((t) => t.method === 'arb');
  const totalPnl = trades.reduce((s, t) => s + (t.netPnl ?? t.gross ?? 0), 0);
  const wins = trades.filter((t) => (t.netPnl ?? t.gross ?? 0) > 0).length;

  return {
    bankroll0: bankroll,
    finalCash: Math.round(cash * 100) / 100,
    totalPnl: Math.round(totalPnl * 100) / 100,
    reloads,
    totalReloaded,
    tradeCount: trades.length,
    directionalCount: dirTrades.length,
    arbCount: arbTrades.length,
    winRate: trades.length ? wins / trades.length : 0,
    regimeCounts,
    bayesian: bayes,
    dbg,
    trades,
    cfgFinal: cfg,
  };
}
