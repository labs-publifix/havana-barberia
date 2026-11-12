import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { FileSpreadsheet, Plus, Trash2 } from 'lucide-react'
import { Alert } from '@/components/ui/Alert'
import { Badge } from '@/components/ui/Badge'
import { buttonClass } from '@/components/ui/buttonClass'
import { Skeleton } from '@/components/ui/Skeleton'
import { business } from '@/config/business'
import type { LocalDate } from '@/domain/types'
import { downloadCsv } from '@/lib/csv'
import { cn } from '@/lib/cn'
import { formatDateLong, formatDay, money } from '@/lib/time'
import { useAdminAuth } from '../auth/AdminAuth'
import { errorMessage } from '../agenda/useAgendaActions'
import type { ExpenseInput, ProfitData } from '../domain'
import { expenseCategories, profitReport, type ExpenseCategory, type ProfitReport } from '../profit'
import { Delta } from '../reports/charts'
import { changePct } from '../reports/metrics'
import { Input, Segmented } from '../ui/controls'
import { DatePicker } from '../ui/DatePicker'
import { Card, PageHeader } from '../ui/Panel'
import { Select } from '../ui/Select'
import { useToast } from '../ui/Toast'
import { comparisonLabel, endSoFar, periodLabel, previousPeriod } from '../period'
import { PeriodPicker } from '../ui/PeriodPicker'
import { usePeriod } from '../usePeriod'

const tz = business.hours.timeZone
type View = 'todo' | 'servicios' | 'productos'
const pctOf = (part: number, whole: number) => (whole > 0 ? Math.round((part / whole) * 100) : 0)

/**
 * Finanzas › Utilidades: for any period, what came into the shop (gross), what
 * went to the barbers (commissions and bonuses) and to expenses, and what was
 * left (net). Also services against products and what sold most.
 */
export default function Profit() {
  const { repo } = useAdminAuth()
  const { period, setPeriod, today, weekStartDay, settings } = usePeriod('month')
  const [view, setView] = useState<View>('todo')
  // What already happened in the period, against the same days of the one before.
  const from = period.from
  const to = endSoFar(period, today)
  const prev = previousPeriod(period, today, weekStartDay)
  const vs = comparisonLabel(period, prev, today)

  const { data, error } = useQuery({
    queryKey: ['admin', 'profit', from, to],
    queryFn: () => repo.getProfit(from, to),
  })
  const { data: before } = useQuery({
    queryKey: ['admin', 'profit', prev.from, prev.to],
    queryFn: () => repo.getProfit(prev.from, prev.to),
  })

  const report = (d: ProfitData, f: LocalDate, t: LocalDate) =>
    profitReport({
      appointments: d.finance.appointments,
      sales: d.finance.sales,
      services: d.finance.services,
      staff: d.finance.staff,
      products: d.products,
      commissions: d.finance.commissions,
      commissionHistory: d.finance.commissionHistory,
      discountCommission: d.finance.settings.discountCommission,
      cardFeePercent: d.finance.settings.cardFeePercent,
      expenses: d.expenses,
      payrollCloses: d.payrollCloses,
      weekStartDay: settings?.weekStartDay ?? 1,
      from: f,
      to: t,
      timeZone: tz,
    })
  const r = data ? report(data, from, to) : null
  const p = before ? report(before, prev.from, prev.to) : null

  const header = (
    <PageHeader
      description={`${periodLabel(period)}, frente a ${vs}.`}
      actions={
        <>
          <PeriodPicker value={period} onChange={setPeriod} today={today} weekStartDay={weekStartDay} />
          <button
            type="button"
            disabled={!r}
            onClick={() => r && data && exportProfit(r, data, from, to)}
            className={buttonClass({ variant: 'secondary', size: 'sm' })}
          >
            <FileSpreadsheet className="size-4" aria-hidden /> Exportar a Excel
          </button>
        </>
      }
    />
  )

  if (error)
    return (
      <div className="grid gap-6">
        {header}
        <Alert tone="danger" title="No se pudieron cargar las utilidades">
          {errorMessage(error)}
        </Alert>
      </div>
    )
  if (!r || !data)
    return (
      <div className="grid gap-6" aria-busy="true">
        {header}
        <Skeleton className="h-72 rounded-lg" />
        <Skeleton className="h-48 rounded-lg" />
      </div>
    )

  // What the summary shows depends on the filter.
  const lines =
    view === 'servicios'
      ? {
          title: 'Servicios',
          gross: r.services.amount,
          prevGross: p?.services.amount,
          commissions: r.services.commission,
          prevCommissions: p?.services.commission,
          expenses: 0,
          prevExpenses: 0,
          net: r.services.amount - r.services.commission,
          prevNet: p ? p.services.amount - p.services.commission : undefined,
        }
      : view === 'productos'
        ? {
            title: 'Productos',
            gross: r.products.amount,
            prevGross: p?.products.amount,
            commissions: r.products.commission,
            prevCommissions: p?.products.commission,
            expenses: r.products.cost,
            prevExpenses: p?.products.cost,
            net: r.products.amount - r.products.commission - r.products.cost,
            prevNet: p ? p.products.amount - p.products.commission - p.products.cost : undefined,
          }
        : {
            title: 'Toda la barbería',
            gross: r.gross,
            prevGross: p?.gross,
            commissions: r.commissions,
            prevCommissions: p?.commissions,
            expenses: r.expenses.total,
            prevExpenses: p?.expenses.total,
            net: r.net,
            prevNet: p?.net,
          }
  const delta = (cur: number, before: number | undefined, upIsGood = true) => (
    <Delta pct={before === undefined ? null : changePct(cur, before)} vs={vs} upIsGood={upIsGood} />
  )
  const servicesShare = pctOf(r.services.amount, r.gross)
  const more =
    r.gross === 0
      ? null
      : r.services.amount >= r.products.amount
        ? `Se vendió más en servicios: ${servicesShare} % de lo que entró.`
        : `Se vendió más en productos: ${100 - servicesShare} % de lo que entró.`

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-6">
      {header}

      <Segmented<View>
        label="Ver"
        value={view}
        onChange={setView}
        options={[
          { value: 'todo', label: 'Todo' },
          { value: 'servicios', label: 'Servicios' },
          { value: 'productos', label: 'Productos' },
        ]}
        className="max-w-full justify-self-start overflow-x-auto"
      />

      <Card title={`Resultado · ${lines.title}`}>
        <dl className="grid gap-0 divide-y divide-line">
          <SummaryRow label="Ingresos brutos" value={money(lines.gross)} delta={delta(lines.gross, lines.prevGross)}>
            {view === 'todo' && (
              <>
                Servicios {money(r.services.amount)} · Productos {money(r.products.amount)}
                {r.tips > 0 && ` · Propinas ${money(r.tips)} (de los barberos, no cuentan)`}
              </>
            )}
          </SummaryRow>
          <SummaryRow
            label={view === 'todo' ? '− Comisiones y bonos' : '− Comisiones'}
            value={money(lines.commissions)}
            delta={delta(lines.commissions, lines.prevCommissions, false)}
          >
            {view === 'todo' && (
              <>
                Servicios {money(r.services.commission)} · Productos {money(r.products.commission)}
                {r.bonuses > 0 && ` · Bonos ${money(r.bonuses)}`}
              </>
            )}
          </SummaryRow>
          {view !== 'servicios' && (
            <SummaryRow
              label={view === 'productos' ? '− Costo de los productos' : '− Gastos'}
              value={money(lines.expenses)}
              delta={delta(lines.expenses, lines.prevExpenses, false)}
            >
              {view === 'todo' && (
                <>
                  Registrados {money(r.expenses.registered)} · Terminal {money(r.expenses.terminal)} · Costo de
                  productos {money(r.expenses.productCost)}
                </>
              )}
            </SummaryRow>
          )}
          <SummaryRow
            strong
            label={view === 'todo' ? '= Utilidad neta' : '= Margen'}
            value={money(lines.net)}
            delta={delta(lines.net, lines.prevNet)}
          >
            {lines.gross > 0 && `${pctOf(lines.net, lines.gross)} % de lo que entró`}
          </SummaryRow>
        </dl>
        {view === 'servicios' && (
          <p className="mt-3 text-[13px] text-fg-muted">Los gastos generales y los bonos se ven en «Todo».</p>
        )}
        <Warnings r={r} view={view} />
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        {view === 'todo' && (
          <Card title="Servicios contra productos" description={more ?? 'Sin ventas en este periodo.'}>
            <ShareBar services={r.services.amount} products={r.products.amount} />
            <dl className="mt-4 grid grid-cols-2 gap-4">
              <div>
                <dt className="text-[13px] text-fg-muted">Servicios</dt>
                <dd className="tabular text-xl font-semibold">{money(r.services.amount)}</dd>
                <dd className="tabular text-[13px] text-fg-muted">
                  {r.services.count} servicios {p && <>· {delta(r.services.amount, p.services.amount)}</>}
                </dd>
              </div>
              <div>
                <dt className="text-[13px] text-fg-muted">Productos</dt>
                <dd className="tabular text-xl font-semibold">{money(r.products.amount)}</dd>
                <dd className="tabular text-[13px] text-fg-muted">
                  {r.products.units} piezas {p && <>· {delta(r.products.amount, p.products.amount)}</>}
                </dd>
              </div>
            </dl>
          </Card>
        )}
        {view !== 'productos' && <Ranking title="Servicios más vendidos" unit="servicios" items={r.topServices} />}
        {view !== 'servicios' && <Ranking title="Productos más vendidos" unit="piezas" items={r.topProducts} />}
      </div>

      <Card title="Por barbero" description="Lo que generó cada uno, su comisión y lo que le deja a la barbería.">
        {r.barbers.length === 0 ? (
          <p className="text-sm text-fg-muted">Sin ventas en este periodo.</p>
        ) : (
          <div className="relative overflow-x-auto">
            <table className="w-full min-w-[520px] text-left text-sm">
              <thead className="text-[13px] text-fg-muted">
                <tr className="border-b border-line">
                  <th className="py-2 pr-3 font-medium">Barbero</th>
                  <th className="py-2 pr-3 text-right font-medium">Servicios</th>
                  <th className="py-2 pr-3 text-right font-medium">Productos</th>
                  <th className="py-2 pr-3 text-right font-medium">Comisión</th>
                  <th className="py-2 text-right font-medium">Deja a la barbería</th>
                </tr>
              </thead>
              <tbody className="tabular">
                {r.barbers.map((b) => (
                  <tr key={b.staffId} className="border-b border-line last:border-0">
                    <td className="py-2.5 pr-3 font-medium">{b.name}</td>
                    <td className="py-2.5 pr-3 text-right">{money(b.services)}</td>
                    <td className="py-2.5 pr-3 text-right">{money(b.products)}</td>
                    <td className="py-2.5 pr-3 text-right">{money(b.commission)}</td>
                    <td className="py-2.5 text-right font-semibold">{money(b.services + b.products - b.commission)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {view === 'todo' && <Expenses data={data} r={r} from={from} to={to} today={today} />}
    </div>
  )
}

function SummaryRow({
  label,
  value,
  delta,
  strong,
  children,
}: {
  label: string
  value: string
  delta: React.ReactNode
  strong?: boolean
  children?: React.ReactNode
}) {
  return (
    <div className="grid gap-1 py-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-baseline sm:gap-4">
      <div className="min-w-0">
        <dt className={cn('text-[15px]', strong ? 'font-semibold' : 'text-fg-muted')}>{label}</dt>
        {children && <p className="text-[13px] text-fg-muted">{children}</p>}
      </div>
      <dd className="grid justify-items-start gap-0.5 sm:justify-items-end">
        <span
          className={cn('tabular font-semibold tracking-[-0.02em]', strong ? 'text-[32px] leading-tight' : 'text-xl')}
        >
          {value}
        </span>
        {delta}
      </dd>
    </div>
  )
}

function Warnings({ r, view }: { r: ProfitReport; view: View }) {
  const notes: string[] = []
  if (r.missingCommissions && view !== 'productos')
    notes.push(
      `${r.missingCommissions} servicio(s) sin comisión capturada: captúrala en Equipo › Comisión para que la utilidad sea exacta.`,
    )
  if (r.products.missingCost && view !== 'servicios')
    notes.push(`${r.products.missingCost} pieza(s) vendidas sin costo capturado (Servicios y precios › Productos).`)
  if (r.openWeeks && view === 'todo')
    notes.push(
      `Los bonos se suman al cerrar cada semana de nómina; faltan ${r.openWeeks} semana(s) por cerrar en este periodo.`,
    )
  if (!notes.length) return null
  return (
    <ul className="mt-3 grid gap-1 text-[13px] text-fg-muted">
      {notes.map((n) => (
        <li key={n}>· {n}</li>
      ))}
    </ul>
  )
}

function ShareBar({ services, products }: { services: number; products: number }) {
  const total = services + products
  const s = pctOf(services, total)
  return (
    <div
      className="flex h-3 w-full overflow-hidden rounded-full bg-fg/[0.06]"
      role="img"
      aria-label={total ? `Servicios ${s} %, productos ${100 - s} %` : 'Sin ventas'}
    >
      {total > 0 && <span className="h-full bg-viz-1" style={{ width: `${s}%` }} />}
      {total > 0 && <span className="h-full bg-viz-2" style={{ width: `${100 - s}%` }} />}
    </div>
  )
}

function Ranking({ title, unit, items }: { title: string; unit: string; items: ProfitReport['topServices'] }) {
  return (
    <Card title={title}>
      {items.length === 0 ? (
        <p className="text-sm text-fg-muted">Sin ventas en este periodo.</p>
      ) : (
        <ol className="grid gap-2">
          {items.slice(0, 6).map((x, i) => (
            <li key={x.id} className="grid grid-cols-[1.5rem_minmax(0,1fr)_auto] items-baseline gap-2 text-sm">
              <span className="tabular text-fg-muted">{i + 1}.</span>
              <span className="truncate font-medium">{x.name}</span>
              <span className="tabular text-right">
                {money(x.amount)}{' '}
                <span className="text-fg-muted">
                  · {x.count} {unit}
                </span>
              </span>
            </li>
          ))}
        </ol>
      )}
    </Card>
  )
}

const methodOptions = [
  { value: 'cash', label: 'Efectivo' },
  { value: 'transfer', label: 'Transferencia' },
  { value: 'card', label: 'Tarjeta' },
]

/** Expenses of the period: registered ones, automatic ones, and drawer withdrawals to count. */
function Expenses({
  data,
  r,
  from,
  to,
  today,
}: {
  data: ProfitData
  r: ProfitReport
  from: LocalDate
  to: LocalDate
  today: LocalDate
}) {
  const { repo } = useAdminAuth()
  const qc = useQueryClient()
  const toast = useToast()
  const blank = (): ExpenseInput => ({
    date: today > to ? to : today,
    category: 'insumos',
    concept: '',
    amount: 0,
    method: 'cash',
  })
  const [form, setForm] = useState<ExpenseInput | null>(null)
  const [amount, setAmount] = useState('')
  const [error, setError] = useState<string | null>(null)
  const refresh = () => qc.invalidateQueries({ queryKey: ['admin', 'profit'] })
  const add = useMutation({
    mutationFn: (input: ExpenseInput) => repo.addExpense(input),
    onSuccess: async () => {
      setForm(null)
      setAmount('')
      setError(null)
      await refresh()
      toast('Gasto registrado')
    },
    onError: (e) => setError(errorMessage(e)),
  })
  const remove = useMutation({
    mutationFn: (id: string) => repo.deleteExpense(id),
    onSuccess: async () => {
      await refresh()
      toast('Gasto eliminado')
    },
  })
  const counted = new Set(data.expenses.map((e) => e.cashMoveId).filter(Boolean))
  const pending = data.cashOuts.filter((m) => !counted.has(m.id))

  return (
    <Card
      title="Gastos"
      description="Registra aquí lo que no sale de la caja (renta, luz, internet, insumos…). Las salidas de caja solo cuentan si las marcas como gasto, porque muchas son pagos a barberos o retiros."
      actions={
        !form && (
          <button
            type="button"
            onClick={() => {
              setForm(blank())
              setAmount('')
            }}
            className={buttonClass({ size: 'sm' })}
          >
            <Plus className="size-4" aria-hidden /> Registrar gasto
          </button>
        )
      }
    >
      <div className="grid gap-5">
        <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            ['Total', r.expenses.total],
            ['Registrados', r.expenses.registered],
            ['Comisión de terminal', r.expenses.terminal],
            ['Costo de productos', r.expenses.productCost],
          ].map(([label, value]) => (
            <div key={label} className="rounded-md bg-fg/[0.03] p-3">
              <dt className="text-[13px] text-fg-muted">{label}</dt>
              <dd className="tabular text-lg font-semibold">{money(value as number)}</dd>
            </div>
          ))}
        </dl>

        {form && (
          <form
            className="grid gap-3 rounded-md border border-line p-4 sm:grid-cols-2"
            onSubmit={(e) => {
              e.preventDefault()
              add.mutate({ ...form, amount: Number(amount) || 0 })
            }}
          >
            <Input
              label="Concepto"
              value={form.concept}
              onChange={(e) => setForm({ ...form, concept: e.target.value })}
            />
            <Input
              label="Monto"
              prefix="$"
              inputMode="numeric"
              value={amount}
              onChange={(e) => setAmount(e.target.value.replace(/\D/g, '').slice(0, 7))}
            />
            <Select
              label="Categoría"
              value={form.category}
              onValueChange={(v) => setForm({ ...form, category: v as ExpenseCategory })}
              options={Object.entries(expenseCategories).map(([value, label]) => ({ value, label }))}
            />
            <Select
              label="Cómo se pagó"
              value={form.method}
              onValueChange={(v) => setForm({ ...form, method: v as ExpenseInput['method'] })}
              options={methodOptions}
            />
            <DatePicker
              label="Fecha"
              value={form.date}
              today={today}
              onChange={(d) => setForm({ ...form, date: d > today ? today : d })}
              className="min-w-0 grid-cols-[minmax(0,1fr)]"
            />
            {error && (
              <div className="sm:col-span-2">
                <Alert tone="danger" title={error} />
              </div>
            )}
            <div className="flex flex-wrap gap-2 sm:col-span-2">
              <button type="submit" disabled={add.isPending} className={buttonClass({ size: 'sm' })}>
                {add.isPending ? 'Guardando…' : 'Guardar gasto'}
              </button>
              <button
                type="button"
                onClick={() => {
                  setForm(null)
                  setError(null)
                }}
                className={buttonClass({ variant: 'secondary', size: 'sm' })}
              >
                Cancelar
              </button>
            </div>
          </form>
        )}

        {r.expenses.byCategory.length > 0 && (
          <ul className="grid gap-1 text-sm">
            {r.expenses.byCategory.map((c) => (
              <li key={c.category} className="flex justify-between gap-3">
                <span className="text-fg-muted">{expenseCategories[c.category]}</span>
                <span className="tabular">{money(c.amount)}</span>
              </li>
            ))}
          </ul>
        )}

        <div>
          <h3 className="mb-2 text-[13px] font-semibold uppercase tracking-[0.08em] text-fg-muted">
            Gastos registrados ({data.expenses.length})
          </h3>
          {data.expenses.length === 0 ? (
            <p className="text-sm text-fg-muted">Todavía no hay gastos en este periodo.</p>
          ) : (
            <ul className="divide-y divide-line">
              {data.expenses.map((e) => (
                <li key={e.id} className="flex items-center gap-3 py-2 text-sm">
                  <span className="tabular w-16 shrink-0 text-fg-muted">{formatDay(e.date, 'd MMM')}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{e.concept}</span>
                    <span className="block truncate text-[13px] text-fg-muted">
                      {expenseCategories[e.category]}
                      {e.cashMoveId ? ' · de la caja' : ''}
                    </span>
                  </span>
                  <span className="tabular font-semibold">{money(e.amount)}</span>
                  <button
                    type="button"
                    aria-label={`Eliminar el gasto ${e.concept}`}
                    disabled={remove.isPending}
                    onClick={() => remove.mutate(e.id)}
                    className="grid size-10 shrink-0 place-items-center rounded-full text-fg-muted hover:bg-fg/5 hover:text-fg-danger focus-visible:outline focus-visible:outline-2 focus-visible:outline-focus"
                  >
                    <Trash2 className="size-4" aria-hidden />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {data.cashOuts.length > 0 && (
          <div>
            <h3 className="mb-2 text-[13px] font-semibold uppercase tracking-[0.08em] text-fg-muted">
              Salidas de caja del periodo
            </h3>
            <ul className="divide-y divide-line">
              {data.cashOuts.map((m) => (
                <li key={m.id} className="flex items-center gap-3 py-2 text-sm">
                  <span className="tabular w-16 shrink-0 text-fg-muted">{formatDay(m.date, 'd MMM')}</span>
                  <span className="min-w-0 flex-1 truncate">{m.concept}</span>
                  <span className="tabular">{money(m.amount)}</span>
                  {counted.has(m.id) ? (
                    <Badge tone="success">Cuenta como gasto</Badge>
                  ) : (
                    <button
                      type="button"
                      onClick={() => {
                        setForm({
                          date: m.date,
                          category: 'insumos',
                          concept: m.concept,
                          amount: m.amount,
                          method: 'cash',
                          cashMoveId: m.id,
                        })
                        setAmount(String(m.amount))
                      }}
                      className={buttonClass({ variant: 'secondary', size: 'sm' })}
                    >
                      Contar como gasto
                    </button>
                  )}
                </li>
              ))}
            </ul>
            {pending.length > 0 && (
              <p className="mt-2 text-[13px] text-fg-muted">
                {pending.length} salida(s) sin marcar: no se restan de la utilidad.
              </p>
            )}
          </div>
        )}
        <p className="text-[13px] text-fg-muted">
          Periodo: {formatDateLong(from)} – {formatDateLong(to)}.
        </p>
      </div>
    </Card>
  )
}

function exportProfit(r: ProfitReport, data: ProfitData, from: LocalDate, to: LocalDate) {
  const rows: (string | number)[][] = [
    ['Utilidades Havana Barbería', `${from} a ${to}`],
    [],
    ['Concepto', 'Monto'],
    ['Ingresos por servicios', r.services.amount],
    ['Ingresos por productos', r.products.amount],
    ['Ingresos brutos', r.gross],
    ['Comisiones de servicios', r.services.commission],
    ['Comisiones de productos', r.products.commission],
    ['Bonos (semanas cerradas)', r.bonuses],
    ['Gastos registrados', r.expenses.registered],
    ['Comisión de terminal', r.expenses.terminal],
    ['Costo de productos vendidos', r.expenses.productCost],
    ['Utilidad neta', r.net],
    ['Propinas (de los barberos, no cuentan)', r.tips],
    [],
    ['Servicios más vendidos', 'Cantidad', 'Monto'],
    ...r.topServices.map((s) => [s.name, s.count, s.amount]),
    [],
    ['Productos más vendidos', 'Piezas', 'Monto'],
    ...r.topProducts.map((s) => [s.name, s.count, s.amount]),
    [],
    ['Barbero', 'Servicios', 'Productos', 'Comisión', 'Deja a la barbería'],
    ...r.barbers.map((b) => [b.name, b.services, b.products, b.commission, b.services + b.products - b.commission]),
    [],
    ['Gastos registrados', 'Fecha', 'Categoría', 'Forma de pago', 'Monto'],
    ...data.expenses.map((e) => [e.concept, e.date, expenseCategories[e.category], e.method, e.amount]),
  ]
  downloadCsv(`utilidades-${from}-a-${to}.csv`, rows)
}
