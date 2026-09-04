// @ts-nocheck
import { useEffect, useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import { LiveTimeAgo } from '@/polyTimers'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { ScrollArea } from '@/components/ui/scroll-area'
import ArbDesk from '@/components/ArbDesk'

function money(n, digits = 2) {
  const v = Number(n || 0)
  return `${v < 0 ? '-' : ''}$${Math.abs(v).toFixed(digits)}`
}

function severityClass(sev) {
  if (sev === 'error') return 'border-destructive/50 bg-destructive/10 text-destructive'
  if (sev === 'warn') return 'border-amber-500/40 bg-amber-500/10 text-amber-400'
  if (sev === 'ok') return 'border-primary/30 bg-primary/5 text-primary'
  return 'border-border/60'
}

function StatusTile({ label, value, sub, tone }) {
  return (
    <div className="data-tile">
      <div className="lbl">{label}</div>
      <div className={cn('val text-xs', tone)}>{value}</div>
      {sub ? <div className="text-muted-foreground mt-0.5 text-[0.6rem]">{sub}</div> : null}
    </div>
  )
}

function CheckRow({ check }) {
  return (
    <div className="flex items-start justify-between gap-2 rounded border border-border/50 px-2 py-1.5 font-mono text-[0.65rem]">
      <span className={check.ok ? 'text-primary' : 'text-destructive'}>{check.id}</span>
      <span className="text-muted-foreground text-right">{check.detail}</span>
    </div>
  )
}

export default function ObservabilityPage({ poly }) {
  const [obs, setObs] = useState(null)
  const [err, setErr] = useState(null)

  useEffect(() => {
    let es
    let poll
    const load = async () => {
      try {
        const r = await fetch('/api/poly/observability?eventLimit=30')
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        setObs(await r.json())
        setErr(null)
      } catch (e) {
        setErr(e.message)
      }
    }
    load()
    try {
      es = new EventSource('/api/poly/observability/stream')
      es.onmessage = (ev) => {
        try { setObs(JSON.parse(ev.data)); setErr(null) } catch {}
      }
      es.onerror = () => {
        if (!poll) poll = setInterval(load, 5000)
      }
    } catch {
      poll = setInterval(load, 5000)
    }
    return () => {
      if (es) es.close()
      if (poll) clearInterval(poll)
    }
  }, [])

  const s = obs?.snapshot
  const alerts = obs?.alerts || []

  return (
    <div className="poly-panel poly-page flex flex-col gap-2 sm:gap-3">
      <div className="pb-1">
        <h1 className="text-sm font-semibold tracking-tight">Observability</h1>
        <p className="text-muted-foreground text-[0.7rem] leading-snug">
          Live session health, data gates, governor, orphans, and telemetry alerts.
        </p>
      </div>

      {err && (
        <Alert variant="destructive">
          <AlertTitle>Observer offline</AlertTitle>
          <AlertDescription>{err}</AlertDescription>
        </Alert>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <Badge
          variant="outline"
          className={cn(
            'uppercase',
            obs?.status === 'error' && 'border-destructive/50 text-destructive',
            obs?.status === 'warn' && 'border-amber-500/40 text-amber-400',
            obs?.status === 'ok' && 'border-primary/40 text-primary',
          )}
        >
          {obs?.status || '—'}
        </Badge>
        <Badge variant="outline">{obs?.canTrade ? 'can trade' : 'buy blocked'}</Badge>
        {s?.regime && <Badge variant="secondary">{s.regime}</Badge>}
        {s?.governorBreaker && <Badge variant="destructive">DD breaker</Badge>}
        {s?.lastScan && (
          <span className="text-muted-foreground ml-auto font-mono text-[0.65rem]">
            scan <LiveTimeAgo ts={s.lastScan} />
          </span>
        )}
      </div>

      <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4 sm:gap-2">
        <StatusTile label="Equity" value={money(s?.equity)} sub={`cash ${money(s?.cash)}`} />
        <StatusTile
          label="Session PnL"
          value={money(s?.sessionPnl)}
          sub={`${s?.sessionWins ?? 0}W / ${s?.sessionLosses ?? 0}L`}
          tone={Number(s?.sessionPnl) >= 0 ? 'text-primary' : 'text-destructive'}
        />
        <StatusTile label="Drawdown" value={`${s?.drawdownPct ?? 0}%`} sub={`peak ${money(s?.peakEquity)}`} />
        <StatusTile
          label="Open"
          value={`${s?.openPositions ?? 0}/${s?.maxOpenPositions ?? 4}`}
          sub={`arb pkg ${s?.openArbPackages ?? 0}/${s?.maxArbPackages ?? 4}`}
        />
      </div>

      {poly && <ArbDesk poly={poly} />}

      <div className="grid gap-2 lg:grid-cols-2">
        <Card className="gap-0 border-border/60 bg-card/80 py-0 shadow-none">
          <CardHeader className="border-b border-border/50 px-3 py-2">
            <CardTitle className="text-sm">Alerts</CardTitle>
            <CardDescription className="text-[0.7rem]">Actionable issues from gates and health checks</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-1.5 p-2.5">
            {alerts.length === 0 ? (
              <div className="text-muted-foreground py-4 text-center text-xs">Loading…</div>
            ) : (
              alerts.map((a) => (
                <div key={a.id} className={cn('rounded-lg border px-2.5 py-2', severityClass(a.severity))}>
                  <div className="text-xs font-semibold">{a.title}</div>
                  <div className="mt-0.5 text-[0.65rem] opacity-90">{a.detail}</div>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        <Card className="gap-0 border-border/60 bg-card/80 py-0 shadow-none">
          <CardHeader className="border-b border-border/50 px-3 py-2">
            <CardTitle className="text-sm">Data assurance</CardTitle>
            <CardDescription className="text-[0.7rem]">
              score {s?.dataAssurance?.score ?? '—'} · {s?.dataAssurance?.note || '—'}
            </CardDescription>
          </CardHeader>
          <CardContent className="p-2.5">
            <ScrollArea className="h-[220px]">
              <div className="flex flex-col gap-1 pr-2">
                {(s?.dataAssurance?.checks || []).map((c) => (
                  <CheckRow key={c.id} check={c} />
                ))}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-2 lg:grid-cols-2">
        <Card className="gap-0 border-border/60 bg-card/80 py-0 shadow-none">
          <CardHeader className="border-b border-border/50 px-3 py-2">
            <CardTitle className="text-sm">Signal & edge</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-2 p-2.5 font-mono text-[0.65rem]">
            <div>Signal: {s?.signalHealth?.status || '—'} · directional {s?.signalHealth?.directionalTrustworthy ? 'ok' : 'suspended'}</div>
            {(s?.signalHealth?.checks || []).map((c) => (
              <div key={c.id} className="text-muted-foreground">· [{c.status}] {c.message}</div>
            ))}
            {s?.edgeGate && (
              <div className="border-t border-border/40 pt-2">
                Edge gate: WR {(Number(s.edgeGate.wr || 0) * 100).toFixed(0)}% · E {(Number(s.edgeGate.expectancy || 0)).toFixed(3)}
                <div className="text-muted-foreground">{s.edgeGate.reason}</div>
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="gap-0 border-border/60 bg-card/80 py-0 shadow-none">
          <CardHeader className="border-b border-border/50 px-3 py-2">
            <CardTitle className="text-sm">Recent telemetry</CardTitle>
          </CardHeader>
          <CardContent className="p-2.5">
            <ScrollArea className="h-[180px]">
              <div className="flex flex-col gap-1 font-mono text-[0.6rem]">
                {(obs?.telemetry?.recent || []).slice().reverse().map((e) => (
                  <div key={e.id} className="text-muted-foreground border-b border-border/30 pb-1">
                    <span className="text-foreground">{e.type}</span>{' '}
                    <LiveTimeAgo ts={e.ts} /> · {JSON.stringify(e.data).slice(0, 120)}
                  </div>
                ))}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>
      </div>

      {(s?.orphans || []).length > 0 && (
        <Card className="gap-0 border-destructive/40 bg-destructive/5 py-0 shadow-none">
          <CardHeader className="border-b border-destructive/30 px-3 py-2">
            <CardTitle className="text-sm text-destructive">Orphan positions</CardTitle>
          </CardHeader>
          <CardContent className="p-2.5 font-mono text-[0.65rem]">
            {s.orphans.map((o) => (
              <div key={o.id}>{o.symbol} {o.outcome} · {o.slug} · ${Number(o.costBasis || 0).toFixed(2)}</div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  )
}
