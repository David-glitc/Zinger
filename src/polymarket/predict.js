import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';

const ML_DIR = path.resolve(import.meta.dirname, '../../ml');
const VENV_PY = path.join(ML_DIR, '.venv/bin/python3');
// Host system python has numpy/torch; project venv is often empty.
const PYTHON = process.env.ZINGER_ML_PYTHON
  || (fs.existsSync('/usr/bin/python3') ? '/usr/bin/python3' : null)
  || (fs.existsSync(VENV_PY) ? VENV_PY : null)
  || 'python3';
const ML_TIMEOUT_MS = 55000;

function callQuickML(symbol, timeframe, horizon) {
  const code = `
import sys, json
sys.path.insert(0, ${JSON.stringify(ML_DIR)})
from predict import quick_ml_signal
result = quick_ml_signal(${JSON.stringify(symbol)}, ${JSON.stringify(timeframe)}, ${Number(horizon)})
print(json.dumps(result))
  `;

  return new Promise((resolve) => {
    let settled = false;
    const done = (value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(value);
    };

    const proc = spawn(PYTHON, ['-c', code], {
      stdio: ['ignore', 'pipe', 'pipe'],
      env: {
        ...process.env,
        OMP_NUM_THREADS: '2',
        MKL_NUM_THREADS: '2',
        OPENBLAS_NUM_THREADS: '2',
        PYTHONUNBUFFERED: '1',
      },
      cwd: ML_DIR,
    });

    let stdout = '';
    let stderr = '';
    proc.stdout.on('data', (d) => { stdout += d.toString(); });
    proc.stderr.on('data', (d) => { stderr += d.toString(); });

    const timer = setTimeout(() => {
      try { proc.kill('SIGKILL'); } catch {}
      done({ direction: 0, confidence: 0, error: 'timeout' });
    }, ML_TIMEOUT_MS);

    proc.on('error', (err) => {
      done({ direction: 0, confidence: 0, error: err.message });
    });

    proc.on('close', (code) => {
      if (code !== 0 || !stdout.trim()) {
        done({ direction: 0, confidence: 0, error: (stderr || 'no output').slice(0, 240) });
        return;
      }
      try {
        const lines = stdout.trim().split('\n').filter(Boolean);
        done(JSON.parse(lines[lines.length - 1]));
      } catch {
        done({ direction: 0, confidence: 0, error: 'parse error' });
      }
    });
  });
}

function horizonMinutes(timeframe, horizon) {
  const unit = timeframe === '1m' ? 1 : timeframe === '5m' ? 5 : 60;
  return unit * Number(horizon);
}

function normalizePoint(label, minutes, raw) {
  if (!raw || raw.error) return null;
  const direction = raw.direction === 1 || raw.direction === 'up'
    ? 'up'
    : raw.direction === -1 || raw.direction === 'down'
      ? 'down'
      : 'neutral';
  return {
    label,
    minutes,
    direction,
    confidence: Number(raw.confidence || 0),
    expectedReturn: Number(raw.expected_return || 0),
    model: raw.model,
    rawDirection: raw.direction,
  };
}

/** 30s–3m+ ladder: 5m h1 (~5m), 5m h3 (~15m), 1h h1 confirm — sequential to avoid GPU/CPU stampede */
export async function getMLTrace(symbol = 'BTC') {
  const near = await callQuickML(symbol, '5m', 1);
  const mid = await callQuickML(symbol, '5m', 3);
  const confirm = await callQuickML(symbol, '1h', 1);

  const priceTrace = [
    normalizePoint('5m', horizonMinutes('5m', 1), near),
    normalizePoint('15m', horizonMinutes('5m', 3), mid),
    normalizePoint('1h', horizonMinutes('1h', 1), confirm),
  ].filter(Boolean);

  const directional = priceTrace.filter((p) => p.direction !== 'neutral');
  const up = directional.filter((p) => p.direction === 'up').length;
  const down = directional.filter((p) => p.direction === 'down').length;
  const direction = directional.length === 0 ? 0 : up === down ? 0 : up > down ? 1 : -1;
  const confidence = priceTrace.length
    ? priceTrace.reduce((s, p) => s + p.confidence, 0) / priceTrace.length
    : 0;
  const expectedReturn = directional.length
    ? directional.reduce((s, p) => s + p.expectedReturn, 0) / directional.length
    : 0;

  return {
    direction,
    confidence,
    expected_return: expectedReturn,
    priceTrace,
    timestamp: Date.now(),
    error: priceTrace.length === 0
      ? (near?.error || mid?.error || confirm?.error || 'no trace')
      : undefined,
  };
}

export async function getMLSignal(symbol = 'BTC', timeframe = '1h', horizon = 1) {
  const result = await callQuickML(symbol, timeframe, horizon);
  result.timestamp = Date.now();
  return result;
}

export async function getMLSignalForBoth(timeframe = '1h', horizon = 1) {
  const [btc, eth] = await Promise.all([
    callQuickML('BTC', timeframe, horizon),
    callQuickML('ETH', timeframe, horizon),
  ]);
  return { btc, eth };
}

export async function getMLTraceForBoth() {
  // sequential assets — each runs 3 model passes
  const btc = await getMLTrace('BTC');
  const eth = await getMLTrace('ETH');
  return { btc, eth };
}

export function getMlPythonPath() {
  return PYTHON;
}
