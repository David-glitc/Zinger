// @ts-nocheck
import { useCallback, useEffect, useRef, useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'

function money(n, digits = 2) {
  const v = Number(n || 0)
  return `${v < 0 ? '-' : ''}$${Math.abs(v).toFixed(digits)}`
}

function signedUsd(n) {
  const v = Number(n || 0)
  return `${v >= 0 ? '+' : '-'}$${Math.abs(v).toFixed(2)}`
}

const REGIMES = [
  { id: 'auto', label: 'Auto', hint: 'Governor picks' },
  { id: 'scalp', label: 'Scalp', hint: 'Chop / quick TP' },
  { id: 'trend-ride', label: 'Trend', hint: 'Ride momentum' },
  { id: 'arb-only', label: 'Arb', hint: 'CLOB gaps only' },
]

const ASSET_OPTS = ['BTC', 'ETH', 'SOL', 'XRP', 'DOGE']
const DURATION_OPTS = ['5m', '15m', '4h']

function ChipToggle({ label, on, onToggle }) {
  return (
    <Button
      type="button"
      size="sm"
      variant={on ? 'default' : 'outline'}
      className={cn('h-7 px-2 font-mono text-[0.65rem]', on && 'ring-1 ring-primary/40')}
      onClick={onToggle}
    >
      {label}
    </Button>
  )
}

function useLiveConfig(cfg, onSave) {
  const [draft, setDraft] = useState(cfg)
  const [status, setStatus] = useState('idle')
  const timer = useRef(null)
  const seq = useRef(0)

  useEffect(() => {
    if (status !== 'saving') setDraft(cfg)
  }, [cfg])

  const flush = useCallback((next) => {
    clearTimeout(timer.current)
    const id = ++seq.current
    setStatus('saving')
    timer.current = setTimeout(async () => {
      try {
        await onSave(next, { silent: true })
        if (seq.current === id) setStatus('saved')
      } catch {
        if (seq.current === id) setStatus('error')
      }
    }, 400)
  }, [onSave])

  const patch = (partial) => {
    setDraft((prev) => {
      const next = { ...prev, ...partial }
      flush(next)
      return next
    })
  }

  useEffect(() => () => clearTimeout(timer.current), [])

  return { draft, patch, status }
}

function RegimeRail({ governor, onSelect, busy }) {
  const active = governor?.manualLock || governor?.profile || 'auto'
  const isAuto = !governor?.manualLock
  return (
    <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4">
      {REGIMES.map((r) => {
        const selected = r.id === 'auto' ? isAuto : active === r.id
        return (
          <Button
            key={r.id}
            type="button"
            variant={selected ? 'default' : 'outline'}
            className={cn('h-auto flex-col gap-0.5 py-2.5', selected && 'ring-1 ring-primary/50')}
            disabled={busy}
            onClick={() => onSelect(r.id)}
          >
            <span className="text-xs font-bold">{r.label}</span>
            <span className="text-muted-foreground text-[0.6rem] font-normal">{r.hint}</span>
          </Button>
        )
      })}
    </div>
  )
}

function NumRow({ label, value, step, onChange }) {
  return (
    <label className="flex items-center justify-between gap-2 rounded border border-border/50 px-2 py-1.5">
      <span className="text-muted-foreground text-[0.65rem]">{label}</span>
      <Input
        type="number"
        step={step}
        className="h-7 w-24 font-mono text-xs"
        value={value ?? ''}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </label>
  )
}

export default function TunePage({ poly, onSave, onRefresh }) {
  const cfg = poly?.config || {}
  const governor = poly?.governor || {}
  const perf = governor.profilePerf || {}
  const [busy, setBusy] = useState(false)
  const { draft, patch, status } = useLiveConfig(cfg, onSave)

  const setRegime = async (id) => {
    setBusy(true)
    try {
      const body = id === 'auto' ? { auto: true } : { regime: id }
      const r = await fetch('/api/poly/governor/regime', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const d = await r.json()
      if (!r.ok || d.ok === false) throw new Error(d.error || 'Regime switch failed')
      toast.success(id === 'auto' ? 'Governor auto mode' : `Regime → ${id}`)
      await onRefresh?.()
    } catch (e) {
      toast.error(e.message)
    } finally {
      setBusy(false)
    }
  }

  const clearBreaker = async () => {
    setBusy(true)
    try {
      const r = await fetch('/api/poly/governor/clear-breaker', { method: 'POST' })
      const d = await r.json()
      if (!r.ok || d.ok === false) throw new Error(d.error || 'Failed')
      toast.success('Drawdown breaker cleared')
      await onRefresh?.()
    } catch (e) {
      toast.error(e.message)
    } finally {
      setBusy(false)
    }
  }

  const applyPreset = (name) => {
    if (name === 'arb') {
      patch({
        forceArbOnly: true,
        clobArbEnabled: true,
        arbOnlyUntilEdge: false,
        governorEnabled: true,
        arbDynamicGates: true,
        arbReverseEnabled: true,
        assets: ASSET_OPTS,
        enabledDurations: DURATION_OPTS,
        use15m: true,
        maxArbPackages: 12,
      })
      setRegime('arb-only')
    } else if (name === 'directional') {
      patch({ forceArbOnly: false, clobArbEnabled: true, arbOnlyUntilEdge: false, useSignals: true })
      setRegime('scalp')
    } else if (name === 'tight') {
      patch({ minPrice: 0.28, maxPrice: 0.34, minConfidence: 0.22, kellyFraction: 0.1, slPct: 14 })
    }
  }

  const toggleAsset = (sym) => {
    const cur = Array.isArray(draft.assets) ? draft.assets : ASSET_OPTS
    const next = cur.includes(sym) ? cur.filter((s) => s !== sym) : [...cur, sym]
    if (next.length === 0) return
    patch({ assets: ASSET_OPTS.filter((a) => next.includes(a)) })
  }

  const toggleDuration = (d) => {
    const cur = Array.isArray(draft.enabledDurations) ? draft.enabledDurations : ['5m']
    const next = cur.includes(d) ? cur.filter((x) => x !== d) : [...cur, d]
    if (next.length === 0) return
    patch({
      enabledDurations: DURATION_OPTS.filter((x) => next.includes(x)),
      use15m: next.includes('15m'),
    })
  }

  return (
    <div className="poly-panel poly-page flex flex-col gap-2 sm:gap-3">
      <div className="flex flex-wrap items-center gap-2 pb-1">
        <div className="flex-1">
          <h1 className="text-sm font-semibold tracking-tight">Tune</h1>
          <p className="text-muted-foreground text-[0.7rem]">
            Live config — changes save automatically. Regime applies profile knobs instantly.
          </p>
        </div>
        <Badge variant="outline" className="font-mono text-[0.65rem] uppercase">
          {status === 'saving' ? 'saving…' : status === 'saved' ? 'saved' : status === 'error' ? 'save err' : 'live'}
        </Badge>
      </div>

      <Card className="gap-0 border-border/60 bg-card/80 py-0 shadow-none">
        <CardHeader className="border-b border-border/50 px-3 py-2">
          <CardTitle className="text-sm">Trading regime</CardTitle>
          <CardDescription className="text-[0.7rem]">
            Active: <strong>{governor.profile || '—'}</strong>
            {governor.manualLock ? ' (pinned)' : ' (auto)'}
            {governor.drawdownBreakerActive && ' · ⛔ breaker'}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-2 p-2.5">
          <RegimeRail governor={governor} onSelect={setRegime} busy={busy} />
          {governor.drawdownBreakerActive && (
            <Button type="button" variant="outline" size="sm" disabled={busy} onClick={clearBreaker}>
              Clear drawdown breaker
            </Button>
          )}
          <div className="text-muted-foreground font-mono text-[0.6rem]">
            {(governor.lastResult?.reasons || []).slice(0, 2).join(' · ') || governor.reason || '—'}
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-3 gap-1.5">
        <Button type="button" variant="secondary" size="sm" onClick={() => applyPreset('arb')}>Arb focus</Button>
        <Button type="button" variant="secondary" size="sm" onClick={() => applyPreset('directional')}>Directional</Button>
        <Button type="button" variant="secondary" size="sm" onClick={() => applyPreset('tight')}>Tight 30¢</Button>
      </div>

      <Card className="gap-0 border-cyan-500/20 bg-card/80 py-0 shadow-none">
        <CardHeader className="border-b border-border/50 px-3 py-2">
          <CardTitle className="text-sm">Multi-asset arb</CardTitle>
          <CardDescription className="text-[0.7rem]">
            Universe + dynamic gates + S2 reverse. Desk reads live arbSurfaces from state.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-2.5 p-2.5">
          <div>
            <div className="text-muted-foreground mb-1 text-[0.6rem] uppercase tracking-wide">Assets</div>
            <div className="flex flex-wrap gap-1">
              {ASSET_OPTS.map((sym) => (
                <ChipToggle
                  key={sym}
                  label={sym}
                  on={(draft.assets || ASSET_OPTS).includes(sym)}
                  onToggle={() => toggleAsset(sym)}
                />
              ))}
            </div>
          </div>
          <div>
            <div className="text-muted-foreground mb-1 text-[0.6rem] uppercase tracking-wide">Windows</div>
            <div className="flex flex-wrap gap-1">
              {DURATION_OPTS.map((d) => (
                <ChipToggle
                  key={d}
                  label={d}
                  on={(draft.enabledDurations || ['5m']).includes(d)}
                  onToggle={() => toggleDuration(d)}
                />
              ))}
            </div>
          </div>
          <div className="grid gap-1.5 sm:grid-cols-2">
            {[
              { label: 'Dynamic gates', key: 'arbDynamicGates' },
              { label: 'S2 reverse (bid)', key: 'arbReverseEnabled' },
              { label: 'Instant CTF merge', key: 'instantCtfMerge' },
              { label: 'Force arb only', key: 'forceArbOnly' },
            ].map(({ label, key }) => (
              <div key={key} className="flex items-center justify-between gap-2 rounded border border-border/50 px-2 py-1.5 text-xs">
                <span>{label}</span>
                <Switch
                  checked={draft[key] !== false}
                  onCheckedChange={(v) => {
                    if (key === 'forceArbOnly') {
                      patch(v ? { forceArbOnly: true, clobArbEnabled: true } : { forceArbOnly: false })
                    } else {
                      patch({ [key]: v })
                    }
                  }}
                />
              </div>
            ))}
          </div>
          <div className="grid gap-1.5 sm:grid-cols-2">
            <NumRow label="Arb max USD" value={draft.arbMaxUsd} step="1" onChange={(v) => patch({ arbMaxUsd: v })} />
            <NumRow label="Max packages" value={draft.maxArbPackages} step="1" onChange={(v) => patch({ maxArbPackages: v })} />
            <NumRow label="Arb bankroll %" value={draft.arbBankrollFrac} step="0.01" onChange={(v) => patch({ arbBankrollFrac: v })} />
            <NumRow label="Min arb gap" value={draft.minArbGap} step="0.001" onChange={(v) => patch({ minArbGap: v })} />
            <NumRow label="Gap floor" value={draft.arbGapFloor} step="0.001" onChange={(v) => patch({ arbGapFloor: v })} />
            <NumRow label="Lock $ floor" value={draft.arbLockUsdFloor} step="0.05" onChange={(v) => patch({ arbLockUsdFloor: v })} />
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-2 lg:grid-cols-2">
        <Card className="gap-0 border-border/60 bg-card/80 py-0 shadow-none">
          <CardHeader className="border-b border-border/50 px-3 py-2">
            <CardTitle className="text-sm">Engines</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-2 p-2.5 text-xs">
            {[
              { label: 'Governor', key: 'governorEnabled', invert: false },
              { label: 'CLOB arb', key: 'clobArbEnabled', invert: false },
              { label: 'Arb until edge', key: 'arbOnlyUntilEdge', invert: true },
              { label: 'Use signals', key: 'useSignals', invert: false },
              { label: 'Kelly sizing', key: 'useKellySizing', invert: false },
            ].map(({ label, key, invert }) => (
              <div key={key} className="flex items-center justify-between gap-2">
                <span>{label}</span>
                <Switch
                  checked={invert ? !!draft[key] : draft[key] !== false}
                  onCheckedChange={(v) => patch({ [key]: v })}
                />
              </div>
            ))}
          </CardContent>
        </Card>

        <Card className="gap-0 border-border/60 bg-card/80 py-0 shadow-none">
          <CardHeader className="border-b border-border/50 px-3 py-2">
            <CardTitle className="text-sm">Sizing & band</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-1.5 p-2.5">
            <NumRow label="Min price" value={draft.minPrice} step="0.01" onChange={(v) => patch({ minPrice: v })} />
            <NumRow label="Max price" value={draft.maxPrice} step="0.01" onChange={(v) => patch({ maxPrice: v })} />
            <NumRow label="Min confidence" value={draft.minConfidence} step="0.01" onChange={(v) => patch({ minConfidence: v })} />
            <NumRow label="Kelly frac" value={draft.kellyFraction} step="0.01" onChange={(v) => patch({ kellyFraction: v })} />
            <NumRow label="Max open" value={draft.maxOpenPositions} step="1" onChange={(v) => patch({ maxOpenPositions: v })} />
          </CardContent>
        </Card>
      </div>

      <Card className="gap-0 border-border/60 bg-card/80 py-0 shadow-none">
        <CardHeader className="border-b border-border/50 px-3 py-2">
          <CardTitle className="text-sm">Regime performance</CardTitle>
          <CardDescription className="text-[0.7rem]">Closed trades tagged by governor profile</CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-2 p-2.5 sm:grid-cols-4">
          {['scalp', 'trend-ride', 'arb-only', 'unattributed'].map((key) => {
            const row = perf[key] || { trades: 0, pnl: 0, winRate: 0 }
            return (
              <div key={key} className="data-tile">
                <div className="lbl">{key}</div>
                <div className={cn('val text-xs', row.pnl >= 0 ? 'text-primary' : 'text-destructive')}>
                  {signedUsd(row.pnl)}
                </div>
                <div className="text-muted-foreground text-[0.6rem]">{row.trades}t · {row.winRate}% WR</div>
              </div>
            )
          })}
        </CardContent>
      </Card>

      {poly?.edgeGate && (
        <Card className="gap-0 border-amber-500/30 bg-amber-500/5 py-0 shadow-none">
          <CardContent className="p-2.5 text-xs">
            <strong>Edge gate:</strong> {poly.edgeGate.reason || '—'}
            {' · '}WR {(Number(poly.edgeGate.wr || 0) * 100).toFixed(0)}%
            {' · '}E {Number(poly.edgeGate.expectancy || 0).toFixed(3)}
          </CardContent>
        </Card>
      )}
    </div>
  )
}
