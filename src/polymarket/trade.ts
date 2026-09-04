// @ts-nocheck
import { ClobClient, AssetType, Side, SignatureTypeV2 } from '@polymarket/clob-client-v2';
import { createWalletClient, http } from 'viem';
import { polygon } from 'viem/chains';
import { privateKeyToAccount } from 'viem/accounts';
import { getWallet } from '../lib/wallet.js';
import { POLY } from './config.js';
import { installClobProxy, getClobProxyUrl } from './proxyEnv.js';
import { captureClobCall, captureReceipt } from './clobReceipts.js';

const CLOB_WRITE_RELAY = process.env.CLOB_PROXY_API_URL?.trim() || '';

installClobProxy();

function resolveWriteHost() {
  if (getClobProxyUrl()) return POLY.clobApi;
  if (CLOB_WRITE_RELAY) return CLOB_WRITE_RELAY;
  return POLY.clobApi;
}

const HOST = process.env.CLOB_API_URL?.trim() || POLY.clobApi;
const WRITE_HOST = resolveWriteHost();
const RPC = 'https://polygon-bor.publicnode.com';
const SHARE_SCALE = 1_000_000;

let _signer = null;
let _account = null;
let _creds = null;
let _client = null;
let _proxyCreds = null;
let _proxyClient = null;

function getAccount() {
  if (!_account) {
    const wallet = getWallet();
    _account = privateKeyToAccount(wallet.privateKey);
  }
  return _account;
}

function getSigner() {
  if (!_signer) {
    const account = getAccount();
    _signer = createWalletClient({ account, chain: polygon, transport: http(RPC, { timeout: 10000 }) });
  }
  return _signer;
}

function getDepositWalletAddress() {
  return getWallet().polymarketDepositWallet || null;
}

function getClientOptions() {
  const depositWallet = getDepositWalletAddress();
  if (!depositWallet) return {};
  return {
    signatureType: SignatureTypeV2.POLY_1271,
    funderAddress: depositWallet,
  };
}

function baseClient() {
  return new ClobClient({ host: HOST, chain: POLY.chainId, signer: getSigner(), ...getClientOptions() });
}

export async function ensureApiKey() {
  if (_creds) return _creds;
  const client = baseClient();
  _creds = await client.createOrDeriveApiKey();
  return _creds;
}

export async function getTradingClient() {
  if (_client) return _client;
  const creds = await ensureApiKey();
  _client = new ClobClient({ host: HOST, chain: POLY.chainId, signer: getSigner(), creds, ...getClientOptions() });
  return _client;
}

async function ensureProxyApiKey() {
  if (_proxyCreds) return _proxyCreds;
  const client = new ClobClient({ host: WRITE_HOST, chain: POLY.chainId, signer: getSigner(), ...getClientOptions() });
  _proxyCreds = await client.createOrDeriveApiKey();
  return _proxyCreds;
}

async function getProxyTradingClient() {
  if (_proxyClient) return _proxyClient;
  const creds = await ensureProxyApiKey();
  _proxyClient = new ClobClient({ host: WRITE_HOST, chain: POLY.chainId, signer: getSigner(), creds, ...getClientOptions() });
  return _proxyClient;
}

export function getWalletAddress() {
  return getAccount().address;
}

export function getFunderAddress() {
  return getDepositWalletAddress() || getWalletAddress();
}

function parseClobBalanceResult(result) {
  if (result?.error) {
    return { balance: 0, allowance: 0, raw: result, clobError: result.error };
  }
  const balance = Number(result.balance || 0) / 1_000_000;
  const allowances = Object.values(result.allowances || {}).map((value) => Number(value || 0) / 1_000_000);
  const allowance = allowances.length ? Math.max(...allowances) : 0;
  return { balance, allowance, raw: result, clobError: null };
}

export async function getClobBalance() {
  const client = await getTradingClient();
  const result = await client.getBalanceAllowance({ asset_type: AssetType.COLLATERAL });
  return parseClobBalanceResult(result);
}

export async function getOrders() {
  try {
    const client = await getTradingClient();
    const result = await client.getOpenOrders();
    return result?.data || result || [];
  } catch {
    return [];
  }
}

function roundPrice(price, tickSize = 0.01) {
  const t = Number(tickSize) || 0.01;
  const ticks = Math.round(Number(price) / t);
  return Math.min(0.99, Math.max(0.01, ticks * t));
}

function sharesForUsd(usd, price, minShares = 5) {
  const shares = Math.max(minShares, Math.ceil((Number(usd) / Number(price)) * 100) / 100);
  return Number(shares.toFixed(2));
}

function assertOrderAccepted(result, context) {
  const id = result?.orderID || result?.orderId || result?.id;
  const failed = result?.success === false || result?.error || result?.errorMsg;
  if (failed || !id) {
    const msg = result?.errorMsg || result?.error || (id ? 'order rejected' : 'no orderID in response');
    throw new Error(`${context}: ${String(msg).slice(0, 200)}`);
  }
  return id;
}

function resolveAgainstExpected(rawValue, expectedShares, tolerance) {
  const raw = Number(rawValue);
  if (!Number.isFinite(raw) || raw <= 0) return null;
  const fits = [raw, raw / SHARE_SCALE].filter((c) => Math.abs(c - expectedShares) <= tolerance);
  return fits.length === 1 ? fits[0] : null;
}

async function verifyFilledShares(result, expectedShares, tolerance) {
  const fromReceipt = resolveAgainstExpected(result?.takingAmount, expectedShares, tolerance);
  if (fromReceipt != null) return fromReceipt;

  try {
    const client = await getProxyTradingClient();
    const orderId = String(result?.orderID || result?.orderId || result?.id);
    const open = await captureClobCall(
      'verifyFilledShares/getOrder',
      { orderId, expectedShares, tolerance },
      () => client.getOrder(orderId),
    );
    return resolveAgainstExpected(open?.size_matched, expectedShares, tolerance);
  } catch {
    return null;
  }
}

export function readSellFill(result, requestedShares) {
  const maker = Number(result?.makingAmount);
  const taker = Number(result?.takingAmount);
  const none = { fillPrice: null, filledShares: null, proceedsUsd: null, fillSource: 'unavailable' };
  if (!(Number.isFinite(maker) && maker > 0 && Number.isFinite(taker) && taker > 0)) return none;

  const fillPrice = Math.round((taker / maker) * 1e6) / 1e6;
  if (!(fillPrice > 0) || fillPrice > 1) return { ...none, fillPrice: null, fillSource: 'implausible' };

  const want = Number(requestedShares);
  const tolerance = Math.max(0.05, Math.abs(want) * 0.02);
  const candidates = [maker, maker / SHARE_SCALE];
  const shares = candidates.find((c) => Number.isFinite(want) && want > 0 && Math.abs(c - want) <= tolerance) ?? null;

  return {
    fillPrice,
    filledShares: shares,
    proceedsUsd: shares == null ? null : Math.round(shares * fillPrice * 100) / 100,
    fillSource: 'receipt',
  };
}

export function sellFloor(mark, { tickSize = 0.01, slippagePct = 0.25 } = {}) {
  const tick = Number(tickSize) || 0.01;
  const m = Number(mark);
  if (!Number.isFinite(m) || m <= 0) return tick;
  const floor = m * (1 - Math.min(Math.max(Number(slippagePct) || 0, 0), 0.95));
  return Math.max(tick, Math.floor(floor / tick) * tick);
}

export async function placeOrder({ tokenId, side, amountUsd, price, negRisk = false, tickSize = '0.01', minShares = 5 }) {
  const client = await getProxyTradingClient();
  const px = roundPrice(price, Number(tickSize));
  const size = sharesForUsd(amountUsd, px, minShares);
  const orderSide = side === 'buy' ? Side.BUY : Side.SELL;

  const result = await captureClobCall(
    'placeOrder/createAndPostOrder',
    { tokenId: String(tokenId), side, price: px, size, tickSize, negRisk: !!negRisk, orderType: 'GTC' },
    () => client.createAndPostOrder(
      { tokenID: String(tokenId), price: px, size, side: orderSide },
      { tickSize: String(tickSize), negRisk: !!negRisk },
    ),
  );

  const id = assertOrderAccepted(result, `CLOB ${side} ${size}sh @ ${px}`);

  return {
    id,
    order: result,
    price: px,
    size,
    side: orderSide,
    status: result?.status || null,
  };
}

export async function placeMarketBuy({
  tokenId,
  amountUsd,
  maxPrice,
  negRisk = false,
  tickSize = '0.01',
  minShares = 5,
  shareTolerance = 0.05,
}) {
  if (!(Number(maxPrice) > 0)) {
    throw new Error('placeMarketBuy requires maxPrice — an unpriced market buy signs at $1.00/share');
  }
  const px = roundPrice(Number(maxPrice), Number(tickSize));
  const amount = Math.round(Math.max(Number(amountUsd) || 0, minShares * px) * 100) / 100;
  if (!(amount > 0)) throw new Error(`placeMarketBuy: non-positive amount $${amount}`);

  const expectedShares = Number((amount / px).toFixed(2));
  const tolerance = Math.max(Number(shareTolerance) || 0, expectedShares * 0.02);

  const client = await getProxyTradingClient();
  const result = await captureClobCall(
    'placeMarketBuy/createAndPostMarketOrder',
    {
      tokenId: String(tokenId), side: 'BUY', amountUsd: amount, maxPrice: px, tickSize,
      negRisk: !!negRisk, orderType: 'FOK', expectedShares,
    },
    () => client.createAndPostMarketOrder(
      { tokenID: String(tokenId), amount, price: px, side: Side.BUY },
      { tickSize: String(tickSize), negRisk: !!negRisk },
    ),
  );

  const id = assertOrderAccepted(result, `CLOB FOK buy $${amount} @<=${px}`);
  const shares = await verifyFilledShares(result, expectedShares, tolerance);

  captureReceipt({
    fn: 'placeMarketBuy/verified',
    phase: 'response',
    request: { tokenId: String(tokenId), amountUsd: amount, maxPrice: px, expectedShares, tolerance },
    raw: result,
    derived: {
      orderId: id,
      expectedShares,
      resolvedShares: shares,
      takingAmountRaw: result?.takingAmount ?? null,
      makingAmountRaw: result?.makingAmount ?? null,
      statusString: result?.status ?? null,
      verificationOutcome: shares == null ? 'UNVERIFIED_FILL' : 'verified',
    },
  });

  if (shares == null) {
    const err = new Error(
      `CLOB FOK buy ${id}: fill unverified (status=${result?.status ?? 'n/a'} `
      + `taking=${result?.takingAmount ?? 'n/a'} making=${result?.makingAmount ?? 'n/a'} expected≈${expectedShares}sh)`,
    );
    err.code = 'UNVERIFIED_FILL';
    err.orderId = id;
    err.tokenId = String(tokenId);
    err.expectedShares = expectedShares;
    throw err;
  }

  return {
    id,
    order: result,
    price: px,
    size: shares,
    expectedShares,
    costUsd: amount,
    side: Side.BUY,
    status: result?.status || null,
  };
}

export async function placeMarketSell({
  tokenId, shares, minPrice, markPrice, negRisk = false, tickSize = '0.01', slippagePct = 0.25,
}) {
  // Prefer explicit floor; else derive from mark; else minimum tick (legacy callers).
  const px = Number(minPrice) > 0
    ? roundPrice(Number(minPrice), Number(tickSize))
    : sellFloor(markPrice, { tickSize, slippagePct });

  const client = await getProxyTradingClient();
  const result = await captureClobCall(
    'placeMarketSell/createAndPostMarketOrder',
    { tokenId: String(tokenId), side: 'SELL', shares, minPrice: px, tickSize, negRisk: !!negRisk },
    () => client.createAndPostMarketOrder(
      { tokenID: String(tokenId), amount: shares, price: px, side: Side.SELL },
      { tickSize: String(tickSize), negRisk: !!negRisk },
    ),
  );
  const id = assertOrderAccepted(result, `CLOB market sell ${shares}sh @>=${px}`);
  const fill = readSellFill(result, shares);
  captureReceipt({
    fn: 'placeMarketSell/verified',
    phase: 'response',
    request: { tokenId: String(tokenId), shares, minPrice: px },
    raw: result,
    derived: { orderId: id, ...fill, floorPrice: px },
  });
  return {
    id,
    order: result,
    size: fill.filledShares ?? shares,
    fillPrice: fill.fillPrice,
    proceedsUsd: fill.proceedsUsd,
    status: result?.status || null,
  };
}

export async function cancelOrder(orderId) {
  try {
    const client = await getProxyTradingClient();
    await client.cancelOrder({ orderID: orderId });
    return true;
  } catch {
    return false;
  }
}

export const deriveApiKey = ensureApiKey;

export async function syncClobBalance() {
  const client = await getProxyTradingClient();
  await client.updateBalanceAllowance({ asset_type: AssetType.COLLATERAL });
  return getClobBalance();
}

export function resetTradingClient() {
  _creds = null;
  _client = null;
  _proxyCreds = null;
  _proxyClient = null;
}
