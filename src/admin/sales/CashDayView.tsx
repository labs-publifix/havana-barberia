import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ChevronLeft, ChevronRight, Lock, Trash2 } from 'lucide-react'
import { Alert } from '@/components/ui/Alert'
import { Badge } from '@/components/ui/Badge'
import { buttonClass } from '@/components/ui/buttonClass'
import { Skeleton } from '@/components/ui/Skeleton'
import { business } from '@/config/business'
import { cn } from '@/lib/cn'
import { addDays, capitalize, formatDateLong, formatTime12, localDate, localTime, money } from '@/lib/time'
import { useAdminAuth, useAdminSession } from '../auth/AdminAuth'
import { errorMessage } from '../agenda/useAgendaActions'
import { cashSummary, methodLabels } from '../cash'
import { expectedCash } from '../finance'
import { Input, Segmented } from '../ui/controls'
import { Card } from '../ui/Panel'
import { useToast } from '../ui/Toast'

const tz = business.hours.timeZone
const digits = (v: string) => v.replace(/\D/g, '').slice(0, 7)

/**
 * Caja del día: what came in by method, cash taken out or put in, and the
 * count (arqueo) that closes the drawer. A closed day can't change unless the
 * owner or a manager reopens it.
 */
export function CashDayView() {
  const { repo } = useAdminAuth()
  const { user } = useAdminSession()
  const canReopen = user.role === 'owner' || user.role === 'manager'
  const qc = useQueryClient()
  const toast = useToast()
  const today = localDate(new Date(), tz)
  const [date, setDate] = useState(today)
  const { data } = useQuery({ queryKey: ['admin', 'cash-day', date], queryFn: () => repo.getCashDay(date) })
  const [move, setMove] = useState({ kind: 'out' as 'out' | 'in', amount: '', concept: '' })
  const [count, setCount] = useState({ fund: '', counted: '', note: '' })
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
      repo.closeDay({ date, openingFund: Number(count.fund || 0), counted: Number(count.counted), note: count.note }),
    onSuccess: async (c) => {
      setError(null)
      setCount({ fund: '', counted: '', note: '' })
      await refresh()
      toast(c.difference === 0 ? 'Caja cerrada · cuadra exacto' : `Caja cerrada · diferencia ${money(c.difference)}`)
    },
    onError,
  })
  const reopen = useMutation({ mutationFn: () => repo.reopenDay(date), onSuccess: refresh, onError })

  const nav =
    'grid size-10 place-items-center rounded-full text-fg-muted hover:bg-fg/5 hover:text-fg focus-visible:outline focus-visible:outline-2 focus-visible:outline-focus disabled:opacity-30'
  const header = (
    <div className="flex flex-wrap items-center gap-2">
      <button type="button" aria-label="Día anterior" onClick={() => setDate(addDays(date, -1))} className={nav}>
        <ChevronLeft className="size-5" strokeWidth={1.75} aria-hidden />
      </button>
      <p className="min-w-[200px] text-center text-[15px] font-semibold" aria-live="polite">
        {capitalize(formatDateLong(date))}
      </p>
      <button
        type="button"
        aria-label="Día siguiente"
        disabled={date >= today}
        onClick={() => setDate(addDays(date, 1))}
        className={nav}
      >
        <ChevronRight className="size-5" strokeWidth={1.75} aria-hidden />
      </button>
      {date !== today && (
        <button
          type="button"
          onClick={() => setDate(today)}
          className={buttonClass({ variant: 'secondary', size: 'sm' })}
        >
          Hoy
        </button>
      )}
    </div>
  )

  if (!data) {
    return (
      <div className="grid gap-4">
        {header}
        <Skeleton className="h-64 rounded-lg" aria-busy="true" />
      </div>
    )
  }

  const cash = cashSummary(data.appointments, data.sales)
  const closed = data.close
  const fund = closed ? closed.openingFund : Number(count.fund || 0)
  const { ins, outs, expected } = expectedCash({
    openingFund: fund,
    cashCharges: cash.charges.cash,
    cashTips: cash.tips.cash,
    moves: data.moves,
  })
  const counted = closed ? closed.counted : count.counted === '' ? null : Number(count.counted)
  const diff = counted === null ? null : counted - (closed ? closed.expected : expected)

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        {header}
        {closed ? (
          <Badge tone="success">
            <Lock className="size-3.5" aria-hidden /> Cerrada por {closed.closedBy} ·{' '}
            {formatTime12(localTime(closed.closedAt, tz))}
          </Badge>
        ) : (
          <Badge tone="warning">Caja abierta</Badge>
        )}
      </div>
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
                ['Salidas', -outs],
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
            Tarjeta {money(cash.inByMethod.card)} · Transferencia {money(cash.inByMethod.transfer)} (no pasan por la
            caja). {cash.paidCount} citas cobradas y {data.sales.length} ventas de productos.
          </p>
        </Card>

        <Card title="Arqueo" description="Cuenta el efectivo al cerrar." className="min-w-0">
          <div className="grid gap-4">
            {closed ? (
              <dl className="grid gap-2 text-sm">
                <div className="flex justify-between">
                  <dt className="text-fg-muted">Efectivo contado</dt>
                  <dd className="tabular">{money(closed.counted)}</dd>
                </div>
                {closed.note && <p className="text-fg-muted">Nota: {closed.note}</p>}
              </dl>
            ) : (
              <>
                <Input
                  label="Efectivo contado"
                  prefix="$"
                  inputMode="numeric"
                  value={count.counted}
                  onChange={(e) => setCount((c) => ({ ...c, counted: digits(e.target.value) }))}
                />
                <Input
                  label="Nota (opcional)"
                  value={count.note}
                  onChange={(e) => setCount((c) => ({ ...c, note: e.target.value }))}
                />
              </>
            )}
            {diff !== null && (
              <p
                className={cn(
                  'rounded-md px-4 py-3 text-sm font-semibold',
                  diff === 0 ? 'bg-success-100 text-success-700' : 'bg-warning-100 text-warning-700',
                )}
                aria-live="polite"
              >
                {diff === 0 ? 'Cuadra exacto.' : diff > 0 ? `Sobran ${money(diff)}.` : `Faltan ${money(-diff)}.`}
              </p>
            )}
            {closed ? (
              canReopen && (
                <button
                  type="button"
                  onClick={() => reopen.mutate()}
                  disabled={reopen.isPending}
                  className={cn(buttonClass({ variant: 'secondary', size: 'sm' }), 'justify-self-start')}
                >
                  Reabrir caja
                </button>
              )
            ) : (
              <button
                type="button"
                onClick={() => close.mutate()}
                disabled={count.counted === '' || close.isPending}
                className={cn(buttonClass({ size: 'sm' }), 'justify-self-start')}
              >
                <Lock className="size-4" aria-hidden /> Cerrar caja
              </button>
            )}
          </div>
        </Card>
      </div>

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
                <span className="tabular hidden w-20 shrink-0 text-fg-muted sm:block">{formatTime12(localTime(m.at, tz))}</span>
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
