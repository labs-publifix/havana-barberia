import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { FileSpreadsheet } from 'lucide-react'
import { buttonClass } from '@/components/ui/buttonClass'
import { Skeleton } from '@/components/ui/Skeleton'
import { business } from '@/config/business'
import { downloadCsv } from '@/lib/csv'
import {
  addDays,
  capitalize,
  daysBetween,
  formatDateLong,
  formatDay,
  localDate,
  localTime,
  money,
  toMinutes,
} from '@/lib/time'
import { useAdminAuth } from '../auth/AdminAuth'
import { cashSummary, methodLabels, productsTotalOf } from '../cash'
import type { AdminFinance } from '../domain'
import { Delta, DailyColumns, DemandHeatmap, RankedBars, SplitBar, StatTile } from '../reports/charts'
import {
  bySource,
  changePct,
  customersServed,
  demandGrid,
  occupancy,
  salesByBarber,
  salesByDay,
  topServices,
} from '../reports/metrics'
import { useFinanceWeek } from '../useFinanceWeek'
import { Segmented } from '../ui/controls'
import { DatePicker } from '../ui/DatePicker'
import { Card, PageHeader } from '../ui/Panel'
import { useBusinessHours } from '@/app/queries'
import type { LocalDate, WeeklySchedule } from '@/domain/types'

const tz = business.hours.timeZone
type Period = 'semana' | 'pasada' | 'mes' | 'rango'
/** A custom range covers up to about three months (the daily chart stays readable). */
const MAX_RANGE_DAYS = 92

/** Opening hours of the shop, as whole hours (columns of the demand map). */
function hourColumns(weekly: WeeklySchedule): number[] {
  const all = weekly.flat()
  if (!all.length) return []
  const start = Math.floor(Math.min(...all.map((r) => toMinutes(r.start))) / 60)
  const end = Math.ceil(Math.max(...all.map((r) => toMinutes(r.end))) / 60)
  return Array.from({ length: end - start }, (_, i) => start + i)
}

/**
 * Reportes: how the business is doing for a period against the one before it
 * (same number of days, up to the same moment). KPIs with trend, sales per
 * day, barbers, services, payment methods, channels and busiest hours.
 */
export default function Reports() {
  const { repo } = useAdminAuth()
  const shop = useBusinessHours()
  const HOURS = useMemo(() => hourColumns(shop.weekly), [shop.weekly])
  const today = localDate(new Date(), tz)
  const [period, setPeriod] = useState<Period>('semana')
  const { current } = useFinanceWeek()
  const [range, setRange] = useState<{ from: LocalDate; to: LocalDate }>(() => ({
    from: addDays(today, -29),
    to: today,
  }))
  const from =
    period === 'rango'
      ? range.from
      : period === 'semana'
        ? current
        : period === 'pasada'
          ? addDays(current, -7)
          : addDays(current, -21)
  const to = period === 'rango' ? range.to : period === 'pasada' ? addDays(current, -1) : today
  // Compared with the same number of days right before.
  const back = period === 'rango' ? daysBetween(from, to) + 1 : period === 'mes' ? 28 : 7
  const prevFrom = addDays(from, -back)
  const prevTo = addDays(to, -back)
  const vs =
    period === 'rango'
      ? `los ${back} ${back === 1 ? 'día anterior' : 'días anteriores'}`
      : period === 'mes'
        ? 'las 4 semanas anteriores'
        : 'la semana anterior'
  /** Keep the range valid: start ≤ end, up to MAX_RANGE_DAYS, nothing after today. */
  const setFrom = (d: LocalDate) =>
    setRange((r) => {
      const to = r.to < d ? d : daysBetween(d, r.to) >= MAX_RANGE_DAYS ? addDays(d, MAX_RANGE_DAYS - 1) : r.to
      return { from: d, to: to > today ? today : to }
    })
  const setTo = (d: LocalDate) =>
    setRange((r) => {
      const from =
        r.from > d ? d : daysBetween(r.from, d) >= MAX_RANGE_DAYS ? addDays(d, -(MAX_RANGE_DAYS - 1)) : r.from
      return { from, to: d > today ? today : d }
    })
  const { data } = useQuery({ queryKey: ['admin', 'finance', from, to], queryFn: () => repo.getFinance(from, to) })
  const { data: prev } = useQuery({
    queryKey: ['admin', 'finance', prevFrom, prevTo],
    queryFn: () => repo.getFinance(prevFrom, prevTo),
  })

  const header = (
    <PageHeader
      description={
        period === 'rango'
          ? `Del ${formatDateLong(from)} al ${formatDateLong(to)}, frente a ${vs}. Hasta ${MAX_RANGE_DAYS} días por consulta.`
          : 'Cómo va el negocio frente al periodo anterior, con el mismo número de días.'
      }
      actions={
        <>
          <Segmented<Period>
            label="Periodo"
            value={period}
            onChange={setPeriod}
            options={[
              { value: 'semana', label: 'Esta semana' },
              { value: 'pasada', label: 'Semana pasada' },
              { value: 'mes', label: '4 semanas' },
              { value: 'rango', label: 'Rango' },
            ]}
            className="max-w-full overflow-x-auto"
          />
          {period === 'rango' && (
            <div
              className="grid w-full grid-cols-2 items-end gap-2 sm:flex sm:w-auto"
              role="group"
              aria-label="Rango de fechas"
            >
              <DatePicker
                label="Desde"
                value={range.from}
                onChange={setFrom}
                today={today}
                className="min-w-0 grid-cols-[minmax(0,1fr)] sm:w-[168px]"
              />
              <DatePicker
                label="Hasta"
                value={range.to}
                onChange={setTo}
                today={today}
                min={range.from}
                className="min-w-0 grid-cols-[minmax(0,1fr)] sm:w-[168px]"
              />
            </div>
          )}
          <button
            type="button"
            disabled={!data}
            onClick={() => data && exportTickets(data, from, to)}
            className={buttonClass({ variant: 'secondary', size: 'sm' })}
          >
            <FileSpreadsheet className="size-4" aria-hidden /> Exportar a Excel
          </button>
        </>
      }
    />
  )

  if (!data || !prev) {
    return (
      <div className="grid gap-6">
        {header}
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-5" aria-busy="true">
          {Array.from({ length: 5 }, (_, i) => (
            <Skeleton key={i} className="h-36 rounded-lg" />
          ))}
        </div>
        <Skeleton className="h-72 rounded-lg" />
      </div>
    )
  }

  // Only what already happened counts; the previous period up to the same moment.
  const nowIso = new Date().toISOString()
  const prevNowIso = new Date(Date.now() - back * 86400000).toISOString()
  const cur = data.appointments.filter((a) => a.startsAt <= nowIso)
  const old = prev.appointments.filter((a) => a.startsAt <= prevNowIso)
  const days = salesByDay(cur, data.sales, from, to, tz)
  const prevDays = salesByDay(
    old,
    prev.sales.filter((s) => s.at <= prevNowIso),
    prevFrom,
    prevTo,
    tz,
  )
  const sum = (d: typeof days, k: 'sales' | 'done') => d.reduce((t, x) => t + x[k], 0)
  const sales = sum(days, 'sales')
  const done = sum(days, 'done')
  const prevSales = sum(prevDays, 'sales')
  const prevDone = sum(prevDays, 'done')
  const avg = done ? Math.round(sales / done) : 0
  const prevAvg = prevDone ? Math.round(prevSales / prevDone) : 0
  const noShowRate = (list: typeof cur) => {
    const started = list.filter((a) => a.status !== 'cancelled' && a.status !== 'booked' && a.status !== 'confirmed')
    const ns = started.filter((a) => a.status === 'no_show').length
    return { pct: started.length ? Math.round((ns / started.length) * 100) : 0, n: ns, of: started.length }
  }
  const ns = noShowRate(cur)
  const prevNs = noShowRate(old)
  const occTo = to < today ? to : addDays(today, -1) >= from ? addDays(today, -1) : from
  const occ = occupancy(cur, data.staff, from, occTo, tz)
  const prevOcc = occupancy(old, prev.staff, prevFrom, addDays(occTo, -back), tz)
  const people = customersServed(cur, old)
  const barbers = salesByBarber(cur, old, data.staff)
  const services = topServices(cur, data.services)
  const cash = cashSummary(cur, data.sales)
  const sources = bySource(data.appointments)
  const grid = demandGrid(data.appointments, tz, HOURS)

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-6">
      {header}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-6">
        <StatTile
          className="lg:col-span-3"
          label="Ventas"
          value={money(sales)}
          delta={<Delta pct={changePct(sales, prevSales)} vs={vs} />}
          spark={days.map((d) => d.sales)}
          hint={`Servicios y productos, sin propinas`}
        />
        <StatTile
          className="lg:col-span-3"
          label="Citas completadas"
          value={String(done)}
          delta={<Delta pct={changePct(done, prevDone)} vs={vs} />}
          spark={days.map((d) => d.done)}
          hint={`${people.served} clientes · ${people.returning} repiten`}
        />
        <StatTile
          className="lg:col-span-2"
          label="Ticket promedio"
          value={money(avg)}
          delta={<Delta pct={changePct(avg, prevAvg)} vs={vs} />}
        />
        <StatTile
          className="lg:col-span-2"
          label="Ocupación"
          value={`${occ.pct} %`}
          delta={<Delta pct={prevOcc.pct ? occ.pct - prevOcc.pct : null} unit="pts" vs={vs} />}
          hint="Tiempo agendado sobre el horario de los barberos"
        />
        <StatTile
          className="sm:col-span-2 lg:col-span-2"
          label="No-shows"
          value={`${ns.pct} %`}
          delta={<Delta pct={prevNs.of ? ns.pct - prevNs.pct : null} unit="pts" upIsGood={false} vs={vs} />}
          hint={`${ns.n} de ${ns.of} citas`}
        />
      </div>

      <Card
        title="Ventas por día"
        description={`Servicios y productos cobrados, junto al mismo día de ${vs}.`}
        className="min-w-0"
      >
        <DailyColumns days={days} previous={prevDays} vs={vs} />
        <details className="mt-4 text-sm">
          <summary className="cursor-pointer text-fg-muted hover:text-fg">Ver como tabla</summary>
          <div className="relative mt-2 overflow-x-auto">
            <table className="w-full min-w-[360px]">
              <caption className="sr-only">Ventas por día</caption>
              <thead>
                <tr className="text-left text-[13px] text-fg-muted">
                  <th scope="col" className="py-1.5 font-medium">
                    Día
                  </th>
                  <th scope="col" className="py-1.5 text-right font-medium">
                    Citas
                  </th>
                  <th scope="col" className="py-1.5 text-right font-medium">
                    Ventas
                  </th>
                  <th scope="col" className="py-1.5 text-right font-medium">
                    {capitalize(vs)}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {days.map((d, i) => (
                  <tr key={d.date}>
                    <th scope="row" className="py-1.5 text-left font-normal">
                      {capitalize(formatDay(d.date, "EEE d 'de' MMM"))}
                    </th>
                    <td className="tabular py-1.5 text-right">{d.done}</td>
                    <td className="tabular py-1.5 text-right">{money(d.sales)}</td>
                    <td className="tabular py-1.5 text-right text-fg-muted">{money(prevDays[i]?.sales ?? 0)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      </Card>

      <div className="grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-2">
        <Card title="Ventas por barbero" description="Ordenado de mayor a menor." className="min-w-0">
          {barbers.length ? (
            <RankedBars
              label="Ventas por barbero"
              rows={barbers.map((b) => ({
                id: b.id,
                name: b.name,
                value: b.sales,
                extra: (
                  <span className="flex flex-wrap gap-x-3 gap-y-1">
                    <span>
                      {b.done} citas · ticket {money(b.avg)} · ocupación {occ.byStaff.get(b.id) ?? 0} %
                    </span>
                    <Delta pct={changePct(b.sales, b.prevSales)} vs={vs} />
                  </span>
                ),
              }))}
            />
          ) : (
            <p className="text-sm text-fg-muted">Sin citas completadas en este periodo.</p>
          )}
        </Card>
        <Card title="Servicios más pedidos" description="Veces que se hizo cada servicio." className="min-w-0">
          {services.length ? (
            <RankedBars
              label="Servicios más pedidos"
              format={(n) => `${n} ${n === 1 ? 'vez' : 'veces'}`}
              rows={services.map((s) => ({
                id: s.id,
                name: s.name,
                value: s.n,
                extra: `${money(s.revenue)} a precio de lista`,
              }))}
            />
          ) : (
            <p className="text-sm text-fg-muted">Sin servicios completados en este periodo.</p>
          )}
        </Card>
        <Card
          title="Formas de pago"
          description="Lo cobrado por cada forma (pagos mixtos repartidos)."
          className="min-w-0"
        >
          <SplitBar
            label="Formas de pago"
            parts={(['cash', 'card', 'transfer'] as const).map((m) => ({
              key: m,
              name: methodLabels[m],
              value: cash.charges[m],
              detail: cash.tips[m] ? `+ ${money(cash.tips[m])} propinas` : undefined,
            }))}
          />
        </Card>
        <Card
          title="Cómo llegan las citas"
          description="Citas agendadas en el periodo (sin canceladas)."
          className="min-w-0"
        >
          <SplitBar
            label="Cómo llegan las citas"
            format={(n) => `${n} citas`}
            parts={[
              { key: 'online', name: 'Reserva en línea', value: sources.online },
              { key: 'panel', name: 'Por teléfono o WhatsApp (panel)', value: sources.panel },
              { key: 'walk_in', name: 'Sin cita', value: sources.walk_in },
            ]}
          />
        </Card>
        <Card
          title="Días y horas con más citas"
          description="Para decidir turnos y promociones. Más oscuro, más citas."
          className="min-w-0 lg:col-span-2"
        >
          <DemandHeatmap grid={grid} hours={HOURS} />
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
