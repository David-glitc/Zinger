import { useMemo } from 'react'
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import { fmtTimeMs } from '@/polyTimers'

function buildPath(points, key, xScale, yScale) {
  const usable = points.filter((p) => p[key] != null && Number.isFinite(p[key]))
  if (usable.length < 2) return ''
  return usable
    .map((p, i) => {
      const x = xScale(p.t)
      const y = yScale(p[key])
      return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`
    })
    .join(' ')
}

export default function ChartPanel({
  market,
  ticks = [],
  mlTrace = null,
  className,
}) {
  const series = useMemo(() => {
    const raw = Array.isArray(ticks) ? ticks : []
    return raw
      .filter((p) => p && (p.up != null || p.down != null))
      .slice(-240)
  }, [ticks])

  const { pathUp, pathDown, minY, maxY, last, w, h, pad } = useMemo(() => {
    const w = 640
    const h = 220
    const pad = { top: 16, right: 12, bottom: 24, left: 36 }
    if (series.length < 2) {
      return { pathUp: '', pathDown: '', minY: 0, maxY: 1, last: null, w, h, pad }
    }
    const t0 = series[0].t
    const t1 = series[series.length - 1].t || t0 + 1
    const vals = series.flatMap((p) => [p.up, p.down].filter((v) => v != null))
    let minY = Math.min(...vals, 0.01)
    let maxY = Math.max(...vals, 0.99)
    const span = Math.max(0.02, maxY - minY)
    minY = Math.max(0, minY - span * 0.08)
    maxY = Math.min(1, maxY + span * 0.08)
    const xScale = (t) => pad.left + ((t - t0) / (t1 - t0 || 1)) * (w - pad.left - pad.right)
    const yScale = (v) => pad.top + (1 - (v - minY) / (maxY - minY || 1)) * (h - pad.top - pad.bottom)
    return {
      pathUp: buildPath(series, 'up', xScale, yScale),
      pathDown: buildPath(series, 'down', xScale, yScale),
      minY,
      maxY,
      last: series[series.length - 1],
      w,
      h,
      pad,
      xScale,
      yScale,
      t0,
      t1,
    }
  }, [series])

  const label = market ? `${market.symbol} · ${(market.slug || '').slice(0, 28)}` : 'Price'

  const tracePoints = Array.isArray(mlTrace?.prices) ? mlTrace.prices : Array.isArray(mlTrace) ? mlTrace : []

  return (
    <Card className={cn('border-border/60 bg-card/80', className)}>
      <CardHeader className="flex flex-row items-start gap-2 border-b border-border/60 px-3 py-2">
        <div className="min-w-0 flex-1">
          <CardTitle className="text-muted-foreground text-[0.55rem] font-semibold tracking-wider uppercase">
            Chart
          </CardTitle>
          <CardDescription className="truncate font-mono text-[0.65rem] text-foreground">
            {label}
          </CardDescription>
        </div>
        <div className="flex flex-wrap justify-end gap-1">
          {last?.up != null && (
            <Badge variant="outline" className="font-mono text-[0.45rem] text-primary">
              UP {Number(last.up).toFixed(3)}
            </Badge>
          )}
          {last?.down != null && (
            <Badge variant="outline" className="font-mono text-[0.45rem] text-destructive">
              DN {Number(last.down).toFixed(3)}
            </Badge>
          )}
          {last?.t && (
            <Badge variant="secondary" className="font-mono text-[0.45rem]">
              {fmtTimeMs(last.t)}
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className="px-2 pb-2 pt-2">
        {series.length < 2 ? (
          <div className="text-muted-foreground flex h-[180px] items-center justify-center text-center text-[0.65rem]">
            Collecting ticks… start the bot or wait for scans
          </div>
        ) : (
          <svg viewBox={`0 0 ${w} ${h}`} className="h-[180px] w-full" role="img" aria-label="UP/DOWN mid chart">
            {/* grid */}
            {[0.25, 0.5, 0.75].map((f) => {
              const y = pad.top + f * (h - pad.top - pad.bottom)
              const val = maxY - f * (maxY - minY)
              return (
                <g key={f}>
                  <line
                    x1={pad.left}
                    x2={w - pad.right}
                    y1={y}
                    y2={y}
                    stroke="currentColor"
                    className="text-border"
                    strokeWidth="1"
                    opacity="0.5"
                  />
                  <text
                    x={pad.left - 4}
                    y={y + 3}
                    textAnchor="end"
                    className="fill-muted-foreground"
                    fontSize="9"
                    fontFamily="ui-monospace, monospace"
                  >
                    {val.toFixed(2)}
                  </text>
                </g>
              )
            })}
            {pathDown && (
              <path d={pathDown} fill="none" className="stroke-destructive" strokeWidth="1.6" />
            )}
            {pathUp && (
              <path d={pathUp} fill="none" className="stroke-primary" strokeWidth="1.8" />
            )}
            {/* ML horizon markers as dashed projection from last mid */}
            {last && tracePoints.length > 0 && (() => {
              const mid = last.up != null && last.down != null
                ? (last.up + (1 - last.down)) / 2
                : last.up ?? last.down
              if (mid == null) return null
              const yScale = (v) =>
                pad.top + (1 - (v - minY) / (maxY - minY || 1)) * (h - pad.top - pad.bottom)
              const x0 = w - pad.right - 8
              return tracePoints.slice(0, 4).map((pt, i) => {
                const dir = pt.direction === 'up' || pt.direction === 1 ? 1 : pt.direction === 'down' || pt.direction === -1 ? -1 : 0
                const proj = Math.min(0.99, Math.max(0.01, mid + dir * Math.abs(pt.expectedReturn || 0.01) * (i + 1)))
                const x = x0 - (tracePoints.length - i) * 14
                const y = yScale(proj)
                return (
                  <g key={i}>
                    <circle
                      cx={x}
                      cy={y}
                      r="3"
                      className={dir >= 0 ? 'fill-primary' : 'fill-destructive'}
                      opacity="0.85"
                    />
                    <text
                      x={x}
                      y={y - 6}
                      textAnchor="middle"
                      className="fill-muted-foreground"
                      fontSize="8"
                      fontFamily="ui-monospace, monospace"
                    >
                      {pt.label || `${pt.minutes || '?'}m`}
                    </text>
                  </g>
                )
              })
            })()}
            <text
              x={pad.left}
              y={h - 6}
              className="fill-muted-foreground"
              fontSize="9"
              fontFamily="ui-monospace, monospace"
            >
              {fmtTimeMs(series[0].t)}
            </text>
            <text
              x={w - pad.right}
              y={h - 6}
              textAnchor="end"
              className="fill-muted-foreground"
              fontSize="9"
              fontFamily="ui-monospace, monospace"
            >
              {fmtTimeMs(series[series.length - 1].t)}
            </text>
          </svg>
        )}
        <div className="text-muted-foreground mt-1 flex items-center gap-3 px-1 font-mono text-[0.5rem]">
          <span className="text-primary">━ UP</span>
          <span className="text-destructive">━ DOWN</span>
          <span>· {series.length} ticks</span>
          {tracePoints.length > 0 && <span>· ML trace {tracePoints.length} pts</span>}
        </div>
      </CardContent>
    </Card>
  )
}
