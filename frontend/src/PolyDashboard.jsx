import { useEffect, useMemo, useState } from 'react'
import {
  Activity,
  ArrowLeft,
  History,
  LineChart,
  ListOrdered,
  Play,
  RefreshCw,
  Settings2,
  Square,
  Trash2,
  Wallet,
} from 'lucide-react'
import { toast } from 'sonner'
import { LiveCountdown, LiveClock, LiveTimeAgo, fmtTimeMs, POLY_POLL_MS } from './polyTimers'
import { cn } from '@/lib/utils'
import { useIsMobile } from '@/hooks/use-mobile'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Toaster } from '@/components/ui/sonner'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarSeparator,
  SidebarTrigger,
  useSidebar,
} from '@/components/ui/sidebar'
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldGroup,
  FieldLabel,
  FieldSet,
  FieldTitle,
} from '@/components/ui/field'
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty'
import ChatPanel from '@/components/ChatPanel'
import OrderBook from '@/components/OrderBook'
import ChartPanel from '@/components/ChartPanel'

function addr(a) {
  return a ? `${a.slice(0, 6)}…${a.slice(-4)}` : '—'
}

function money(n, digits = 2) {
  const v = Number(n || 0)
  return `${v < 0 ? '-' : ''}$${Math.abs(v).toFixed(digits)}`
}

function moneyCompact(n) {
  const v = Number(n || 0)
  const sign = v < 0 ? '-' : ''
  const a = Math.abs(v)
  if (a >= 1e6) return `${sign}$${(a / 1e6).toFixed(2)}M`
  if (a >= 1e3) return `${sign}$${(a / 1e3).toFixed(1)}k`
  return `${sign}$${a.toFixed(0)}`
}

function marketBook(m) {
  return m?.depth || m?.book || null
}

function spendableCash(readiness = {}, portfolio = {}) {
  const spend = readiness.spendableBalance
  if (spend != null && Number.isFinite(Number(spend))) return Number(spend)
  if (portfolio.cash != null && Number.isFinite(Number(portfolio.cash))) return Number(portfolio.cash)
  const deposit = readiness.depositPusd
  if (deposit != null && Number.isFinite(Number(deposit))) return Number(deposit)
  return Number(readiness.clobBalance || 0)
}

function ModeRail({ mode, onChange, disabled }) {
  const live = mode === 'live'
  return (
    <div className="mode-rail" role="group" aria-label="Trading mode">
      <button
        type="button"
        data-mode="paper"
        data-active={!live}
        disabled={disabled}
        onClick={() => onChange?.('paper')}
      >
        Paper
      </button>
      <button
        type="button"
        data-mode="live"
        data-active={live}
        disabled={disabled}
        onClick={() => onChange?.('live')}
      >
        Live
      </button>
    </div>
  )
}

function MarketDetailTiles({ market }) {
  if (!market) return null
  const book = marketBook(market)
  const up = book?.up
  const down = book?.down
  const tiles = [
    { lbl: 'Liquidity', val: moneyCompact(market.liquidity) },
    { lbl: 'Volume', val: moneyCompact(market.volume) },
    { lbl: 'Spread', val: market.spread != null ? money(market.spread, 3) : '—' },
    { lbl: 'Implied', val: market.impliedWinner || '—' },
    { lbl: 'UP bid', val: up?.bestBid != null ? money(up.bestBid, 3) : '—' },
    { lbl: 'UP ask', val: up?.bestAsk != null ? money(up.bestAsk, 3) : '—' },
    { lbl: 'DN bid', val: down?.bestBid != null ? money(down.bestBid, 3) : '—' },
    { lbl: 'DN ask', val: down?.bestAsk != null ? money(down.bestAsk, 3) : '—' },
    {
      lbl: 'UP imb',
      val: up?.imbalance != null ? `${(up.imbalance * 100).toFixed(0)}%` : '—',
    },
    {
      lbl: 'DN imb',
      val: down?.imbalance != null ? `${(down.imbalance * 100).toFixed(0)}%` : '—',
    },
    {
      lbl: 'Arb gap',
      val: book?.arbGap != null ? money(book.arbGap, 3) : '—',
    },
    {
      lbl: 'Orders',
      val: market.acceptingOrders === false ? 'closed' : 'open',
    },
  ]
  return (
    <div className="grid grid-cols-3 gap-1.5 sm:grid-cols-4 md:grid-cols-6">
      {tiles.map((t) => (
        <div key={t.lbl} className="data-tile">
          <div className="lbl">{t.lbl}</div>
          <div className="val text-xs sm:text-sm">{t.val}</div>
        </div>
      ))}
    </div>
  )
}

function usePolyState(intervalMs = POLY_POLL_MS) {
  const [state, setState] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    let active = true
    async function poll() {
      try {
        const data = await fetch('/api/poly/state').then((r) => r.json())
        if (active) {
          setState(data)
          setError(null)
        }
      } catch (err) {
        if (active) setError(err.message)
      }
    }
    poll()
    const id = setInterval(poll, intervalMs)
    return () => {
      active = false
      clearInterval(id)
    }
  }, [intervalMs])

  return { state, error }
}

function Kpi({ label, value, tone }) {
  return (
    <Card className="gap-0 border-border/60 bg-card/80 py-0 shadow-none">
      <CardHeader className="gap-0.5 px-2.5 py-2.5 sm:px-3 sm:py-3">
        <CardDescription className="text-[0.6rem] font-medium tracking-[0.08em] uppercase sm:text-[0.65rem]">
          {label}
        </CardDescription>
        <CardTitle
          className={cn(
            'font-mono text-base tabular-nums tracking-tight sm:text-xl',
            tone === 'up' && 'text-primary',
            tone === 'down' && 'text-destructive',
            tone === 'muted' && 'text-muted-foreground',
          )}
        >
          {value}
        </CardTitle>
      </CardHeader>
    </Card>
  )
}

function BehaviorForm({ cfg, onSave }) {
  const [draft, setDraft] = useState(cfg)
  const [dirty, setDirty] = useState(false)

  useEffect(() => {
    if (!dirty) setDraft(cfg)
  }, [cfg, dirty])

  const patch = (partial) => {
    setDirty(true)
    setDraft((prev) => ({ ...prev, ...partial }))
  }

  const numField = (key, label, step = '1') => (
    <Field>
      <FieldLabel htmlFor={key}>{label}</FieldLabel>
      <Input
        id={key}
        type="number"
        inputMode="decimal"
        step={step}
        value={draft[key] ?? ''}
        onChange={(e) => patch({ [key]: Number(e.target.value) })}
      />
    </Field>
  )

  return (
    <form
      className="flex flex-col gap-6"
      onSubmit={async (e) => {
        e.preventDefault()
        await onSave(draft)
        setDirty(false)
      }}
    >
      <FieldSet>
        <FieldGroup>
          <Field>
            <FieldLabel>Mode</FieldLabel>
            <Select value={draft.mode || 'paper'} onValueChange={(mode) => patch({ mode })}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  <SelectItem value="live">Live</SelectItem>
                  <SelectItem value="paper">Paper</SelectItem>
                </SelectGroup>
              </SelectContent>
            </Select>
          </Field>

          <Field orientation="horizontal">
            <FieldContent>
              <FieldTitle>Announce before trade</FieldTitle>
              <FieldDescription>Show targets and wait for approve</FieldDescription>
            </FieldContent>
            <Switch
              checked={draft.announceBeforeTrade !== false}
              onCheckedChange={(announceBeforeTrade) => patch({ announceBeforeTrade })}
            />
          </Field>

          <Field orientation="horizontal">
            <FieldContent>
              <FieldTitle>Auto-approve paper</FieldTitle>
              <FieldDescription>Skip confirm in paper mode</FieldDescription>
            </FieldContent>
            <Switch
              checked={!!draft.autoApprovePaper}
              onCheckedChange={(autoApprovePaper) => patch({ autoApprovePaper })}
            />
          </Field>
        </FieldGroup>
      </FieldSet>

      <FieldSet>
        <FieldGroup className="grid grid-cols-1 gap-4 xs:grid-cols-2 sm:grid-cols-2">
          {numField('announceTimeoutSec', 'Announce timeout (s)')}
          {numField('minConfidence', 'Min confidence', '0.05')}
          {numField('kellyFraction', 'Kelly fraction', '0.05')}
          {numField('maxPositionPct', 'Max bankroll %', '0.05')}
          {numField('minPositionSize', 'Min $', '0.1')}
          {numField('tpPctLow', 'TP low %')}
          {numField('tpPctHigh', 'TP high %')}
          {numField('slPct', 'SL %')}
          {numField('minPrice', 'Min price', '0.01')}
          {numField('maxPrice', 'Max price', '0.01')}
          {numField('minRemainingSec', 'Min secs left')}
        </FieldGroup>
      </FieldSet>

      <FieldSet>
        <FieldGroup>
          <Field orientation="horizontal">
            <FieldLabel htmlFor="signals">Use signals</FieldLabel>
            <Switch
              id="signals"
              checked={draft.useSignals !== false}
              onCheckedChange={(useSignals) => patch({ useSignals })}
            />
          </Field>
          <Field orientation="horizontal">
            <FieldLabel htmlFor="kelly">Kelly sizing</FieldLabel>
            <Switch
              id="kelly"
              checked={draft.useKellySizing !== false}
              onCheckedChange={(useKellySizing) => patch({ useKellySizing })}
            />
          </Field>
        </FieldGroup>
      </FieldSet>

      <Alert>
        <AlertTitle>Expected exits</AlertTitle>
        <AlertDescription className="font-mono text-xs">
          TP {draft.tpPctLow}–{draft.tpPctHigh}% · SL {draft.slPct}% · announce{' '}
          {draft.announceBeforeTrade !== false ? `ON (${draft.announceTimeoutSec || 28}s)` : 'OFF'}
        </AlertDescription>
      </Alert>

      <Button type="submit" disabled={!dirty} className="h-11 w-full">
        Save behavior
      </Button>
    </form>
  )
}

function TradeApproveDialog({ pending, onApprove, onReject, busy }) {
  const open = pending.length > 0
  const p = pending[0]
  const plan = p?.plan || {}
  const leftSec = p ? Math.max(0, Math.ceil(((p.expiresAt || 0) - Date.now()) / 1000)) : 0

  return (
    <Dialog open={open}>
      <DialogContent className="max-h-[90dvh] w-[calc(100vw-1.5rem)] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="font-mono text-base sm:text-lg">
            Trade ready — {p?.symbol} {p?.outcome?.toUpperCase()}
          </DialogTitle>
          <DialogDescription>
            Review targets before this order hits the book. Expires in {leftSec}s.
          </DialogDescription>
        </DialogHeader>

        {p && (
          <div className="grid grid-cols-2 gap-2 text-sm sm:gap-3">
            <div className="rounded-lg border border-border bg-muted/40 p-2.5 sm:p-3">
              <div className="text-muted-foreground text-[0.65rem] uppercase tracking-wide">Entry</div>
              <div className="font-mono text-sm sm:text-base">{money(plan.entryPrice, 3)}</div>
            </div>
            <div className="rounded-lg border border-border bg-muted/40 p-2.5 sm:p-3">
              <div className="text-muted-foreground text-[0.65rem] uppercase tracking-wide">Size</div>
              <div className="font-mono text-sm sm:text-base">
                {money(plan.costEst)} · ~{plan.shares} sh
              </div>
            </div>
            <div className="rounded-lg border border-primary/40 bg-primary/10 p-2.5 sm:p-3">
              <div className="text-muted-foreground text-[0.65rem] uppercase tracking-wide">Take profit</div>
              <div className="font-mono text-sm text-primary sm:text-base">
                +{plan.targetTp}% → {money(plan.tpPrice, 3)}
              </div>
              <div className="text-muted-foreground font-mono text-xs">+{money(plan.tpPnl)}</div>
            </div>
            <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-2.5 sm:p-3">
              <div className="text-muted-foreground text-[0.65rem] uppercase tracking-wide">Stop loss</div>
              <div className="font-mono text-sm text-destructive sm:text-base">
                -{plan.slPct}% → {money(plan.slPrice, 3)}
              </div>
              <div className="text-muted-foreground font-mono text-xs">{money(plan.slPnl)}</div>
            </div>
            <div className="col-span-2 rounded-lg border border-border p-2.5 sm:p-3">
              <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
                <span>
                  Conf <b className="text-foreground font-mono">{((plan.confidence || 0) * 100).toFixed(0)}%</b>
                </span>
                <span>
                  Window <b className="text-foreground font-mono">{plan.remaining}s</b>
                </span>
                <span>
                  Mode <b className="text-foreground font-mono">{p.mode}</b>
                </span>
                {pending.length > 1 && <span>+{pending.length - 1} more pending</span>}
              </div>
              {plan.thesis && <p className="mt-2 text-sm text-muted-foreground">{plan.thesis}</p>}
            </div>
          </div>
        )}

        <DialogFooter className="flex-col gap-2 sm:flex-row sm:justify-between">
          <Button variant="outline" className="h-11 w-full sm:w-auto" disabled={busy} onClick={() => onReject(p.id)}>
            Skip
          </Button>
          <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
            {pending.length > 1 && (
              <Button variant="secondary" className="h-11" disabled={busy} onClick={() => onApprove('all')}>
                Approve all
              </Button>
            )}
            <Button className="h-11" disabled={busy} onClick={() => onApprove(p.id)}>
              Approve trade
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function MarketCards({ markets, onSelectBook, selectedSlug }) {
  return (
    <div className="flex flex-col gap-2 p-3 lg:hidden">
      {markets.map((m, i) => {
        const book = marketBook(m)
        const selected = selectedSlug && m.slug === selectedSlug
        return (
          <div
            key={i}
            role={onSelectBook ? 'button' : undefined}
            tabIndex={onSelectBook ? 0 : undefined}
            onClick={() => onSelectBook?.(m)}
            onKeyDown={(e) => {
              if (onSelectBook && (e.key === 'Enter' || e.key === ' ')) onSelectBook(m)
            }}
            className={cn(
              'rounded-lg border border-border/70 bg-card/60 p-3',
              onSelectBook && 'cursor-pointer hover:border-primary/50',
              selected && 'border-primary/60 bg-primary/10',
              (m.decision?.action === 'buy' || m.decision?.action === 'announce') &&
                'border-primary/40 bg-primary/5',
            )}
          >
            <div className="flex items-start justify-between gap-2">
              <div>
                <div className="flex items-center gap-2">
                  <div className="text-base font-semibold">{m.symbol}</div>
                  <Badge
                    variant="outline"
                    className={cn(
                      'text-[0.45rem]',
                      m.windowStatus === 'LIVE' &&
                        'border-[#a3e635]/40 bg-[#a3e635]/15 text-[#a3e635]',
                      m.windowStatus === 'ENDING' &&
                        'border-amber-400/40 bg-amber-400/10 text-amber-400',
                      m.windowStatus === 'RESOLVED' &&
                        'border-muted-foreground/40 text-muted-foreground',
                      m.windowStatus === 'NEXT' && 'text-muted-foreground',
                    )}
                  >
                    {m.windowStatus || (m.isCurrent ? 'LIVE' : 'NEXT')}
                  </Badge>
                </div>
                <div className="text-muted-foreground font-mono text-[0.65rem]">{m.slug}</div>
              </div>
              <Badge
                variant={
                  m.decision?.action === 'announce'
                    ? 'outline'
                    : m.decision?.action === 'buy'
                      ? 'default'
                      : 'secondary'
                }
              >
                {(m.decision?.summary || m.action || 'hold').slice(0, 28)}
              </Badge>
            </div>
            <div className="mt-3 grid grid-cols-3 gap-2 font-mono text-xs">
              <div>
                <div className="text-muted-foreground uppercase">Up</div>
                <div>{money(m.prices?.up, 3)}</div>
                <div className="text-muted-foreground text-[0.55rem]">
                  {book?.up?.bestBid != null
                    ? `${money(book.up.bestBid, 2)}/${money(book.up.bestAsk, 2)}`
                    : 'bid/ask —'}
                </div>
              </div>
              <div>
                <div className="text-muted-foreground uppercase">Down</div>
                <div>{money(m.prices?.down, 3)}</div>
                <div className="text-muted-foreground text-[0.55rem]">
                  {book?.down?.bestBid != null
                    ? `${money(book.down.bestBid, 2)}/${money(book.down.bestAsk, 2)}`
                    : 'bid/ask —'}
                </div>
              </div>
              <div>
                <div className="text-muted-foreground uppercase">Left</div>
                <div>
                  <LiveCountdown
                    endAtMs={m.endAtMs}
                    fallbackMs={m.remainingMs}
                    fallbackSeconds={m.remaining}
                  />
                </div>
              </div>
            </div>
            <div className="mt-2 grid grid-cols-3 gap-2 font-mono text-[0.65rem]">
              <div>
                <span className="text-muted-foreground">Liq </span>
                {moneyCompact(m.liquidity)}
              </div>
              <div>
                <span className="text-muted-foreground">Vol </span>
                {moneyCompact(m.volume)}
              </div>
              <div>
                <span className="text-muted-foreground">Arb </span>
                {book?.arbGap != null ? money(book.arbGap, 3) : '—'}
              </div>
            </div>
            <div className="text-muted-foreground mt-2 text-xs">
              {m.signal
                ? `${m.signal.direction?.toUpperCase()} ${(m.signal.confidence * 100).toFixed(0)}%`
                : 'No signal'}
              {m.sizingPreview?.sizeUsd ? ` · Kelly ${money(m.sizingPreview.sizeUsd)}` : ''}
              {m.impliedWinner ? ` · → ${m.impliedWinner}` : ''}
            </div>
            {selected && (
              <div className="mt-3">
                <MarketDetailTiles market={m} />
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

function MarketTable({ markets, compact = false, onSelectBook, selectedSlug }) {
  if (!markets.length) {
    return (
      <Empty className="border-0 py-8">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <LineChart />
          </EmptyMedia>
          <EmptyTitle>No live markets</EmptyTitle>
          <EmptyDescription>Waiting for the next BTC/ETH 5m window.</EmptyDescription>
        </EmptyHeader>
      </Empty>
    )
  }

  return (
    <>
      <MarketCards markets={markets} onSelectBook={onSelectBook} selectedSlug={selectedSlug} />
      <div className="hidden lg:block">
        <ScrollArea className={compact ? 'h-[260px]' : 'h-[min(60vh,520px)]'}>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Asset</TableHead>
                <TableHead>UP mid</TableHead>
                <TableHead>DN mid</TableHead>
                <TableHead>UP bid/ask</TableHead>
                <TableHead>DN bid/ask</TableHead>
                <TableHead>Liq</TableHead>
                {!compact && <TableHead>Vol</TableHead>}
                {!compact && <TableHead>Arb</TableHead>}
                <TableHead>Left</TableHead>
                <TableHead>Signal</TableHead>
                <TableHead>Decision</TableHead>
                {!compact && <TableHead>Kelly</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {markets.map((m, i) => {
                const book = marketBook(m)
                const selected = selectedSlug && m.slug === selectedSlug
                return (
                  <TableRow
                    key={i}
                    onClick={() => onSelectBook?.(m)}
                    className={cn(
                      onSelectBook && 'cursor-pointer',
                      selected && 'bg-primary/10',
                      m.decision?.action === 'buy' || m.decision?.action === 'announce'
                        ? 'bg-primary/5'
                        : undefined,
                    )}
                  >
                    <TableCell>
                      <div className="flex items-center gap-1.5 font-medium">
                        {m.symbol}
                        <Badge
                          variant="outline"
                          className={cn(
                            'text-[0.4rem]',
                            m.windowStatus === 'LIVE' &&
                              'border-[#a3e635]/40 bg-[#a3e635]/15 text-[#a3e635]',
                            m.windowStatus === 'ENDING' && 'border-amber-400/40 text-amber-400',
                            m.windowStatus === 'RESOLVED' && 'text-muted-foreground',
                          )}
                        >
                          {m.windowStatus || (m.isCurrent ? 'LIVE' : 'NEXT')}
                        </Badge>
                      </div>
                      <div className="text-muted-foreground max-w-[140px] truncate font-mono text-[0.65rem]">
                        {m.slug}
                      </div>
                      {m.impliedWinner && (
                        <div className="text-primary mt-0.5 font-mono text-[0.55rem]">
                          → {m.impliedWinner}
                        </div>
                      )}
                    </TableCell>
                    <TableCell className="font-mono">{money(m.prices?.up, 3)}</TableCell>
                    <TableCell className="font-mono">{money(m.prices?.down, 3)}</TableCell>
                    <TableCell className="font-mono text-[0.65rem]">
                      {book?.up?.bestBid != null
                        ? `${Number(book.up.bestBid).toFixed(2)}/${Number(book.up.bestAsk).toFixed(2)}`
                        : '—'}
                    </TableCell>
                    <TableCell className="font-mono text-[0.65rem]">
                      {book?.down?.bestBid != null
                        ? `${Number(book.down.bestBid).toFixed(2)}/${Number(book.down.bestAsk).toFixed(2)}`
                        : '—'}
                    </TableCell>
                    <TableCell className="font-mono text-xs">{moneyCompact(m.liquidity)}</TableCell>
                    {!compact && (
                      <TableCell className="font-mono text-xs">{moneyCompact(m.volume)}</TableCell>
                    )}
                    {!compact && (
                      <TableCell className="font-mono text-xs">
                        {book?.arbGap != null ? money(book.arbGap, 3) : '—'}
                      </TableCell>
                    )}
                    <TableCell className="font-mono text-xs">
                      <LiveCountdown
                        endAtMs={m.endAtMs}
                        fallbackMs={m.remainingMs}
                        fallbackSeconds={m.remaining}
                      />
                    </TableCell>
                    <TableCell className="text-xs">
                      {m.signal
                        ? `${m.signal.direction?.toUpperCase()} ${(m.signal.confidence * 100).toFixed(0)}%`
                        : '—'}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={
                          m.decision?.action === 'announce'
                            ? 'outline'
                            : m.decision?.action === 'buy'
                              ? 'default'
                              : 'secondary'
                        }
                      >
                        {(m.decision?.summary || m.action || 'hold').slice(0, 42)}
                      </Badge>
                    </TableCell>
                    {!compact && (
                      <TableCell className="font-mono text-xs">
                        {m.sizingPreview?.sizeUsd ? money(m.sizingPreview.sizeUsd) : '—'}
                      </TableCell>
                    )}
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </ScrollArea>
        {selectedSlug && (
          <div className="border-t border-border/60 p-3">
            <MarketDetailTiles market={markets.find((m) => m.slug === selectedSlug)} />
          </div>
        )}
      </div>
    </>
  )
}

function BottomNav({ tab, setTab, items }) {
  return (
    <nav
      className="bg-background/95 fixed inset-x-0 bottom-0 z-40 border-t border-border/80 backdrop-blur-md lg:hidden"
      style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
    >
      <div className="grid grid-cols-5">
        {items.map(({ id, label, icon: Icon }) => {
          const active = tab === id
          return (
            <button
              key={id}
              type="button"
              onClick={() => setTab(id)}
              className={cn(
                'flex min-h-14 flex-col items-center justify-center gap-0.5 px-1 text-[0.65rem] transition-colors',
                active ? 'text-primary' : 'text-muted-foreground',
              )}
            >
              <Icon className={cn('size-5', active && 'text-primary')} />
              <span className="truncate">{label}</span>
            </button>
          )
        })}
      </div>
    </nav>
  )
}

function PolyShell({
  poly,
  error,
  tab,
  setTab,
  navItems,
  syncing,
  sync,
  act,
  setCfg,
  settingsOpen,
  setSettingsOpen,
  busy,
  approve,
}) {
  const { setOpenMobile, isMobile } = useSidebar()
  const narrow = useIsMobile()

  const cfg = poly.config || {}
  const readiness = poly.readiness || {}
  const portfolio = poly.portfolio || {}
  const markets = poly.markets || []
  const liveMarkets = markets.filter((m) => m.isCurrent !== false && m.prices?.up)
  const openPositions = poly.positions || []
  const botPositions = poly.botPositions || []
  const pending = poly.pendingTrades || []
  const audit = poly.audit || {}
  const liveOk = readiness.liveReady || cfg.mode === 'paper'
  const cash = spendableCash(readiness, portfolio)
  const livePnl = portfolio.cashPnl ?? portfolio.netPnl ?? 0
  const botPnl = portfolio.realizedPnl ?? 0
  const limits = portfolio.limits || {}
  const [bookMarket, setBookMarket] = useState(null)
  const [chartPack, setChartPack] = useState({ charts: {}, mlTraces: {} })
  const [modeBusy, setModeBusy] = useState(false)
  const activeBook = bookMarket || liveMarkets[0] || null
  const bookLabel = activeBook ? `${activeBook.symbol}` : ''
  const chartMarket = activeBook
  const chartTicks =
    (chartMarket?.slug && (chartPack.charts?.[chartMarket.slug] || poly.charts?.[chartMarket.slug])) ||
    []
  const chartMl =
    chartMarket?.symbol &&
    (chartPack.mlTraces?.[chartMarket.symbol.toLowerCase()] ||
      poly.mlTraces?.[chartMarket.symbol.toLowerCase()])

  const setMode = async (mode) => {
    if (!mode || mode === cfg.mode || modeBusy) return
    setModeBusy(true)
    try {
      await setCfg({ mode })
    } finally {
      setModeBusy(false)
    }
  }

  useEffect(() => {
    if (tab !== 'markets' && tab !== 'overview') return undefined
    let alive = true
    let n = 0
    const pull = () => {
      n += 1
      // every ~30s also nudge ML refresh via ?ml=1
      const qs = n === 1 || n % 15 === 0 ? '?ml=1' : ''
      fetch(`/api/poly/charts${qs}`)
        .then((r) => r.json())
        .then((d) => {
          if (alive && d?.charts) setChartPack(d)
        })
        .catch(() => {})
    }
    pull()
    const id = setInterval(pull, 2000)
    return () => {
      alive = false
      clearInterval(id)
    }
  }, [tab])

  const go = (id) => {
    setTab(id)
    if (isMobile) setOpenMobile(false)
  }

  return (
    <>
      <Toaster theme="dark" position="top-center" richColors />
      <TradeApproveDialog
        pending={pending}
        busy={busy}
        onApprove={approve}
        onReject={(id) => act('/api/poly/reject', { id }, 'Trade skipped')}
      />

      <Sidebar collapsible="offcanvas" variant="sidebar" className="border-r border-sidebar-border">
        <SidebarHeader>
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton size="lg" asChild>
                <a href="/">
                  <div className="bg-sidebar-primary text-sidebar-primary-foreground flex aspect-square size-8 items-center justify-center rounded-lg font-mono text-xs font-bold">
                    Z
                  </div>
                  <div className="grid flex-1 text-left text-sm leading-tight">
                    <span className="truncate font-semibold">Poly 5m</span>
                    <span className="text-muted-foreground truncate font-mono text-[0.65rem]">
                      <LiveClock />
                    </span>
                  </div>
                </a>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarHeader>

        <SidebarContent>
          <SidebarGroup>
            <SidebarGroupLabel>Terminal</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {navItems.map(({ id, label, icon: Icon }) => (
                  <SidebarMenuItem key={id}>
                    <SidebarMenuButton isActive={tab === id} tooltip={label} onClick={() => go(id)}>
                      <Icon />
                      <span>{label}</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>

          <SidebarSeparator />

          <SidebarGroup>
            <SidebarGroupLabel>Status</SidebarGroupLabel>
            <SidebarGroupContent className="flex flex-col gap-2 px-2">
              <Badge
                className={cn(
                  'w-fit',
                  poly.running
                    ? 'border-[#a3e635]/40 bg-[#a3e635]/15 text-[#a3e635] hover:bg-[#a3e635]/20'
                    : '',
                )}
                variant={poly.running ? 'outline' : 'secondary'}
              >
                {poly.running ? 'ENGAGED' : 'Stopped'}
              </Badge>
              <ModeRail mode={cfg.mode} onChange={setMode} disabled={modeBusy || busy} />
              {cfg.announceBeforeTrade !== false && (
                <Badge variant="outline" className="w-fit">
                  Announce
                </Badge>
              )}
              {pending.length > 0 && (
                <Badge variant="secondary" className="w-fit">
                  {pending.length} pending
                </Badge>
              )}
            </SidebarGroupContent>
          </SidebarGroup>
        </SidebarContent>

        <SidebarFooter>
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton asChild tooltip="Main terminal">
                <a href="/">
                  <ArrowLeft />
                  <span>Main terminal</span>
                </a>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarFooter>
      </Sidebar>

      <SidebarInset className="poly-shell max-w-full overflow-x-hidden">
        <header className="bg-background/90 sticky top-0 z-30 border-b border-border/70 backdrop-blur-md">
          <div className="flex items-center gap-2 px-3 py-2">
            <SidebarTrigger className="size-10 shrink-0 lg:size-8" />
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-semibold tracking-tight">
                {navItems.find((n) => n.id === tab)?.label || 'Overview'}
              </div>
              <div className="text-muted-foreground truncate font-mono text-[0.65rem]">
                {addr(readiness.depositWallet)} · cash {money(cash)}
                {readiness.clobError ? ` · CLOB err` : ''}
              </div>
            </div>
            <div className="flex items-center gap-1 sm:gap-2">
              <ModeRail mode={cfg.mode} onChange={setMode} disabled={modeBusy || busy} />
              <Badge
                variant="outline"
                className={cn(
                  'hidden sm:inline-flex',
                  poly.running && 'border-[#a3e635]/40 bg-[#a3e635]/15 text-[#a3e635]',
                )}
              >
                {poly.running ? 'ENGAGED' : 'Stop'}
              </Badge>
            </div>
          </div>

          {/* Live spot strip */}
          <div className="flex flex-wrap items-center gap-3 border-t border-border/50 px-3 py-1.5 font-mono text-[0.65rem]">
            {['btc', 'eth'].map((asset) => {
              const spot = poly.spotPrices?.[asset]
              return (
                <div key={asset} className="flex items-center gap-1.5">
                  <span className="text-muted-foreground uppercase">{asset}</span>
                  <span className="text-[#a3e635] font-semibold">
                    {spot?.price != null
                      ? `$${Number(spot.price).toLocaleString(undefined, { maximumFractionDigits: asset === 'btc' ? 0 : 2 })}`
                      : '—'}
                  </span>
                  {spot?.changePct != null && (
                    <span className={spot.changePct >= 0 ? 'text-[#a3e635]' : 'text-destructive'}>
                      {spot.changePct >= 0 ? '+' : ''}
                      {Number(spot.changePct).toFixed(2)}%
                    </span>
                  )}
                </div>
              )
            })}
            <span className="text-muted-foreground ml-auto text-[0.55rem]">
              <LiveClock />
            </span>
          </div>

          <div className="grid grid-cols-4 gap-1.5 border-t border-border/50 px-3 py-2 sm:flex sm:flex-wrap sm:gap-2">
            <Button
              size={narrow ? 'default' : 'sm'}
              className="h-11 min-w-0 px-2 sm:h-8 sm:px-3"
              variant={poly.running ? 'destructive' : 'default'}
              onClick={() =>
                fetch(poly.running ? '/api/poly/stop' : '/api/poly/start', { method: 'POST' }).then(() =>
                  toast.message(poly.running ? 'Bot stopped' : 'Bot started'),
                )
              }
            >
              {poly.running ? <Square data-icon="inline-start" /> : <Play data-icon="inline-start" />}
              <span className="truncate">{poly.running ? 'Stop' : 'Start'}</span>
            </Button>

            <Button
              size={narrow ? 'default' : 'sm'}
              className="h-11 min-w-0 px-2 sm:h-8 sm:px-3"
              variant="outline"
              disabled={syncing}
              onClick={sync}
            >
              <RefreshCw data-icon="inline-start" className={syncing ? 'animate-spin' : undefined} />
              Sync
            </Button>

            <Button
              size={narrow ? 'default' : 'sm'}
              className="h-11 min-w-0 px-2 sm:h-8 sm:px-3"
              variant="destructive"
              onClick={() => act('/api/poly/sell-all', null, 'Panic sell sent')}
            >
              <Trash2 data-icon="inline-start" />
              Panic
            </Button>

            <Sheet open={settingsOpen} onOpenChange={setSettingsOpen}>
              <SheetTrigger asChild>
                <Button
                  size={narrow ? 'default' : 'sm'}
                  className="h-11 min-w-0 px-2 sm:h-8 sm:px-3"
                  variant="secondary"
                >
                  <Settings2 data-icon="inline-start" />
                  <span className="truncate">Behavior</span>
                </Button>
              </SheetTrigger>
              <SheetContent className="w-full overflow-y-auto sm:max-w-md">
                <SheetHeader>
                  <SheetTitle>Bot behavior</SheetTitle>
                  <SheetDescription>Sizing, exits, and announce gate</SheetDescription>
                </SheetHeader>
                <div className="mt-4 px-1 pb-8">
                  <BehaviorForm cfg={cfg} onSave={setCfg} />
                </div>
              </SheetContent>
            </Sheet>
          </div>
        </header>

        <div className="poly-mobile-pad flex flex-1 flex-col gap-3 p-3 sm:gap-4 sm:p-4">
          {!liveOk && cfg.mode === 'live' && (
            <Alert variant="destructive">
              <AlertTitle>Live blocked</AlertTitle>
              <AlertDescription>
                {(readiness.needs || []).join(' · ') || 'Fund CLOB or fix wallet'}
              </AlertDescription>
            </Alert>
          )}
          {error && (
            <Alert variant="destructive">
              <AlertTitle>Stream error</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          {audit.issues?.length > 0 && (
            <Alert>
              <AlertTitle>Audit notes</AlertTitle>
              <AlertDescription>
                <ul className="mt-1 list-disc space-y-1 pl-4 text-xs leading-snug">
                  {audit.issues.map((issue) => (
                    <li key={issue}>{issue}</li>
                  ))}
                </ul>
              </AlertDescription>
            </Alert>
          )}

          <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
            <Kpi label="Equity" value={money(portfolio.equity ?? cash)} tone="up" />
            <Kpi label="Net PnL" value={money(livePnl)} tone={livePnl >= 0 ? 'up' : 'down'} />
            <Kpi label="Cash" value={money(cash)} />
            <Kpi label="In positions" value={money(portfolio.openMarkValue)} />
          </div>
          <div className="grid grid-cols-2 gap-2 md:grid-cols-3">
            <Kpi label="Bot est." value={money(botPnl)} tone={botPnl >= 0 ? 'up' : 'down'} />
            <Kpi
              label="Cycle"
              value={
                <LiveCountdown
                  endAtMs={poly.cycle?.endAtMs}
                  fallbackMs={poly.cycle?.remainingMs}
                  fallbackSeconds={poly.cycle?.remainingSeconds}
                />
              }
            />
            <Kpi
              label="Kelly range"
              value={`${money(limits.minUsd ?? cfg.minPositionSize)}–${money(limits.maxUsd ?? 0)}`}
              tone="muted"
            />
          </div>

          {tab === 'overview' && (
            <div className="flex flex-col gap-3 sm:gap-4">
              <div className="grid gap-3 sm:gap-4 lg:grid-cols-3">
                <Card>
                  <CardHeader className="px-4 py-3">
                    <CardTitle className="text-base">Account</CardTitle>
                    <CardDescription>Wallet + audit</CardDescription>
                  </CardHeader>
                  <CardContent className="grid grid-cols-2 gap-3 px-4 pb-4 text-sm">
                    <div>
                      <div className="text-muted-foreground text-xs">Deposit</div>
                      <div className="font-mono text-xs sm:text-sm">{addr(readiness.depositWallet)}</div>
                    </div>
                    <div>
                      <div className="text-muted-foreground text-xs">Spendable</div>
                      <div className="font-mono text-primary">{money(cash)}</div>
                    </div>
                    <div>
                      <div className="text-muted-foreground text-xs">CLOB</div>
                      <div className="font-mono">{money(readiness.clobBalance)}</div>
                    </div>
                    <div>
                      <div className="text-muted-foreground text-xs">Deposit pUSD</div>
                      <div className="font-mono">{money(readiness.depositPusd)}</div>
                    </div>
                    <div>
                      <div className="text-muted-foreground text-xs">Baseline</div>
                      <div className="font-mono">{money(portfolio.baselineUsd ?? cash)}</div>
                    </div>
                    <div>
                      <div className="text-muted-foreground text-xs">API</div>
                      <div className={readiness.apiReady ? 'text-primary' : 'text-destructive'}>
                        {readiness.apiReady ? 'ok' : 'no'}
                      </div>
                    </div>
                    <div>
                      <div className="text-muted-foreground text-xs">Owner</div>
                      <div>{readiness.ownerMatches === false ? 'mismatch' : 'ok'}</div>
                    </div>
                    <div>
                      <div className="text-muted-foreground text-xs">Scans</div>
                      <div className="font-mono">{poly.stats?.scansDone || 0}</div>
                    </div>
                  </CardContent>
                </Card>

                {['btc', 'eth'].map((key) => {
                  const intel = poly.intelligence?.[key]
                  return (
                    <Card key={key}>
                      <CardHeader className="flex-row items-start justify-between gap-2 px-4 py-3">
                        <div>
                          <CardTitle className="text-base uppercase">{key}</CardTitle>
                          <CardDescription>{intel?.regime || 'waiting'}</CardDescription>
                        </div>
                        {intel && (
                          <div className="flex flex-wrap justify-end gap-1">
                            <Badge variant="outline">{intel.direction}</Badge>
                            <Badge variant="secondary">{intel.conviction}</Badge>
                          </div>
                        )}
                      </CardHeader>
                      <CardContent className="flex flex-col gap-2 px-4 pb-4 text-sm">
                        {!intel ? (
                          <p className="text-muted-foreground">Signal not ready</p>
                        ) : (
                          <>
                            <div className="flex flex-wrap gap-x-3 gap-y-1 font-mono text-xs text-muted-foreground">
                              <span>
                                Score <b className="text-foreground">{intel.score?.toFixed(1)}</b>
                              </span>
                              <span>
                                Conf <b className="text-foreground">{(intel.confidence * 100).toFixed(0)}%</b>
                              </span>
                              <span>
                                RSI <b className="text-foreground">{intel.rsi?.toFixed(0)}</b>
                              </span>
                              <span className="text-foreground">{money(intel.price, 0)}</span>
                            </div>
                            <p className="text-muted-foreground text-sm leading-relaxed">{intel.thesis}</p>
                          </>
                        )}
                      </CardContent>
                    </Card>
                  )
                })}
              </div>

              <Card>
                <CardHeader className="flex-col items-start gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <CardTitle className="text-base">Live markets</CardTitle>
                    <CardDescription>
                      {liveMarkets.length} active · TP {cfg.tpPctLow}–{cfg.tpPctHigh}% · SL {cfg.slPct}%
                    </CardDescription>
                  </div>
                  <Button size="sm" variant="outline" className="h-10 w-full sm:h-8 sm:w-auto" onClick={() => go('markets')}>
                    Open markets
                  </Button>
                </CardHeader>
                <CardContent className="px-0 pb-2">
                  <MarketTable markets={liveMarkets.slice(0, 6)} compact />
                </CardContent>
              </Card>
            </div>
          )}

          {tab === 'markets' && (
            <div className="flex flex-col gap-3 lg:grid lg:grid-cols-[1.35fr_1fr]">
              <Card>
                <CardHeader className="px-4 py-3">
                  <CardTitle className="text-base">Current 5-min windows</CardTitle>
                  <CardDescription>Tap a row for chart + order-book depth</CardDescription>
                </CardHeader>
                <CardContent className="px-0 pb-2">
                  <MarketTable
                    markets={liveMarkets}
                    onSelectBook={(m) => setBookMarket(m)}
                    selectedSlug={activeBook?.slug}
                  />
                </CardContent>
              </Card>
              <div className="flex flex-col gap-3">
                <ChartPanel market={chartMarket} ticks={chartTicks} mlTrace={chartMl} />
                {activeBook?.tokenIds ? (
                  <OrderBook
                    tokenIds={activeBook.tokenIds}
                    tokenId={activeBook.tokenIds?.up || activeBook.tokenIds?.down}
                    label={bookLabel}
                    initialDepth={marketBook(activeBook)}
                    onClose={bookMarket ? () => setBookMarket(null) : undefined}
                  />
                ) : (
                  <Card>
                    <CardContent className="text-muted-foreground py-10 text-center text-sm">
                      Select a market to load depth
                    </CardContent>
                  </Card>
                )}
              </div>
            </div>
          )}

          {tab === 'positions' && (
            <Card>
              <CardHeader className="px-4 py-3">
                <CardTitle className="text-base">Positions</CardTitle>
                <CardDescription>
                  {openPositions.length} wallet · {botPositions.length} bot tracked
                </CardDescription>
              </CardHeader>
              <CardContent className="px-0 pb-2">
                {openPositions.length === 0 && botPositions.length === 0 ? (
                  <Empty className="border-0">
                    <EmptyHeader>
                      <EmptyMedia variant="icon">
                        <Wallet />
                      </EmptyMedia>
                      <EmptyTitle>No open positions</EmptyTitle>
                      <EmptyDescription>Cash sits on CLOB until the next fill.</EmptyDescription>
                    </EmptyHeader>
                  </Empty>
                ) : (
                  <>
                    <div className="flex flex-col gap-2 p-3 lg:hidden">
                      {[
                        ...openPositions.map((p, i) => ({ kind: 'wallet', key: `w-${i}`, p })),
                        ...botPositions.map((p) => ({ kind: 'bot', key: p.id, p })),
                      ].map(({ kind, key, p }) => (
                        <div key={key} className="rounded-lg border border-border/70 p-3">
                          <div className="flex items-start justify-between gap-2">
                            <div>
                              <Badge variant="outline" className="mb-1">
                                {kind}
                              </Badge>
                              <div className="text-sm font-medium">
                                {kind === 'wallet'
                                  ? (p.title || p.slug || '').slice(0, 40)
                                  : p.symbol}
                              </div>
                              <div className="text-muted-foreground text-xs">
                                {(kind === 'wallet' ? p.outcome : p.outcome?.toUpperCase()) || '—'}
                              </div>
                            </div>
                            <div
                              className={cn(
                                'font-mono text-sm',
                                (kind === 'wallet' ? p.cashPnl : p.pnl) >= 0
                                  ? 'text-primary'
                                  : 'text-destructive',
                              )}
                            >
                              {money(kind === 'wallet' ? p.cashPnl : p.pnl)}
                            </div>
                          </div>
                          <div className="mt-2 flex items-center justify-between gap-2">
                            <span className="font-mono text-xs text-muted-foreground">
                              size {kind === 'wallet' ? p.size : (p.shares || 0).toFixed(1)} ·{' '}
                              {money(kind === 'wallet' ? p.currentValue : p.markValue)}
                            </span>
                            {kind === 'wallet' && p.asset && Number(p.size) > 0 && (
                              <Button
                                size="sm"
                                className="h-9"
                                variant="destructive"
                                onClick={() =>
                                  act('/api/poly/sell-pm', { assetId: p.asset, size: p.size }, 'Sold')
                                }
                              >
                                Dump
                              </Button>
                            )}
                            {kind === 'bot' && (
                              <Button
                                size="sm"
                                className="h-9"
                                variant="destructive"
                                onClick={() => act('/api/poly/sell', { positionId: p.id }, 'Sold')}
                              >
                                Sell
                              </Button>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>

                    <div className="hidden lg:block">
                      <ScrollArea className="h-[min(60vh,420px)]">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>Source</TableHead>
                              <TableHead>Market</TableHead>
                              <TableHead>Side</TableHead>
                              <TableHead>Size</TableHead>
                              <TableHead>Value</TableHead>
                              <TableHead>PnL</TableHead>
                              <TableHead />
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {openPositions.map((p, i) => (
                              <TableRow key={`pm-${i}`}>
                                <TableCell>wallet</TableCell>
                                <TableCell>{(p.title || p.slug || '').slice(0, 36)}</TableCell>
                                <TableCell>{p.outcome}</TableCell>
                                <TableCell className="font-mono">{p.size}</TableCell>
                                <TableCell className="font-mono">{money(p.currentValue)}</TableCell>
                                <TableCell
                                  className={cn(
                                    'font-mono',
                                    (p.cashPnl || 0) >= 0 ? 'text-primary' : 'text-destructive',
                                  )}
                                >
                                  {money(p.cashPnl)}
                                </TableCell>
                                <TableCell>
                                  {p.asset && Number(p.size) > 0 && (
                                    <Button
                                      size="xs"
                                      variant="destructive"
                                      onClick={() =>
                                        act(
                                          '/api/poly/sell-pm',
                                          { assetId: p.asset, size: p.size },
                                          'Sold',
                                        )
                                      }
                                    >
                                      Dump
                                    </Button>
                                  )}
                                </TableCell>
                              </TableRow>
                            ))}
                            {botPositions.map((p) => (
                              <TableRow key={p.id}>
                                <TableCell>bot</TableCell>
                                <TableCell>{p.symbol}</TableCell>
                                <TableCell>{p.outcome?.toUpperCase()}</TableCell>
                                <TableCell className="font-mono">{(p.shares || 0).toFixed(1)}</TableCell>
                                <TableCell className="font-mono">{money(p.markValue)}</TableCell>
                                <TableCell className="font-mono">{money(p.pnl)}</TableCell>
                                <TableCell>
                                  <Button
                                    size="xs"
                                    variant="destructive"
                                    onClick={() =>
                                      act('/api/poly/sell', { positionId: p.id }, 'Sold')
                                    }
                                  >
                                    Sell
                                  </Button>
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </ScrollArea>
                    </div>
                  </>
                )}
              </CardContent>
            </Card>
          )}

          {tab === 'history' && (
            <div className="flex flex-col gap-3">
              {(() => {
                const trades = poly.trades || []
                const wins = trades.filter((t) => (t.pnl || 0) > 0)
                const losses = trades.filter((t) => (t.pnl || 0) <= 0)
                const totalPnl = trades.reduce((s, t) => s + (t.pnl || 0), 0)
                const best = trades.reduce((b, t) => ((t.pnl || 0) > (b?.pnl || -Infinity) ? t : b), null)
                const worst = trades.reduce((b, t) => ((t.pnl || 0) < (b?.pnl || Infinity) ? t : b), null)
                const liveN = trades.filter((t) => t.mode === 'live').length
                const wr = trades.length ? (wins.length / trades.length) * 100 : 0
                return (
                  <>
                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                      <Kpi label="Closed" value={String(trades.length)} />
                      <Kpi
                        label="Net PnL"
                        value={money(totalPnl)}
                        tone={totalPnl >= 0 ? 'up' : 'down'}
                      />
                      <Kpi label="Win rate" value={`${wr.toFixed(0)}%`} tone={wr >= 50 ? 'up' : 'down'} />
                      <Kpi
                        label="Live fills"
                        value={String(liveN)}
                        tone={liveN > 0 ? 'up' : 'muted'}
                      />
                    </div>
                    {(best || worst) && (
                      <div className="grid gap-2 sm:grid-cols-2">
                        {best && (
                          <Card className="border-[#a3e635]/25 bg-[#a3e635]/5">
                            <CardHeader className="px-3 py-2">
                              <CardDescription>Best close</CardDescription>
                              <CardTitle className="font-mono text-base text-[#a3e635]">
                                +${Math.abs(Number(best.pnl || 0)).toFixed(2)}
                              </CardTitle>
                            </CardHeader>
                            <CardContent className="text-muted-foreground px-3 pb-3 text-xs">
                              {best.symbol} {best.outcome?.toUpperCase()} · {best.exitReason?.toUpperCase()} ·{' '}
                              {best.mode}
                            </CardContent>
                          </Card>
                        )}
                        {worst && (
                          <Card className="border-destructive/25 bg-destructive/5">
                            <CardHeader className="px-3 py-2">
                              <CardDescription>Worst close</CardDescription>
                              <CardTitle className="text-destructive font-mono text-base">
                                {money(worst.pnl)}
                              </CardTitle>
                            </CardHeader>
                            <CardContent className="text-muted-foreground px-3 pb-3 text-xs">
                              {worst.symbol} {worst.outcome?.toUpperCase()} · {worst.exitReason?.toUpperCase()} ·{' '}
                              {worst.mode}
                            </CardContent>
                          </Card>
                        )}
                      </div>
                    )}
                    <Card>
                      <CardHeader className="px-4 py-3">
                        <CardTitle className="text-base">Trade detail</CardTitle>
                        <CardDescription>
                          {wins.length}W / {losses.length}L · newest first
                        </CardDescription>
                      </CardHeader>
                      <CardContent className="flex flex-col gap-2 px-3 pb-3">
                        {trades.length === 0 ? (
                          <Empty className="border-0">
                            <EmptyHeader>
                              <EmptyMedia variant="icon">
                                <History />
                              </EmptyMedia>
                              <EmptyTitle>No closed trades yet</EmptyTitle>
                              <EmptyDescription>
                                TP / SL / trail / panic closes land here with full detail.
                              </EmptyDescription>
                            </EmptyHeader>
                          </Empty>
                        ) : (
                          trades.slice(0, 40).map((t, i) => (
                            <div
                              key={i}
                              className={cn(
                                'rounded-lg border border-border/70 p-3',
                                t.mode === 'paper' && 'opacity-75',
                              )}
                            >
                              <div className="flex items-start justify-between gap-2">
                                <div className="flex flex-wrap items-center gap-1.5">
                                  <Badge
                                    variant="outline"
                                    className={cn(
                                      t.mode === 'live' &&
                                        'border-[#a3e635]/40 bg-[#a3e635]/15 text-[#a3e635]',
                                    )}
                                  >
                                    {t.mode}
                                  </Badge>
                                  <span className="font-semibold">
                                    {t.symbol} {t.outcome?.toUpperCase()}
                                  </span>
                                  <Badge variant="secondary">{t.exitReason?.toUpperCase() || '—'}</Badge>
                                </div>
                                <span
                                  className={cn(
                                    'font-mono text-sm font-semibold',
                                    (t.pnl || 0) >= 0 ? 'text-[#a3e635]' : 'text-destructive',
                                  )}
                                >
                                  {(t.pnl || 0) >= 0 ? '+' : ''}
                                  {money(t.pnl)}
                                </span>
                              </div>
                              <div className="text-muted-foreground mt-2 grid grid-cols-2 gap-x-3 gap-y-1 font-mono text-[0.65rem] sm:grid-cols-4">
                                <span>Entry {money(t.entryPrice, 3)}</span>
                                <span>Exit {money(t.exitPrice, 3)}</span>
                                <span>Cost {money(t.costBasis)}</span>
                                <span>
                                  {(t.gainPct != null ? `${t.gainPct >= 0 ? '+' : ''}${Number(t.gainPct).toFixed(1)}%` : '—')}
                                </span>
                              </div>
                              <div className="text-muted-foreground mt-1 flex flex-wrap gap-2 text-[0.65rem]">
                                <LiveTimeAgo ts={t.timestamp || t.entryTime} />
                                {t.slug && <span className="font-mono opacity-70">{t.slug}</span>}
                                {t.shares != null && <span>{Number(t.shares).toFixed(2)} sh</span>}
                              </div>
                            </div>
                          ))
                        )}
                      </CardContent>
                    </Card>
                  </>
                )
              })()}
            </div>
          )}

          {tab === 'log' && (
            <ChatPanel
              actions={poly.actions || poly.executionLog || []}
              trades={poly.trades || []}
              positions={[...(poly.botPositions || []), ...(poly.positions || [])]}
              signals={poly.signals || poly.intelligence || {}}
              poly={poly}
            />
          )}
        </div>

        <BottomNav tab={tab} setTab={go} items={navItems} />
      </SidebarInset>
    </>
  )
}

export default function PolyDashboard() {
  const { state: poly, error } = usePolyState(POLY_POLL_MS)
  const [syncing, setSyncing] = useState(false)
  const [busy, setBusy] = useState(false)
  const [tab, setTab] = useState('overview')
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [, setTick] = useState(0)

  useEffect(() => {
    document.documentElement.classList.add('dark')
    const id = setInterval(() => setTick((n) => n + 1), 1000)
    fetch('/api/poly/sync', { method: 'POST' }).catch(() => {})
    return () => clearInterval(id)
  }, [])

  const navItems = useMemo(
    () => [
      { id: 'overview', label: 'Overview', icon: Activity },
      { id: 'markets', label: 'Markets', icon: LineChart },
      { id: 'positions', label: 'Positions', icon: Wallet },
      { id: 'history', label: 'History', icon: History },
      { id: 'log', label: 'Feed', icon: ListOrdered },
    ],
    [],
  )

  const setCfg = async (patch) => {
    await fetch('/api/poly/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    })
    toast.success('Behavior updated')
  }

  const act = async (url, body, okMsg = 'Done') => {
    setBusy(true)
    try {
      const r = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: body ? JSON.stringify(body) : undefined,
      })
      const d = await r.json()
      if (d.ok === false) toast.error(d.error || 'Failed')
      else toast.success(okMsg)
      return d
    } catch (e) {
      toast.error(e.message)
    } finally {
      setBusy(false)
    }
  }

  const sync = async () => {
    setSyncing(true)
    try {
      await fetch('/api/poly/sync', { method: 'POST' })
      toast.success('Balances synced')
    } catch {
      toast.error('Sync failed')
    }
    setSyncing(false)
  }

  const approve = async (id) => {
    if (id === 'all') return act('/api/poly/approve-all', null, 'All trades approved')
    return act('/api/poly/approve', { id }, 'Trade approved')
  }

  if (!poly) {
    return (
      <div className="dark poly-shell flex min-h-svh flex-col gap-3 p-4">
        <Skeleton className="h-20 w-full" />
        <div className="grid grid-cols-2 gap-2">
          <Skeleton className="h-16" />
          <Skeleton className="h-16" />
          <Skeleton className="h-16" />
          <Skeleton className="h-16" />
        </div>
        <Skeleton className="h-48 w-full" />
      </div>
    )
  }

  return (
    <TooltipProvider>
      <SidebarProvider defaultOpen={false} className="dark min-h-svh">
        <PolyShell
          poly={poly}
          error={error}
          tab={tab}
          setTab={setTab}
          navItems={navItems}
          syncing={syncing}
          sync={sync}
          act={act}
          setCfg={setCfg}
          settingsOpen={settingsOpen}
          setSettingsOpen={setSettingsOpen}
          busy={busy}
          approve={approve}
        />
      </SidebarProvider>
    </TooltipProvider>
  )
}
