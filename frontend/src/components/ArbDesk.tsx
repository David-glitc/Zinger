// @ts-nocheck
/**
 * Multi-asset arb desk — surfaces (S1 ask / S2 bid), packages, metrics.
 * Consumes poly.arbSurfaces + poly.arbMetrics + poly.packages from live state.
 */
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { cn } from '@/lib/utils'

function money(n, digits = 2) {
  const v = Number(n || 0)
  return `${v < 0 ? '-' : ''}$${Math.abs(v).toFixed(digits)}`
}

function pct(n, digits = 2) {
  if (n == null || !Number.isFinite(Number(n))) return '—'
  return `${(Number(n) * 100).toFixed(digits)}%`
}

const ASSET_ORDER = ['BTC', 'ETH', 'SOL', 'XRP', 'DOGE']

function SurfaceRow({ slug, row }) {
  const up = row.up || {}
  const dn = row.down || {}
  const gates = row.gates || {}
  const hot = row.s1 || row.s2 || row.bestStage === 'ask' || row.bestStage === 'bid'
  return (
    <div
      className={cn(
        'grid grid-cols-[auto_1fr_auto] items-center gap-2 rounded border px-2 py-1.5 font-mono text-[0.65rem]',
        hot ? 'border-cyan-500/40 bg-cyan-500/10' : 'border-border/50',
      )}
    >
      <div className="flex flex-col gap-0.5">
        <span className="font-semibold text-foreground">{row.symbol || slug?.split('-')[0]?.toUpperCase()}</span>
        <span className="text-muted-foreground text-[0.55rem]">{String(slug || '').replace(/^.+?-updown-/, '')}</span>
      </div>
      <div className="text-muted-foreground min-w-0 truncate">
        <div>
          UP {up.bid?.toFixed?.(3) ?? '—'}/{up.ask?.toFixed?.(3) ?? '—'}
          {' · '}
          DN {dn.bid?.toFixed?.(3) ?? '—'}/{dn.ask?.toFixed?.(3) ?? '—'}
        </div>
        <div>
          askGap {pct(row.askGap)} · bidPrem {pct(row.bidPremium)}
          {gates.phase ? ` · gate ${gates.phase}` : ''}
        </div>
      </div>
      <div className="flex flex-col items-end gap-0.5">
        {row.s1 ? <Badge className="h-5 border-cyan-500/40 bg-cyan-500/20 text-cyan-300">S1</Badge> : null}
        {row.s2 ? <Badge className="h-5 border-amber-500/40 bg-amber-500/20 text-amber-300">S2</Badge> : null}
        {!row.s1 && !row.s2 ? (
          <span className="text-muted-foreground text-[0.55rem]">{row.bestStage || 'flat'}</span>
        ) : null}
      </div>
    </div>
  )
}

export default function ArbDesk({ poly, compact = false }) {
  const surfaces = poly?.arbSurfaces || {}
  const metrics = poly?.arbMetrics || {}
  const packages = (poly?.packages || []).filter((p) => p.status === 'LOCKED' || p.status === 'PENDING_FILL')
  const cfg = poly?.config || {}
  const assets = cfg.assets || ASSET_ORDER
  const durs = cfg.enabledDurations || ['5m']

  const rows = Object.entries(surfaces)
    .map(([slug, row]) => ({ slug, row }))
    .sort((a, b) => {
      const ah = a.row.s1 || a.row.s2 ? 1 : 0
      const bh = b.row.s1 || b.row.s2 ? 1 : 0
      if (bh !== ah) return bh - ah
      return String(a.row.symbol).localeCompare(String(b.row.symbol))
    })

  const hotCount = rows.filter((r) => r.row.s1 || r.row.s2).length
  const shown = compact ? rows.slice(0, 8) : rows.slice(0, 24)

  return (
    <Card className="gap-0 border-cyan-500/20 bg-card/80 py-0 shadow-none">
      <CardHeader className="border-b border-border/50 px-3 py-2">
        <div className="flex flex-wrap items-center gap-2">
          <CardTitle className="text-base">Arb desk</CardTitle>
          <Badge variant="outline" className="font-mono text-[0.6rem]">
            {assets.join(' · ')}
          </Badge>
          <Badge variant="secondary" className="font-mono text-[0.6rem]">
            {durs.join(' / ')}
          </Badge>
          {cfg.arbDynamicGates !== false && (
            <Badge variant="outline" className="border-cyan-500/40 text-cyan-400 text-[0.6rem]">
              dynamic gates
            </Badge>
          )}
          {cfg.arbReverseEnabled !== false && (
            <Badge variant="outline" className="border-amber-500/40 text-amber-400 text-[0.6rem]">
              S2 reverse
            </Badge>
          )}
          <span className="text-muted-foreground ml-auto font-mono text-[0.65rem]">
            {hotCount} hot · {rows.length} books
          </span>
        </div>
        <CardDescription className="text-[0.7rem]">
          S1 = buy both asks (sum &lt; 1) · S2 = mint+sell both bids (sum &gt; 1) · exit {cfg.arbExitMode || 'merge'}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-2 p-2.5">
        <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4">
          <div className="data-tile">
            <div className="lbl">Pkg net</div>
            <div className={cn('val text-xs', Number(metrics.netProfitUsd || 0) >= 0 ? 'text-primary' : 'text-destructive')}>
              {money(metrics.netProfitUsd)}
            </div>
          </div>
          <div className="data-tile">
            <div className="lbl">Settled</div>
            <div className="val text-xs">
              {metrics.settledCount ?? 0}
              <span className="text-muted-foreground ml-1 text-[0.55rem]">WR {metrics.winRatePct ?? 0}%</span>
            </div>
          </div>
          <div className="data-tile">
            <div className="lbl">Locked</div>
            <div className="val text-xs">{metrics.activeLocked ?? packages.length}</div>
          </div>
          <div className="data-tile">
            <div className="lbl">Max pkgs</div>
            <div className="val text-xs">{cfg.maxArbPackages ?? '—'}</div>
          </div>
        </div>

        {packages.length > 0 && (
          <div className="flex flex-col gap-1">
            <div className="text-muted-foreground text-[0.6rem] uppercase tracking-wide">Open packages</div>
            {packages.slice(0, compact ? 3 : 8).map((p) => (
              <div
                key={p.packageId}
                className="flex items-center justify-between gap-2 rounded border border-cyan-500/30 bg-cyan-500/5 px-2 py-1 font-mono text-[0.65rem]"
              >
                <span>
                  {p.symbol} · {String(p.packageId).slice(-6)} · {p.status}
                </span>
                <span className="text-primary">lock {money(p.lockedProfitUsd)}</span>
              </div>
            ))}
          </div>
        )}

        <div className="flex flex-col gap-1">
          <div className="text-muted-foreground text-[0.6rem] uppercase tracking-wide">Book surfaces</div>
          {shown.length === 0 ? (
            <div className="text-muted-foreground rounded border border-dashed border-border/60 px-2 py-3 text-center text-xs">
              Waiting for CLOB depth on enabled assets…
            </div>
          ) : (
            shown.map(({ slug, row }) => <SurfaceRow key={slug} slug={slug} row={row} />)
          )}
        </div>
      </CardContent>
    </Card>
  )
}
