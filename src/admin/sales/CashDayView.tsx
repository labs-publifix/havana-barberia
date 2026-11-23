import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Lock, Trash2 } from 'lucide-react'
import { Alert } from '@/components/ui/Alert'
import { Badge } from '@/components/ui/Badge'
import { buttonClass } from '@/components/ui/buttonClass'
import { Skeleton } from '@/components/ui/Skeleton'
import { business } from '@/config/business'
import { cn } from '@/lib/cn'
import type { LocalDate } from '@/domain/types'
import { capitalize, formatDateLong, formatTime12, localDate, localTime, money } from '@/lib/time'
import { useAdminAuth, useAdminSession } from '../auth/AdminAuth'
import { errorMessage } from '../agenda/useAgendaActions'
import { cashDayStatus, cashSummary, closeBalanced, closeLines, methodLabels, productsSold } from '../cash'
import { expectedCash } from '../finance'
import { Input, Segmented } from '../ui/controls'
import { Card } from '../ui/Panel'
import { useToast } from '../ui/Toast'
import { isFinanceRole } from '../domain'
import { DayTips } from '../closes/DayTips'

const tz = business.hours.timeZone
const digits = (v: string) => v.replace(/\D/g, '').slice(0, 8)

const CAPTURE_LABEL = {
  cash: 'Efectivo contado',
  card: 'Tarjeta (cierre de la terminal)',
  transfer: 'Transferencias recibidas',
} as const

interface Line {
  method: 'cash' | 'card' | 'transfer'
  label: string
  expected: number | null
  counted: number | null
  difference: number | null
}

/** «faltan $50» / «sobran $20». */
const diffText = (d: number) => (d > 0 ? `sobran ${money(d)}` : `faltan ${money(-d)}`)

/** «faltan $50 en transferencias, sobran $20 en tarjeta». */
const mismatchText = (c: Parameters<typeof closeLines>[0]) =>
  closeLines(c)
    .filter((l) => l.difference)
    .map((l) => `${diffText(l.difference!)} en ${l.label.toLowerCase()}`)
    .join(', ')

/**
 * Caja del día: what came in by method, cash taken out or put in, and the
 * count (arqueo) that closes the drawer. A closed day can't change unless the
 * owner or a manager reopens it.
 */
export function CashDayView({ date }: { date: LocalDate }) {
  const { repo } = useAdminAuth()
  const { user } = useAdminSession()
  const canReopen = isFinanceRole(user.role)
  const qc = useQueryClient()
  const toast = useToast()
  const today = localDate(new Date(), tz)
  const { data } = useQuery({ queryKey: ['admin', 'cash-day', date], queryFn: () => repo.getCashDay(date) })
  const [move, setMove] = useState({ kind: 'out' as 'out' | 'in', amount: '', concept: '' })
  const [count, setCount] = useState({ fund: '', counted: '', card: '', transfer: '', note: '' })
  const [error, setError] = useState<string | null>(null)

  const refresh = () => qc.invalidateQueries({ queryKey: ['admin'] })
  const onError = (e: unknown) => setError(errorMessage(e))
  const addMove = useMutation({
    mutationFn: () => repo.addCashMove({ date, kind: move.kind, amount: Number(move.amount), concept: move.concept }),
    onSuccess: async () => {
      setMove((m) => ({ ...m, amount: '', concept: '' }))
      setError(null)
      await refresh()
    },
    onError,
  })
  const delMove = useMutation({ mutationFn: (id: string) => repo.deleteCashMove(id), onSuccess: refresh, onError })
  const close = useMutation({
    mutationFn: () =>
      repo.closeDay({
        date,
        openingFund: Number(count.fund || 0),
        counted: Number(count.counted),
        cardCounted: Number(count.card),
        transferCounted: Number(count.transfer),
        note: count.note,
      }),
    onSuccess: async (c) => {
      setError(null)
      setCount({ fund: '', counted: '', card: '', transfer: '', note: '' })
      await refresh()
      toast(closeBalanced(c) ? 'Caja cerrada · cuadra exacto' : `Caja cerrada · ${mismatchText(c)}`)
    },
    onError,
  })
  const reopen = useMutation({ mutationFn: () => repo.reopenDay(date), onSuccess: refresh, onError })

  if (!data) return <Skeleton className="h-64 rounded-lg" aria-busy="true" />

  const cash = cashSummary(data.appointments, data.sales)
  const sold = productsSold(data.appointments, data.sales)
  const closed = data.close
  const fund = closed ? closed.openingFund : Number(count.fund || 0)
  const { ins, outs, expected } = expectedCash({
    openingFund: fund,
    cashCharges: cash.charges.cash,
    cashTips: cash.tips.cash,
    moves: data.moves,
  })
  const status = cashDayStatus(data, today)
  // One line per method: what it should be, what was counted or read, and the difference.
  const typed = (v: string) => (v === '' ? null : Number(v))
  const lines: Line[] = closed
    ? closeLines(closed)
    : [
        { method: 'cash' as const, label: 'Efectivo', expected, counted: typed(count.counted) },
        { method: 'card' as const, label: 'Tarjeta', expected: cash.inByMethod.card, counted: typed(count.card) },
        {
          method: 'transfer' as const,
          label: 'Transferencias',
          expected: cash.inByMethod.transfer,
          counted: typed(count.transfer),
        },
      ].map((l) => ({ ...l, difference: l.counted === null ? null : l.counted - l.expected }))
  const allCaptured = lines.every((l) => l.counted !== null)
  const totalExpected = lines.reduce((t, l) => t + (l.expected ?? 0), 0)
  const totalCounted = lines.reduce((t, l) => t + (l.counted ?? 0), 0)
  const off = lines.filter((l) => l.difference !== null && l.difference !== 0)

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-6">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="mr-auto text-[15px] font-semibold">{capitalize(formatDateLong(date))}</h2>
        {closed ? (
          <Badge tone={status === 'mismatch' ? 'danger' : 'success'}>
            <Lock className="size-3.5" aria-hidden /> Cerrada por {closed.closedBy} ·{' '}
            {formatTime12(localTime(closed.closedAt, tz))}
          </Badge>
        ) : status === 'missing' ? (
          <Badge tone="danger">Sin corte de caja</Badge>
        ) : (
          <Badge tone="warning">Caja abierta</Badge>
        )}
      </div>
      {status === 'missing' && (
        <Alert tone="danger" title="No se hizo el corte de caja de este día.">
          Hubo cobros o movimientos y la caja quedó abierta. Cuenta el efectivo y ciérrala, o revisa con quien atendió.
        </Alert>
      )}
      {status === 'mismatch' && closed && (
        <Alert tone="danger" title={`El corte no cuadró: ${mismatchText(closed)}.`}>
          {closed.note
            ? `Nota del cierre: ${closed.note}`
            : 'Revisa los cobros, las formas de pago y los movimientos del día.'}
        </Alert>
      )}
      {error && <Alert tone="danger" title={error} />}

      <div className="grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-2">
        <Card title="Efectivo en caja" className="min-w-0">
          <dl className="grid gap-2 text-sm">
            <div className="flex items-center justify-between gap-3">
              <dt className="text-fg-muted">Fondo inicial</dt>
              <dd className="w-32">
                {closed ? (
                  <span className="tabular block text-right">{money(closed.openingFund)}</span>
                ) : (
                  <Input
                    label="Fondo inicial"
                    hideLabel
                    prefix="$"
                    inputMode="numeric"
                    placeholder="0"
                    value={count.fund}
                    onChange={(e) => setCount((c) => ({ ...c, fund: digits(e.target.value) }))}
                  />
                )}
              </dd>
            </div>
            {(
              [
                ['Cobros en efectivo', cash.charges.cash],
                ['Propinas en efectivo', cash.tips.cash],
                ['Entradas', ins],
                ['Salidas', outs ? -outs : 0],
              ] as const
            ).map(([k, v]) => (
              <div key={k} className="flex justify-between gap-3">
                <dt className="text-fg-muted">{k}</dt>
                <dd className="tabular">{v < 0 ? `−${money(-v)}` : money(v)}</dd>
              </div>
            ))}
            <div className="flex justify-between gap-3 border-t border-line pt-2 text-base font-semibold">
              <dt>Debe haber</dt>
              <dd className="tabular">{money(closed ? closed.expected : expected)}</dd>
            </div>
          </dl>
          <p className="mt-4 text-[13px] text-fg-muted">
            {cash.paidCount} {cash.paidCount === 1 ? 'cita cobrada' : 'citas cobradas'} y {cash.productPieces}{' '}
            {cash.productPieces === 1 ? 'producto vendido' : 'productos vendidos'} (en citas y mostrador).
          </p>
        </Card>

        <Card
          title="Corte de caja"
          description="Efectivo: cuéntalo en la caja. Tarjeta: el total del cierre de la terminal. Transferencias: lo recibido en el banco."
          className="min-w-0"
        >
          <div className="grid gap-4">
            <ul className="grid gap-3" aria-label="Corte por forma de pago">
              {lines.map((l) => (
                <li key={l.method} className="grid gap-1.5 rounded-md border border-line px-3 py-2.5">
                  <div className="grid grid-cols-[minmax(0,1fr)_8rem] items-center gap-3">
                    <div className="min-w-0 text-sm">
                      <p className="font-semibold">{CAPTURE_LABEL[l.method]}</p>
                      <p className="tabular text-fg-muted">
                        Debe haber {l.expected === null ? '—' : money(l.expected)}
                      </p>
                    </div>
                    {closed ? (
                      <p className="tabular text-right text-base font-semibold">
                        {l.counted === null ? '—' : money(l.counted)}
                      </p>
                    ) : (
                      <Input
                        label={CAPTURE_LABEL[l.method]}
                        hideLabel
                        prefix="$"
                        inputMode="numeric"
                        value={l.method === 'cash' ? count.counted : l.method === 'card' ? count.card : count.transfer}
                        onChange={(e) => {
                          const v = digits(e.target.value)
                          setCount((c) =>
                            l.method === 'cash'
                              ? { ...c, counted: v }
                              : l.method === 'card'
                                ? { ...c, card: v }
                                : { ...c, transfer: v },
                          )
                        }}
                      />
                    )}
                  </div>
                  {l.counted === null && closed ? (
                    <p className="text-[13px] text-fg-muted">No se capturó (cierre anterior a este cambio).</p>
                  ) : (
                    l.difference !== null && (
                      <p
                        className={cn(
                          'text-[13px] font-semibold',
                          l.difference === 0 ? 'text-success-700' : closed ? 'text-red-700' : 'text-warning-700',
                        )}
                      >
                        {l.difference === 0 ? 'Cuadra.' : `${capitalize(diffText(l.difference))}.`}
                      </p>
                    )
                  )}
                </li>
              ))}
            </ul>
            <div className="tabular flex flex-wrap justify-between gap-x-4 gap-y-1 border-t border-line pt-3 text-sm">
              <span className="text-fg-muted">
                Total: debe haber <strong className="text-fg">{money(totalExpected)}</strong>
              </span>
              <span className="text-fg-muted">
                capturado <strong className="text-fg">{allCaptured ? money(totalCounted) : '—'}</strong>
              </span>
            </div>
            {allCaptured && (
              <p
                className={cn(
                  'rounded-md px-4 py-3 text-sm font-semibold',
                  !off.length
                    ? 'bg-success-100 text-success-700'
                    : closed
                      ? 'bg-red-100 text-red-700'
                      : 'bg-warning-100 text-warning-700',
                )}
                aria-live="polite"
              >
                {!off.length
                  ? 'Cuadra exacto en efectivo, tarjeta y transferencias.'
                  : `No cuadra: ${off.map((l) => `${diffText(l.difference!)} en ${l.label.toLowerCase()}`).join(', ')}.`}
              </p>
            )}
            {closed ? (
              <>
                {closed.note && <p className="text-sm text-fg-muted">Nota: {closed.note}</p>}
                {canReopen && (
                  <button
                    type="button"
                    onClick={() => reopen.mutate()}
                    disabled={reopen.isPending}
                    className={cn(buttonClass({ variant: 'secondary', size: 'sm' }), 'justify-self-start')}
                  >
                    Reabrir caja
                  </button>
                )}
              </>
            ) : (
              <>
                <Input
                  label="Nota (opcional)"
                  value={count.note}
                  onChange={(e) => setCount((c) => ({ ...c, note: e.target.value }))}
                />
                <button
                  type="button"
                  onClick={() => close.mutate()}
                  disabled={!allCaptured || close.isPending}
                  className={cn(buttonClass({ size: 'sm' }), 'justify-self-start')}
                >
                  <Lock className="size-4" aria-hidden /> Cerrar caja
                </button>
                {!allCaptured && (
                  <p className="text-[13px] text-fg-muted">
                    Captura los tres montos para cerrar (escribe 0 si no hubo pagos de esa forma).
                  </p>
                )}
              </>
            )}
          </div>
        </Card>
      </div>

      <DayTips appointments={data.appointments} />

      <Card
        title="Lo cobrado en el día"
        description="Servicios, productos (vendidos en la cita o en mostrador) y propinas, en todas las formas de pago."
        className="min-w-0"
      >
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {(
            [
              ['Servicios', cash.servicesTotal],
              ['Productos', cash.productsTotal],
              ['Propinas', cash.tipsTotal],
              ['Total', cash.total],
            ] as const
          ).map(([k, v]) => (
            <div key={k} className="rounded-md border border-line px-3 py-2.5">
              <p className="text-[12px] text-fg-muted">{k}</p>
              <p className="tabular mt-0.5 text-lg font-semibold leading-tight">{money(v)}</p>
            </div>
          ))}
        </div>
        {sold.length ? (
          <ul className="mt-4 divide-y divide-line rounded-md border border-line" aria-label="Productos vendidos">
            {sold.map((p, i) => (
              <li key={i} className="flex items-center gap-3 px-4 py-2.5 text-sm">
                <span className="tabular hidden w-20 shrink-0 text-fg-muted sm:block">
                  {formatTime12(localTime(p.at, tz))}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="font-medium">
                    {p.qty > 1 ? `${p.qty} × ` : ''}
                    {p.name}
                  </span>
                  <span className="text-fg-muted"> · {p.customer ? `en la cita de ${p.customer}` : 'mostrador'}</span>
                </span>
                <span className="tabular font-semibold">{money(p.total)}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-4 text-sm text-fg-muted">Sin productos vendidos este día.</p>
        )}
      </Card>

      <Card
        title="Entradas y salidas de efectivo"
        description="Gastos, compras, retiros o cambio que se agrega a la caja."
        className="min-w-0"
      >
        {!closed && (
          <form
            className="mb-4 grid items-end gap-3 sm:grid-cols-[auto_140px_minmax(0,1fr)_auto]"
            onSubmit={(e) => {
              e.preventDefault()
              addMove.mutate()
            }}
          >
            <Segmented<'out' | 'in'>
              label="Tipo de movimiento"
              value={move.kind}
              onChange={(kind) => setMove((m) => ({ ...m, kind }))}
              options={[
                { value: 'out', label: 'Salida' },
                { value: 'in', label: 'Entrada' },
              ]}
            />
            <Input
              label="Monto"
              prefix="$"
              inputMode="numeric"
              value={move.amount}
              onChange={(e) => setMove((m) => ({ ...m, amount: digits(e.target.value) }))}
            />
            <Input
              label="Concepto"
              placeholder="Ej. compra de toallas"
              value={move.concept}
              onChange={(e) => setMove((m) => ({ ...m, concept: e.target.value }))}
            />
            <button
              type="submit"
              disabled={!move.amount || !move.concept.trim() || addMove.isPending}
              className={buttonClass({ size: 'sm' })}
            >
              Registrar
            </button>
          </form>
        )}
        {data.moves.length ? (
          <ul className="divide-y divide-line rounded-md border border-line" aria-label="Movimientos de caja">
            {data.moves.map((m) => (
              <li key={m.id} className="flex items-center gap-3 px-4 py-2.5 text-sm">
                <span className="tabular hidden w-20 shrink-0 text-fg-muted sm:block">
                  {formatTime12(localTime(m.at, tz))}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="font-medium">{m.concept}</span>
                  <span className="text-fg-muted"> · {m.by}</span>
                </span>
                <span className={cn('tabular font-semibold', m.kind === 'out' && 'text-fg-danger')}>
                  {m.kind === 'out' ? `−${money(m.amount)}` : `+${money(m.amount)}`}
                </span>
                {!closed && (
                  <button
                    type="button"
                    onClick={() => delMove.mutate(m.id)}
                    aria-label={`Quitar ${m.concept}`}
                    className="grid size-10 place-items-center rounded-full text-fg-muted hover:bg-fg/5 hover:text-fg focus-visible:outline focus-visible:outline-2 focus-visible:outline-focus"
                  >
                    <Trash2 className="size-4" aria-hidden />
                  </button>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-fg-muted">Sin movimientos este día.</p>
        )}
        <p className="mt-3 text-[13px] text-fg-muted">
          Las formas de pago del día:{' '}
          {(['cash', 'card', 'transfer'] as const)
            .map((k) => `${methodLabels[k]} ${money(cash.inByMethod[k])}`)
            .join(' · ')}
          .
        </p>
      </Card>
    </div>
  )
}
