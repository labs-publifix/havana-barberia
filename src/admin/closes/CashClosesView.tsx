import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { AlertTriangle, ChevronRight } from 'lucide-react'
import { routes } from '@/app/routes'
import { Badge } from '@/components/ui/Badge'
import { Skeleton } from '@/components/ui/Skeleton'
import { business } from '@/config/business'
import type { LocalDate } from '@/domain/types'
import { cn } from '@/lib/cn'
import { capitalize, formatDay, formatTime12, localDate, localTime, money } from '@/lib/time'
import { useAdminAuth } from '../auth/AdminAuth'
import { cashDayStatus, cashSummary, closeDifference, type CashDayStatus } from '../cash'
import { endSoFar, periodLabel } from '../period'
import { Segmented } from '../ui/controls'
import { Card } from '../ui/Panel'
import { PeriodPicker } from '../ui/PeriodPicker'
import { usePeriod } from '../usePeriod'

const tz = business.hours.timeZone

const STATUS: Record<CashDayStatus, { label: string; tone: 'success' | 'danger' | 'warning' | 'neutral' }> = {
  ok: { label: 'Cuadró', tone: 'success' },
  mismatch: { label: 'No cuadró', tone: 'danger' },
  missing: { label: 'Sin corte', tone: 'danger' },
  open: { label: 'Abierta', tone: 'warning' },
  idle: { label: 'Sin movimientos', tone: 'neutral' },
}

type Filter = 'all' | 'alerts' | 'ok' | 'mismatch' | 'missing'
const FILTERS: { value: Filter; label: string }[] = [
  { value: 'all', label: 'Todos' },
  { value: 'alerts', label: 'Con alerta' },
  { value: 'ok', label: 'Cuadraron' },
  { value: 'mismatch', label: 'No cuadraron' },
  { value: 'missing', label: 'Sin corte' },
]

const signed = (n: number | null | undefined) =>
  n === null || n === undefined ? '—' : n === 0 ? money(0) : `${n > 0 ? '+' : '−'}${money(Math.abs(n))}`
const dayLink = (d: LocalDate) => `${routes.adminSection('ventas')}?vista=caja&periodo=dia&desde=${d}`

/**
 * Cierres › Cortes de caja: every daily close in one list, filtered by period
 * and status, with each method's difference, the tips paid from the drawer and
 * who closed it. A day opens in Ventas › Caja, where the close is made.
 */
export function CashClosesView() {
  const { repo } = useAdminAuth()
  const { period, setPeriod, today, weekStartDay } = usePeriod('month')
  const to = endSoFar(period, today)
  const [filter, setFilter] = useState<Filter>('all')
  const { data } = useQuery({
    queryKey: ['admin', 'cash-range', period.from, to],
    queryFn: () => repo.getCashRange(period.from, to),
  })

  const rows = (data ?? [])
    .map((d) => ({
      d,
      sum: cashSummary(d.appointments, d.sales),
      status: cashDayStatus(d, today),
      tipsPaid: d.moves.filter((m) => m.tipPayoutId && m.kind === 'out').reduce((t, m) => t + m.amount, 0),
    }))
    .filter((r) => r.status !== 'idle')
    .reverse()
  const shown = rows.filter((r) =>
    filter === 'all'
      ? true
      : filter === 'alerts'
        ? r.status === 'missing' || r.status === 'mismatch'
        : r.status === filter,
  )
  const count = (s: CashDayStatus) => rows.filter((r) => r.status === s).length
  const kpis: [string, string, boolean][] = [
    ['Días con movimiento', String(rows.length), false],
    ['Cortes que cuadraron', String(count('ok')), false],
    ['No cuadraron', String(count('mismatch')), count('mismatch') > 0],
    ['Sin corte', String(count('missing')), count('missing') > 0],
  ]

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <PeriodPicker value={period} onChange={setPeriod} today={today} weekStartDay={weekStartDay} />
        <Segmented<Filter> label="Mostrar" value={filter} onChange={setFilter} options={FILTERS} />
      </div>

      {!data ? (
        <Skeleton className="h-72 rounded-lg" aria-busy="true" />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {kpis.map(([k, v, bad]) => (
              <div
                key={k}
                className={cn(
                  'rounded-lg border bg-raised px-4 py-3',
                  bad ? 'border-red-300 bg-red-100/40' : 'border-line',
                )}
              >
                <p className="text-[12px] text-fg-muted">{k}</p>
                <p className={cn('tabular mt-0.5 text-xl font-semibold leading-tight', bad && 'text-red-700')}>{v}</p>
              </div>
            ))}
          </div>

          <Card
            title="Cortes de caja"
            description={`${periodLabel(period)} · del más reciente al más antiguo. Diferencia: + sobró, − faltó.`}
            className="min-w-0"
          >
            {!shown.length ? (
              <p className="text-sm text-fg-muted">No hay días con ese estado en el periodo.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[960px] text-sm">
                  <thead>
                    <tr className="border-b border-line text-left text-[12px] text-fg-muted">
                      <th className="py-2 pr-3 font-medium">Día</th>
                      <th className="py-2 pr-3 font-medium">Estado</th>
                      <th className="py-2 pr-3 text-right font-medium">Cobrado</th>
                      <th className="py-2 pr-3 text-right font-medium">Efectivo esperado</th>
                      <th className="py-2 pr-3 text-right font-medium">Contado</th>
                      <th className="py-2 pr-3 text-right font-medium">Dif. efectivo</th>
                      <th className="py-2 pr-3 text-right font-medium">Dif. tarjeta</th>
                      <th className="py-2 pr-3 text-right font-medium">Dif. transf.</th>
                      <th className="py-2 pr-3 text-right font-medium">Propinas pagadas</th>
                      <th className="py-2 pr-3 font-medium">Cerró</th>
                      <th className="py-2 font-medium">
                        <span className="sr-only">Abrir</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {shown.map(({ d, sum, status, tipsPaid }) => {
                      const bad = status === 'missing' || status === 'mismatch'
                      const c = d.close
                      return (
                        <tr key={d.date} className={cn(bad && 'bg-red-100/40')}>
                          <td className="py-2 pr-3 font-medium">
                            <span className="inline-flex items-center gap-1.5">
                              {bad && <AlertTriangle className="size-4 shrink-0 text-red-700" aria-hidden />}
                              {capitalize(formatDay(d.date, "EEE d 'de' MMM"))}
                            </span>
                          </td>
                          <td className="py-2 pr-3">
                            <Badge tone={STATUS[status].tone}>{STATUS[status].label}</Badge>
                          </td>
                          <td className="tabular py-2 pr-3 text-right">{money(sum.total)}</td>
                          <td className="tabular py-2 pr-3 text-right">{c ? money(c.expected) : '—'}</td>
                          <td className="tabular py-2 pr-3 text-right">{c ? money(c.counted) : '—'}</td>
                          <td
                            className={cn(
                              'tabular py-2 pr-3 text-right',
                              !!c?.difference && 'font-semibold text-red-700',
                            )}
                          >
                            {c ? signed(c.difference) : '—'}
                          </td>
                          <td
                            className={cn(
                              'tabular py-2 pr-3 text-right',
                              !!c?.cardDifference && 'font-semibold text-red-700',
                            )}
                          >
                            {c ? signed(c.cardDifference) : '—'}
                          </td>
                          <td
                            className={cn(
                              'tabular py-2 pr-3 text-right',
                              !!c?.transferDifference && 'font-semibold text-red-700',
                            )}
                          >
                            {c ? signed(c.transferDifference) : '—'}
                          </td>
                          <td className="tabular py-2 pr-3 text-right">{tipsPaid ? money(tipsPaid) : '—'}</td>
                          <td className="py-2 pr-3 text-[13px] text-fg-muted">
                            {c ? `${c.closedBy} · ${formatTime12(localTime(c.closedAt, tz))}` : '—'}
                            {c && localDate(c.closedAt, tz) !== d.date && (
                              <span className="block">el {formatDay(localDate(c.closedAt, tz), "d 'de' MMM")}</span>
                            )}
                            {c?.note && <span className="block italic">«{c.note}»</span>}
                          </td>
                          <td className="py-2">
                            <Link
                              to={dayLink(d.date)}
                              className="inline-flex min-h-9 items-center gap-1 rounded-sm text-[13px] font-medium underline-offset-4 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-focus"
                            >
                              Ver caja <ChevronRight className="size-3.5" aria-hidden />
                            </Link>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
            {rows.some((r) => r.d.close) && (
              <p className="mt-3 text-[13px] text-fg-muted">
                Diferencia total de los cortes:{' '}
                <span className="tabular font-medium">
                  {signed(rows.reduce((t, r) => t + (r.d.close ? closeDifference(r.d.close) : 0), 0))}
                </span>
              </p>
            )}
          </Card>
        </>
      )}
    </div>
  )
}
