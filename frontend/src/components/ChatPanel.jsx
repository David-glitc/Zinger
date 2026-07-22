import { useState, useRef, useEffect, useMemo } from 'react'
import { Card, CardHeader, CardTitle, CardContent, CardFooter } from '@/components/ui/card'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { cn } from '@/lib/utils'
import { fmtTimeMs } from '@/polyTimers'

function typeTone(type) {
  if (type === 'error' || type === 'sl' || type === 'sell') return 'text-destructive'
  if (type === 'buy' || type === 'tp' || type === 'announce') return 'text-[#a3e635]'
  if (type === 'signal' || type === 'system') return 'text-primary'
  return 'text-muted-foreground'
}

function typeBadge(type) {
  const t = (type || 'log').toUpperCase()
  if (type === 'buy' || type === 'tp') return 'bg-[#a3e635]/15 text-[#a3e635] border-[#a3e635]/30'
  if (type === 'sl' || type === 'error' || type === 'sell') return 'bg-destructive/15 text-destructive border-destructive/30'
  if (type === 'announce' || type === 'signal') return 'bg-primary/15 text-primary border-primary/30'
  return 'bg-muted text-muted-foreground border-border'
}

export default function ChatPanel({ actions, trades, positions, signals, poly }) {
  const [tab, setTab] = useState('log')
  const scrollRef = useRef(null)

  const feed = useMemo(() => {
    const fromActions = Array.isArray(actions) ? actions : []
    const fromExec = Array.isArray(poly?.executionLog) ? poly.executionLog : []
    const merged = [...fromActions]
    const seen = new Set(fromActions.map((a) => `${a.time}|${a.msg}`))
    for (const e of fromExec) {
      const key = `${e.time}|${e.msg}`
      if (seen.has(key)) continue
      seen.add(key)
      merged.push(e)
    }
    return merged
      .filter((a) => a && a.msg && a.type !== 'scan')
      .sort((a, b) => (b.time || 0) - (a.time || 0))
      .slice(0, 120)
  }, [actions, poly?.executionLog])

  useEffect(() => {
    // newest-first feed — keep pinned to top
    if (scrollRef.current) scrollRef.current.scrollTop = 0
  }, [feed.length, tab])

  const openPositions = (positions || []).filter((p) => !p.closed)
  const doneTrades = (trades || []).slice(0, 30)

  return (
    <Card className="h-full border-border/60 bg-card/80 backdrop-blur-sm">
      <CardHeader className="border-border/60 flex flex-row items-center gap-2 border-b px-3 py-2">
        <CardTitle className="text-muted-foreground text-xs font-semibold tracking-wider uppercase">
          Action log
        </CardTitle>
        <Badge variant="outline" className="font-mono text-[0.45rem]">
          {feed.length}
        </Badge>
        <div className="ml-auto flex gap-1">
          {['log', 'trades', 'open', 'signals'].map((t) => (
            <button
              key={t}
              className={cn(
                'rounded px-2 py-0.5 text-[0.55rem] font-medium transition-colors',
                tab === t
                  ? 'bg-primary/15 text-primary'
                  : 'text-muted-foreground hover:text-foreground',
              )}
              onClick={() => setTab(t)}
            >
              {t.toUpperCase()}
            </button>
          ))}
        </div>
      </CardHeader>
      <CardContent className="p-0">
        <ScrollArea className="h-[min(55dvh,480px)]" ref={scrollRef}>
          {tab === 'log' && (
            <div className="space-y-0.5 p-1.5">
              {feed.length === 0 ? (
                <div className="text-muted-foreground py-8 text-center text-[0.6rem]">
                  Waiting for scans / fills — markets still refresh while stopped
                </div>
              ) : (
                feed.map((a, i) => (
                  <div
                    key={`${a.time}-${i}`}
                    className="hover:bg-muted/40 flex gap-2 rounded border border-transparent px-1.5 py-1 text-[0.65rem] leading-snug"
                  >
                    <span className="text-muted-foreground w-[72px] shrink-0 font-mono text-[0.5rem] opacity-70">
                      {fmtTimeMs(a.time)}
                    </span>
                    <Badge
                      variant="outline"
                      className={cn('h-4 shrink-0 px-1 py-0 text-[0.4rem]', typeBadge(a.type))}
                    >
                      {(a.type || 'log').toUpperCase()}
                    </Badge>
                    <span className={cn('min-w-0 flex-1 break-words', typeTone(a.type))}>{a.msg}</span>
                  </div>
                ))
              )}
            </div>
          )}
          {tab === 'trades' && (
            <div className="space-y-1 p-1.5">
              {doneTrades.length === 0 ? (
                <div className="text-muted-foreground py-8 text-center text-[0.6rem]">No trades yet</div>
              ) : (
                doneTrades.map((t, i) => (
                  <div
                    key={i}
                    className="hover:bg-muted/40 rounded border border-border/50 px-2 py-1.5 text-[0.6rem]"
                  >
                    <div className="flex items-center gap-2">
                      <span className="font-semibold">{t.symbol}</span>
                      <Badge
                        variant={t.outcome === 'up' ? 'default' : 'secondary'}
                        className="px-1 py-0 text-[0.45rem]"
                      >
                        {t.outcome?.toUpperCase()}
                      </Badge>
                      <Badge
                        variant="outline"
                        className={cn(
                          'px-1 py-0 text-[0.4rem]',
                          t.mode === 'live'
                            ? 'border-[#a3e635]/40 bg-[#a3e635]/15 text-[#a3e635]'
                            : '',
                        )}
                      >
                        {t.mode}
                      </Badge>
                      <span
                        className={cn(
                          'ml-auto font-mono',
                          (t.pnl || 0) >= 0 ? 'text-[#a3e635]' : 'text-destructive',
                        )}
                      >
                        {(t.pnl || 0) >= 0 ? '+' : ''}
                        ${(t.pnl || 0).toFixed(2)}
                      </span>
                    </div>
                    <div className="text-muted-foreground mt-0.5 flex flex-wrap gap-2 font-mono text-[0.5rem]">
                      <span>
                        {t.entryPrice?.toFixed(3)} → {t.exitPrice?.toFixed(3)}
                      </span>
                      <span>{t.exitReason?.toUpperCase()}</span>
                      <span>{fmtTimeMs(t.timestamp || t.entryTime)}</span>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}
          {tab === 'open' && (
            <div className="space-y-1 p-1.5">
              {openPositions.length === 0 ? (
                <div className="text-muted-foreground py-8 text-center text-[0.6rem]">No open positions</div>
              ) : (
                openPositions.map((p, i) => (
                  <div key={i} className="rounded border border-border/50 px-2 py-1.5 text-[0.6rem]">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold">{p.symbol || (p.title || '').slice(0, 16)}</span>
                      <Badge className="px-1 py-0 text-[0.45rem]">
                        {(p.outcome || '').toString().toUpperCase()}
                      </Badge>
                      <span
                        className={cn(
                          'ml-auto font-mono',
                          (p.pnl || p.cashPnl || 0) >= 0 ? 'text-[#a3e635]' : 'text-destructive',
                        )}
                      >
                        {((p.pnl ?? p.cashPnl) || 0) >= 0 ? '+' : ''}$
                        {Number(p.pnl ?? p.cashPnl ?? 0).toFixed(2)}
                      </span>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}
          {tab === 'signals' && (
            <div className="space-y-1 p-1.5">
              {['btc', 'eth'].map((asset) => {
                const s = signals?.[asset] || poly?.intelligence?.[asset]
                const spot = poly?.spotPrices?.[asset]
                if (!s && !spot) {
                  return (
                    <div key={asset} className="text-muted-foreground px-1.5 py-2 text-[0.6rem]">
                      No signal for {asset.toUpperCase()}
                    </div>
                  )
                }
                return (
                  <div key={asset} className="rounded bg-muted/30 px-2 py-1.5 text-[0.6rem]">
                    <div className="mb-1 flex items-center gap-2">
                      <span className="font-semibold">{asset.toUpperCase()}</span>
                      {spot?.price != null && (
                        <span className="font-mono text-[#a3e635]">
                          ${Number(spot.price).toLocaleString(undefined, { maximumFractionDigits: 2 })}
                        </span>
                      )}
                      {spot?.changePct != null && (
                        <span
                          className={cn(
                            'font-mono text-[0.5rem]',
                            spot.changePct >= 0 ? 'text-[#a3e635]' : 'text-destructive',
                          )}
                        >
                          {spot.changePct >= 0 ? '+' : ''}
                          {Number(spot.changePct).toFixed(2)}%
                        </span>
                      )}
                      {s?.direction && (
                        <span
                          className={cn(
                            'ml-auto font-mono',
                            s.direction === 'up' ? 'text-[#a3e635]' : 'text-destructive',
                          )}
                        >
                          {s.direction?.toUpperCase()} {((s.confidence || 0) * 100).toFixed(0)}%
                        </span>
                      )}
                    </div>
                    {s && (
                      <div className="text-muted-foreground flex gap-3 text-[0.5rem]">
                        <span>RSI {s.rsi?.toFixed?.(0) ?? '—'}</span>
                        <span>Score {s.score != null ? (s.score > 0 ? '+' : '') + Number(s.score).toFixed(1) : '—'}</span>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </ScrollArea>
      </CardContent>
      <CardFooter className="border-border/60 border-t p-1.5">
        <div className="text-muted-foreground flex w-full items-center gap-2 text-[0.5rem]">
          <span
            className={cn(
              'inline-block size-1.5 rounded-full',
              poly?.running ? 'bg-[#a3e635] shadow-[0_0_6px_#a3e635]' : 'bg-muted-foreground',
            )}
          />
          <span className={poly?.running ? 'text-[#a3e635]' : ''}>
            {poly?.running ? 'LIVE' : 'STOPPED'}
          </span>
          <Separator orientation="vertical" className="h-3" />
          <span>CLOB ${poly?.readiness?.clobBalance?.toFixed?.(2) || '0.00'}</span>
          <Separator orientation="vertical" className="h-3" />
          <span>{openPositions.length} open</span>
        </div>
      </CardFooter>
    </Card>
  )
}
