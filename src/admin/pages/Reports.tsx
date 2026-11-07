import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { FileSpreadsheet } from 'lucide-react'
import { Alert } from '@/components/ui/Alert'
import { Skeleton } from '@/components/ui/Skeleton'
import { business } from '@/config/business'
import type { AppointmentSource } from '@/domain/types'
import { addDays, capitalize, formatDay, localDate, localTime, money } from '@/lib/time'
import { useAdminAuth } from '../auth/AdminAuth'
import { comparison, dailySales, periodStats } from '../finance'
import { downloadCsv } from '@/lib/csv'
import { buttonClass } from '@/components/ui/buttonClass'
import { methodLabels, productsTotalOf } from '../cash'
import type { AdminFinance } from '../domain'
import { useFinanceWeek } from '../useFinanceWeek'
import { Segmented } from '../ui/controls'
import { Card, PageHeader, StatCard } from '../ui/Panel'

const tz = business.hours.timeZone
type Period = 'semana' | 'mes'

const sourceLabels: Record<AppointmentSource, string> = {
  online: 'En línea',
  panel: 'Desde el panel',
  walk_in: 'Sin cita',
}

/** Reportes (phase-2 preview): sales and appointments for the week or the last four weeks. */
export default function Reports() {
  const { repo } = useAdminAuth()
  const today = localDate(new Date(), tz)
  const [period, setPeriod] = useState<Period>('semana')
  const { current } = useFinanceWeek()
  const from = period === 'semana' ? current : addDays(current, -21)
  const to = today
  const { data } = useQuery({ queryKey: ['admin', 'finance', from, to], queryFn: () => repo.getFinance(from, to) })
  // Same number of days, one period earlier.
  const back = period === 'semana' ? 7 : 28
  const prevFrom = addDays(from, -back)
  const prevTo = addDays(to, -back)
  const { data: prev } = useQuery({
    queryKey: ['admin', 'finance', prevFrom, prevTo],
    queryFn: () => repo.getFinance(prevFrom, prevTo),
  })
  const vs = period === 'semana' ? 'la semana anterior' : 'las 4 semanas anteriores'

  const header = (
    <PageHeader
      description="Cómo va el negocio: ventas, citas y desempeño por barbero."
      actions={
        <>
          <button
            type="button"
            disabled={!data}
            onClick={() => data && exportTickets(data, from, to)}
            className={buttonClass({ variant: 'secondary', size: 'sm' })}
          >
            <FileSpreadsheet className="size-4" aria-hidden /> Exportar a Excel
          </button>
          <Segmented<Period>
            label="Periodo"
            value={period}
            onChange={setPeriod}
            options={[
              { value: 'semana', label: 'Esta semana' },
              { value: 'mes', label: 'Últimas 4 semanas' },
            ]}
          />
        </>
      }
    />
  )
  if (!data) {
    return (
      <div className="grid gap-6">
        {header}
        <Skeleton className="h-72 rounded-lg" aria-busy="true" />
      </div>
    )
  }

  const nowIso = new Date().toISOString()
  const stats = periodStats(data.appointments, data.sales, nowIso)
  // Compared up to the same moment of the previous period (today counts only what already happened).
  const prevNow = new Date(Date.now() - back * 86400000).toISOString()
  const before = prev ? periodStats(prev.appointments, prev.sales, prevNow) : null
  const done = data.appointments.filter((a) => a.startsAt <= nowIso && a.status === 'completed')
  const days = dailySales(data.appointments, from, to, tz)
  const max = Math.max(1, ...days.map((d) => d.sales))

  const byBarber = data.staff
    .map((s) => {
      const mine = done.filter((a) => a.staffId === s.id)
      const sales = mine.reduce((t, a) => t + (a.payment?.amount ?? a.totalPrice), 0)
      return {
        id: s.id,
        name: s.name,
        count: mine.length,
        sales,
        avg: mine.length ? Math.round(sales / mine.length) : 0,
      }
    })
    .filter((r) => r.count > 0)

  const svcCount = new Map<string, number>()
  for (const a of done) for (const id of a.serviceIds) svcCount.set(id, (svcCount.get(id) ?? 0) + 1)
  const top = [...svcCount.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([id, n]) => ({ name: data.services.find((s) => s.id === id)?.name ?? 'Servicio', n }))

  const sources = (['online', 'panel', 'walk_in'] as const).map((k) => ({
    k,
    n: data.appointments.filter((a) => (a.source ?? 'online') === k && a.status !== 'cancelled').length,
  }))
  const sourceTotal = Math.max(
    1,
    sources.reduce((t, s) => t + s.n, 0),
  )

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-6">
      {header}
      <Alert tone="info" title="Adelanto de la fase 2">
        Indicadores con datos de demostración. Cada cifra se compara con el mismo número de días del periodo anterior.
        «Exportar a Excel» descarga los tickets del periodo.
      </Alert>
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard
          label="Ventas"
          value={money(stats.sales)}
          detail={(before && comparison(stats.sales, before.sales, vs)) ?? `${money(stats.products)} en productos`}
        />
        <StatCard
          label="Citas completadas"
          value={String(stats.done)}
          detail={before ? comparison(stats.done, before.done, vs) : null}
        />
        <StatCard
          label="Ticket promedio"
          value={money(stats.avgTicket)}
          detail={before ? comparison(stats.avgTicket, before.avgTicket, vs) : null}
        />
        <StatCard
          label="No-shows"
          value={`${stats.noShowRate}%`}
          detail={
            before?.started
              ? `${stats.noShows} de ${stats.started} citas · antes ${before.noShowRate}%`
              : `${stats.noShows} de ${stats.started} citas`
          }
        />
      </div>

      <Card title="Ventas por día" description="Servicios cobrados." className="min-w-0">
        <div
          className="flex h-48 items-end gap-1"
          role="img"
          aria-label="Gráfica de ventas por día; los datos están en la tabla siguiente"
        >
          {days.map((d) => (
            <div
              key={d.date}
              className="flex h-full min-w-0 flex-1 flex-col justify-end"
              title={`${formatDay(d.date, "EEE d 'de' MMM")}: ${money(d.sales)}`}
            >
              <div
                className="mx-auto w-full max-w-12 rounded-t-sm bg-ink-950"
                style={{ height: `${(d.sales / max) * 100}%`, minHeight: d.sales ? 2 : 0 }}
              />
            </div>
          ))}
        </div>
        <div className="mt-2 flex justify-between text-[12px] text-fg-muted" aria-hidden>
          <span>{capitalize(formatDay(from, "EEE d 'de' MMM"))}</span>
          <span>{capitalize(formatDay(to, "EEE d 'de' MMM"))}</span>
        </div>
        <details className="mt-3 text-sm">
          <summary className="cursor-pointer text-fg-muted hover:text-fg">Ver como tabla</summary>
          <table className="mt-2 w-full">
            <caption className="sr-only">Ventas por día</caption>
            <tbody className="divide-y divide-line">
              {days.map((d) => (
                <tr key={d.date}>
                  <th scope="row" className="py-1.5 text-left font-normal">
                    {capitalize(formatDay(d.date, "EEE d 'de' MMM"))}
                  </th>
                  <td className="tabular py-1.5 text-right">{d.count} citas</td>
                  <td className="tabular py-1.5 text-right">{money(d.sales)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </details>
      </Card>

      <div className="grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-2">
        <Card title="Desempeño por barbero" className="min-w-0" bodyClassName="p-0">
          <ul className="divide-y divide-line" aria-label="Desempeño por barbero">
            {byBarber.map((r) => (
              <li key={r.id} className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-4 px-5 py-3 text-sm">
                <span className="font-medium">{r.name}</span>
                <span className="tabular text-right font-semibold">{money(r.sales)}</span>
                <span className="text-[13px] text-fg-muted">{r.count} citas</span>
                <span className="tabular text-right text-[13px] text-fg-muted">Promedio {money(r.avg)}</span>
              </li>
            ))}
          </ul>
        </Card>
        <Card title="Servicios más pedidos" className="min-w-0">
          <ol className="grid gap-3">
            {top.map((t) => (
              <li key={t.name} className="grid gap-1 text-sm">
                <span className="flex justify-between gap-3">
                  <span className="truncate">{t.name}</span>
                  <span className="tabular text-fg-muted">{t.n}</span>
                </span>
                <span className="h-1.5 rounded-full bg-fg/[0.06]">
                  <span
                    className="block h-full rounded-full bg-ink-950"
                    style={{ width: `${(t.n / (top[0]?.n ?? 1)) * 100}%` }}
                  />
                </span>
              </li>
            ))}
          </ol>
        </Card>
        <Card title="Cómo llegan las citas" className="min-w-0 lg:col-span-2">
          <ul className="grid gap-3 sm:grid-cols-3">
            {sources.map((s) => (
              <li key={s.k} className="rounded-md border border-line p-4">
                <p className="text-[13px] text-fg-muted">{sourceLabels[s.k]}</p>
                <p className="tabular text-xl font-semibold">{Math.round((s.n / sourceTotal) * 100)}%</p>
                <p className="text-[13px] text-fg-muted">{s.n} citas</p>
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </div>
  )
}

/** Every ticket of the period as a spreadsheet (one row per ticket). */
function exportTickets(data: AdminFinance, from: string, to: string) {
  const name = (id: string | null) => data.staff.find((s) => s.id === id)?.name ?? 'Mostrador'
  const svc = (id: string) => data.services.find((s) => s.id === id)?.name ?? 'Servicio'
  const pay = (p: {
    method: keyof typeof methodLabels
    splits?: { method: keyof typeof methodLabels; amount: number }[]
  }) =>
    p.splits?.length ? p.splits.map((x) => `${methodLabels[x.method]} ${x.amount}`).join(' + ') : methodLabels[p.method]
  const rows: (string | number)[][] = [
    [
      'Fecha',
      'Hora',
      'Tipo',
      'Cliente',
      'Barbero',
      'Detalle',
      'Servicios',
      'Productos',
      'Descuento',
      'Corte gratis',
      'Propina',
      'Total',
      'Forma de pago',
    ],
  ]
  for (const a of data.appointments) {
    const p = a.payment
    if (a.status !== 'completed' || !p) continue
    const products = productsTotalOf(p)
    rows.push([
      localDate(p.paidAt, tz),
      localTime(p.paidAt, tz),
      'Cita',
      a.customer.name,
      name(a.staffId),
      [...a.serviceIds.map(svc), ...(p.products ?? []).map((i) => `${i.qty} × ${i.name}`)].join(' + '),
      p.amount,
      products,
      p.discount?.amount ?? 0,
      p.rewardAmount ?? 0,
      p.tip,
      p.amount + products + p.tip,
      pay(p),
    ])
  }
  for (const s of data.sales) {
    rows.push([
      localDate(s.at, tz),
      localTime(s.at, tz),
      'Venta de productos',
      '',
      name(s.staffId),
      s.items.map((i) => `${i.qty} × ${i.name}`).join(' + '),
      0,
      s.total,
      0,
      0,
      0,
      s.total,
      methodLabels[s.method],
    ])
  }
  const [head, ...body] = rows
  body.sort((x, y) => `${x[0]} ${x[1]}`.localeCompare(`${y[0]} ${y[1]}`))
  downloadCsv(`ventas-havana-${from}-a-${to}.csv`, [head!, ...body])
}
