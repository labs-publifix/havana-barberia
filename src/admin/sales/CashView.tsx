import { useQuery } from '@tanstack/react-query'
import { AlertTriangle, ChevronRight } from 'lucide-react'
import { Alert } from '@/components/ui/Alert'
import { Badge } from '@/components/ui/Badge'
import { Skeleton } from '@/components/ui/Skeleton'
import type { LocalDate } from '@/domain/types'
import { cn } from '@/lib/cn'
import { addDays, capitalize, formatDay, money } from '@/lib/time'
import { useAdminAuth } from '../auth/AdminAuth'
import { cashAlerts, cashDayStatus, cashSummary, type CashDayStatus } from '../cash'
import type { CashDay } from '../domain'
import { endSoFar, periodAt } from '../period'
import { PeriodPicker } from '../ui/PeriodPicker'
import { Card } from '../ui/Panel'
import { usePeriod } from '../usePeriod'
import { CashDayView } from './CashDayView'

const dayName = (d: LocalDate) => capitalize(formatDay(d, "EEE d 'de' MMM"))

const STATUS: Record<CashDayStatus, { label: string; tone: 'success' | 'danger' | 'warning' | 'neutral' }> = {
  ok: { label: 'Cuadró', tone: 'success' },
  mismatch: { label: 'No cuadró', tone: 'danger' },
  missing: { label: 'Sin corte', tone: 'danger' },
  open: { label: 'Abierta', tone: 'warning' },
  idle: { label: 'Sin movimientos', tone: 'neutral' },
}

/** Days of the last week whose drawer was not closed or didn't match: a preventive notice on top of Caja. */
function RecentWarnings({ today, onOpen }: { today: LocalDate; onOpen: (d: LocalDate) => void }) {
  const { repo } = useAdminAuth()
  const from = addDays(today, -7)
  const to = addDays(today, -1)
  const { data } = useQuery({ queryKey: ['admin', 'cash-range', from, to], queryFn: () => repo.getCashRange(from, to) })
  const alerts = data ? cashAlerts(data, today) : []
  if (!alerts.length) return null
  const missing = alerts.filter((a) => a.status === 'missing').length
  const off = alerts.length - missing
  const title = [
    missing && `${missing} ${missing === 1 ? 'día sin corte de caja' : 'días sin corte de caja'}`,
    off && `${off} ${off === 1 ? 'cierre que no cuadró' : 'cierres que no cuadraron'}`,
  ]
    .filter(Boolean)
    .join(' y ')
  return (
    <Alert tone="danger" title={`Atención: ${title} en los últimos 7 días.`}>
      <ul className="mt-2 flex flex-wrap gap-2">
        {alerts.map(({ day, status }) => (
          <li key={day.date}>
            <button
              type="button"
              onClick={() => onOpen(day.date)}
              className="inline-flex min-h-9 items-center gap-1.5 rounded-full border border-red-300 bg-raised px-3 text-[13px] font-medium text-red-700 hover:border-red-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-focus"
            >
              {dayName(day.date)} · {STATUS[status].label.toLowerCase()}
              {status === 'mismatch' && day.close && (
                <span className="tabular">
                  {' '}
                  ({day.close.difference > 0 ? '+' : '−'}
                  {money(Math.abs(day.close.difference))})
                </span>
              )}
              <ChevronRight className="size-3.5" aria-hidden />
            </button>
          </li>
        ))}
      </ul>
    </Alert>
  )
}

/** Week, month or custom range: one row per day with what came in, the count and its status. */
function CashRangeView({
  from,
  to,
  today,
  onOpen,
}: {
  from: LocalDate
  to: LocalDate
  today: LocalDate
  onOpen: (d: LocalDate) => void
}) {
  const { repo } = useAdminAuth()
  const { data } = useQuery({ queryKey: ['admin', 'cash-range', from, to], queryFn: () => repo.getCashRange(from, to) })
  if (!data) return <Skeleton className="h-64 rounded-lg" aria-busy="true" />
  const rows = data.map((d: CashDay) => ({
    d,
    sum: cashSummary(d.appointments, d.sales),
    status: cashDayStatus(d, today),
  }))
  const totals = rows.reduce((t, r) => ({ total: t.total + r.sum.total, cash: t.cash + r.sum.inByMethod.cash }), {
    total: 0,
    cash: 0,
  })
  const closed = rows.filter((r) => r.d.close).length
  const withActivity = rows.filter((r) => r.status !== 'idle').length
  const flagged = rows.filter((r) => r.status === 'missing' || r.status === 'mismatch').length

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-6">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {(
          [
            ['Cobrado en el periodo', money(totals.total), false],
            ['En efectivo', money(totals.cash), false],
            ['Cortes de caja', `${closed} de ${withActivity}`, false],
            ['Días con alerta', String(flagged), flagged > 0],
          ] as const
        ).map(([k, v, bad]) => (
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

      <Card title="Día por día" description="Toca un día para ver su caja completa." className="min-w-0">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="border-b border-line text-left text-[12px] text-fg-muted">
                <th className="py-2 pr-3 font-medium">Día</th>
                <th className="py-2 pr-3 text-right font-medium">Cobrado</th>
                <th className="py-2 pr-3 text-right font-medium">Efectivo</th>
                <th className="py-2 pr-3 text-right font-medium">Debe haber</th>
                <th className="py-2 pr-3 text-right font-medium">Contado</th>
                <th className="py-2 pr-3 text-right font-medium">Diferencia</th>
                <th className="py-2 font-medium">Estado</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ d, sum, status }) => {
                const bad = status === 'missing' || status === 'mismatch'
                return (
                  <tr
                    key={d.date}
                    className={cn('border-b border-line last:border-0', bad && 'bg-red-100/40')}
                    aria-label={bad ? `${dayName(d.date)}: ${STATUS[status].label}` : undefined}
                  >
                    <td className="py-1.5 pr-3">
                      <button
                        type="button"
                        onClick={() => onOpen(d.date)}
                        className="inline-flex min-h-9 items-center gap-2 rounded-sm font-medium underline-offset-4 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-focus"
                      >
                        {bad && <AlertTriangle className="size-4 shrink-0 text-red-700" aria-hidden />}
                        {dayName(d.date)}
                      </button>
                    </td>
                    <td className="tabular py-1.5 pr-3 text-right">{money(sum.total)}</td>
                    <td className="tabular py-1.5 pr-3 text-right">{money(sum.inByMethod.cash)}</td>
                    <td className="tabular py-1.5 pr-3 text-right">{d.close ? money(d.close.expected) : '—'}</td>
                    <td className="tabular py-1.5 pr-3 text-right">{d.close ? money(d.close.counted) : '—'}</td>
                    <td
                      className={cn(
                        'tabular py-1.5 pr-3 text-right',
                        d.close && d.close.difference !== 0 && 'font-semibold text-red-700',
                      )}
                    >
                      {d.close
                        ? d.close.difference === 0
                          ? money(0)
                          : `${d.close.difference > 0 ? '+' : '−'}${money(Math.abs(d.close.difference))}`
                        : '—'}
                    </td>
                    <td className="py-1.5">
                      <Badge tone={STATUS[status].tone}>{STATUS[status].label}</Badge>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  )
}

/**
 * Ventas › Caja: by day (the drawer, its count and cash moves) or by week,
 * month or custom range (day by day with its status). Days without a close or
 * whose count didn't match are flagged in red, and the last week's ones are
 * listed on top as a preventive notice.
 */
export function CashView() {
  const { period, setPeriod, today, weekStartDay } = usePeriod('day')
  const openDay = (d: LocalDate) => setPeriod(periodAt('day', d, weekStartDay))
  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-6">
      <PeriodPicker value={period} onChange={setPeriod} today={today} weekStartDay={weekStartDay} />
      <RecentWarnings today={today} onOpen={openDay} />
      {period.unit === 'day' ? (
        <CashDayView date={period.from} />
      ) : (
        <CashRangeView from={period.from} to={endSoFar(period, today)} today={today} onOpen={openDay} />
      )}
    </div>
  )
}
