import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ChevronDown, Download, HandCoins, Printer, Undo2 } from 'lucide-react'
import { Alert } from '@/components/ui/Alert'
import { Badge } from '@/components/ui/Badge'
import { buttonClass } from '@/components/ui/buttonClass'
import { Dialog } from '@/components/ui/Dialog'
import { TextArea } from '@/components/ui/Field'
import { Skeleton } from '@/components/ui/Skeleton'
import { business } from '@/config/business'
import type { PaymentMethod } from '@/domain/types'
import { cn } from '@/lib/cn'
import { downloadCsv } from '@/lib/csv'
import { capitalize, formatDay, formatTime12, localDate, localTime, money } from '@/lib/time'
import { useAdminAuth } from '../auth/AdminAuth'
import { errorMessage } from '../agenda/useAgendaActions'
import { methodLabels } from '../cash'
import { periodLabel } from '../period'
import { printTipReceipt, tipFolio } from '../tipReceipt'
import {
  tipHistory,
  tipHistoryCsv,
  tipPayoutsCsv,
  tipsByStaff,
  type StaffTips,
  type TipGroup,
  type TipPayout,
} from '../tips'
import { Segmented } from '../ui/controls'
import { Card } from '../ui/Panel'
import { PeriodPicker } from '../ui/PeriodPicker'
import { useToast } from '../ui/Toast'
import { usePeriod } from '../usePeriod'

const tz = business.hours.timeZone
const METHODS: PaymentMethod[] = ['cash', 'card', 'transfer']
const dm = (d: string) => formatDay(d, "d 'de' MMM")
const signed = (n: number) => (n < 0 ? `−${money(-n)}` : money(n))

/** One barber's pending tips: by payment method, the card fee, what to pay, and the detail. */
function PendingCard({ s, onPay }: { s: StaffTips; onPay: () => void }) {
  const [open, setOpen] = useState(false)
  const first = s.lines[0]?.date
  const last = s.lines.at(-1)?.date
  return (
    <li className="rounded-lg border border-line bg-raised">
      <div className="grid gap-4 p-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
        <div className="min-w-0">
          <p className="font-semibold">{s.name}</p>
          <p className="text-[13px] text-fg-muted">
            {s.lines.length} {s.lines.length === 1 ? 'propina' : 'propinas'}
            {first && ` · ${first === last ? dm(first) : `${dm(first)} – ${dm(last!)}`}`}
          </p>
          <dl className="mt-3 grid grid-cols-3 gap-2 text-sm sm:max-w-md">
            {METHODS.map((m) => (
              <div key={m} className="rounded-md bg-surface px-2.5 py-1.5">
                <dt className="text-[12px] text-fg-muted">{methodLabels[m]}</dt>
                <dd className="tabular font-medium">{money(s.byMethod[m])}</dd>
              </div>
            ))}
          </dl>
        </div>
        <div className="grid gap-2 sm:justify-items-end">
          {s.fee !== 0 && (
            <p className="tabular text-[13px] text-fg-muted">
              Propinas {money(s.tip)} · terminal −{money(s.fee)}
            </p>
          )}
          <p className="text-[12px] text-fg-muted sm:text-right">Total a pagarle</p>
          <p className={cn('tabular text-2xl font-semibold leading-none', s.amount < 0 && 'text-red-700')}>
            {signed(s.amount)}
          </p>
          {s.amount > 0 ? (
            <button type="button" onClick={onPay} className={buttonClass({ size: 'sm' })}>
              <HandCoins className="size-4" aria-hidden /> Pagar propinas
            </button>
          ) : (
            <p className="max-w-[260px] text-[13px] text-red-700">
              Se le pagó de más tras una corrección; se descuenta de su próximo pago.
            </p>
          )}
        </div>
      </div>
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
        className="flex min-h-11 w-full items-center gap-1.5 border-t border-line px-4 text-[13px] font-medium text-fg-muted hover:text-fg focus-visible:outline focus-visible:outline-2 focus-visible:outline-focus"
      >
        <ChevronDown className={cn('size-4 transition-transform', open && 'rotate-180')} aria-hidden />
        {open ? 'Ocultar detalle' : 'Ver de qué citas salen'}
      </button>
      {open && (
        <div className="overflow-x-auto border-t border-line">
          <table className="w-full min-w-[520px] text-sm">
            <thead>
              <tr className="text-left text-[12px] text-fg-muted">
                <th className="px-4 py-2 font-medium">Día</th>
                <th className="px-3 py-2 font-medium">Cliente</th>
                <th className="px-3 py-2 font-medium">Forma</th>
                <th className="px-3 py-2 text-right font-medium">Propina</th>
                <th className="px-3 py-2 text-right font-medium">Terminal</th>
                <th className="px-4 py-2 text-right font-medium">A pagar</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {s.lines.map((l) => (
                <tr key={l.appointmentId}>
                  <td className="px-4 py-2">{capitalize(formatDay(l.date, "EEE d 'de' MMM"))}</td>
                  <td className="px-3 py-2">
                    {l.customer}
                    {l.tip < 0 && <span className="ml-1 text-[12px] text-red-700">(corregida)</span>}
                  </td>
                  <td className="px-3 py-2">{methodLabels[l.method]}</td>
                  <td className="tabular px-3 py-2 text-right">{signed(l.tip)}</td>
                  <td className="tabular px-3 py-2 text-right">{l.fee ? `−${money(l.fee)}` : '—'}</td>
                  <td className="tabular px-4 py-2 text-right font-medium">{signed(l.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </li>
  )
}

/** History of payouts in the period: totals per barber by week or month, every payout, CSV and reprint. */
function History() {
  const { repo } = useAdminAuth()
  const qc = useQueryClient()
  const toast = useToast()
  const { period, setPeriod, today, weekStartDay } = usePeriod('month')
  const [group, setGroup] = useState<TipGroup>('week')
  const [staffId, setStaffId] = useState<string>('')
  const [voiding, setVoiding] = useState<TipPayout | null>(null)
  const [reason, setReason] = useState('')
  const [error, setError] = useState<string | null>(null)
  const { data } = useQuery({
    queryKey: ['admin', 'tip-payouts', period.from, period.to],
    queryFn: () => repo.getTipPayouts(period.from, period.to),
  })
  const voidIt = useMutation({
    mutationFn: () => repo.voidTipPayout(voiding!.id, reason),
    onSuccess: async () => {
      setVoiding(null)
      setReason('')
      setError(null)
      await qc.invalidateQueries({ queryKey: ['admin'] })
      toast('Pago anulado: las propinas vuelven a quedar pendientes')
    },
    onError: (e) => setError(errorMessage(e)),
  })

  const all = data ?? []
  const barbers = [...new Map(all.map((p) => [p.staffId, p.staffName])).entries()]
  const payouts = staffId ? all.filter((p) => p.staffId === staffId) : all
  const rows = tipHistory(payouts, group, weekStartDay)
  const live = payouts.filter((p) => !p.voided)
  const total = live.reduce((t, p) => t + p.amount, 0)
  const name = barbers.find(([id]) => id === staffId)?.[1]
  const suffix = `${name ? `${name.toLowerCase().replace(/\s+/g, '-')}-` : ''}${period.from}-a-${period.to}`

  return (
    <Card
      title="Historial de propinas pagadas"
      description={`Lo que se ha llevado cada barbero · ${periodLabel(period)}. Los anulados no suman.`}
      className="min-w-0"
    >
      <div className="grid gap-5">
        <div className="flex flex-wrap items-end gap-3">
          <PeriodPicker value={period} onChange={setPeriod} today={today} weekStartDay={weekStartDay} />
          <label className="grid gap-1 text-[13px] font-medium">
            Barbero
            <select
              value={staffId}
              onChange={(e) => setStaffId(e.target.value)}
              className="min-h-11 rounded-md border border-line bg-raised px-3 text-base sm:text-sm"
            >
              <option value="">Todos</option>
              {barbers.map(([id, n]) => (
                <option key={id} value={id}>
                  {n}
                </option>
              ))}
            </select>
          </label>
          <Segmented<TipGroup>
            label="Agrupar por"
            value={group}
            onChange={setGroup}
            options={[
              { value: 'week', label: 'Semana' },
              { value: 'month', label: 'Mes' },
            ]}
          />
        </div>

        {!data ? (
          <Skeleton className="h-40 rounded-lg" aria-busy="true" />
        ) : !payouts.length ? (
          <p className="text-sm text-fg-muted">No hay pagos de propinas en este periodo.</p>
        ) : (
          <>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-sm">
                <span className="tabular text-xl font-semibold">{money(total)}</span>{' '}
                <span className="text-fg-muted">
                  pagado en {live.length} {live.length === 1 ? 'pago' : 'pagos'}
                </span>
              </p>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => downloadCsv(`propinas-resumen-${suffix}.csv`, tipHistoryCsv(rows, group))}
                  className={buttonClass({ variant: 'secondary', size: 'sm' })}
                >
                  <Download className="size-4" aria-hidden /> Resumen CSV
                </button>
                <button
                  type="button"
                  onClick={() => downloadCsv(`propinas-pagos-${suffix}.csv`, tipPayoutsCsv(payouts))}
                  className={buttonClass({ variant: 'secondary', size: 'sm' })}
                >
                  <Download className="size-4" aria-hidden /> Pagos CSV
                </button>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full min-w-[520px] text-sm">
                <thead>
                  <tr className="border-b border-line text-left text-[12px] text-fg-muted">
                    <th className="py-2 pr-3 font-medium">{group === 'week' ? 'Semana' : 'Mes'}</th>
                    <th className="py-2 pr-3 font-medium">Barbero</th>
                    <th className="py-2 pr-3 text-right font-medium">Pagos</th>
                    <th className="py-2 pr-3 text-right font-medium">Propinas</th>
                    <th className="py-2 pr-3 text-right font-medium">Terminal</th>
                    <th className="py-2 text-right font-medium">Pagado</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {rows.map((r) => (
                    <tr key={`${r.key}-${r.staffId}`}>
                      <td className="py-2 pr-3">{r.label}</td>
                      <td className="py-2 pr-3">{r.name}</td>
                      <td className="tabular py-2 pr-3 text-right">{r.payouts}</td>
                      <td className="tabular py-2 pr-3 text-right">{money(r.gross)}</td>
                      <td className="tabular py-2 pr-3 text-right">{r.fee ? `−${money(r.fee)}` : '—'}</td>
                      <td className="tabular py-2 text-right font-semibold">{money(r.amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div>
              <h3 className="mb-2 text-[12px] font-semibold uppercase tracking-[0.08em] text-fg-muted">Cada pago</h3>
              <ul className="divide-y divide-line rounded-lg border border-line">
                {payouts.map((p) => (
                  <li key={p.id} className="flex flex-wrap items-center gap-3 px-4 py-3 text-sm">
                    <span className="min-w-0 basis-full sm:flex-1 sm:basis-auto">
                      <span className="block font-medium">
                        {tipFolio(p.folio)} · {p.staffName}
                      </span>
                      <span className="block text-[13px] text-fg-muted">
                        {capitalize(formatDay(localDate(p.paidAt, tz), "EEE d 'de' MMM"))},{' '}
                        {formatTime12(localTime(p.paidAt, tz))} · pagó {p.paidBy} · {p.lines.length}{' '}
                        {p.lines.length === 1 ? 'propina' : 'propinas'}
                        {p.voided && ` · anulado por ${p.voided.by}: ${p.voided.reason}`}
                      </span>
                    </span>
                    {p.voided ? (
                      <Badge tone="danger">Anulado</Badge>
                    ) : (
                      <span className="tabular font-semibold">{money(p.amount)}</span>
                    )}
                    <button
                      type="button"
                      onClick={() =>
                        void printTipReceipt(p).catch(() => toast('No se pudo generar el recibo.', 'danger'))
                      }
                      className={buttonClass({ variant: 'secondary', size: 'sm' })}
                    >
                      <Printer className="size-4" aria-hidden /> Recibo
                    </button>
                    {!p.voided && (
                      <button
                        type="button"
                        onClick={() => {
                          setVoiding(p)
                          setError(null)
                        }}
                        className={buttonClass({ variant: 'ghost', size: 'sm' })}
                      >
                        <Undo2 className="size-4" aria-hidden /> Anular
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          </>
        )}
      </div>

      <Dialog
        open={!!voiding}
        onOpenChange={(o) => !o && setVoiding(null)}
        title={voiding ? `¿Anular el pago ${tipFolio(voiding.folio)}?` : ''}
        description={
          voiding &&
          `Las propinas de ${voiding.staffName} vuelven a quedar pendientes y los ${money(voiding.amount)} regresan a la caja (como entrada, si ese día ya se cerró).`
        }
        footer={
          <>
            <button
              type="button"
              onClick={() => setVoiding(null)}
              className={buttonClass({ variant: 'secondary', size: 'sm' })}
            >
              Volver
            </button>
            <button
              type="button"
              disabled={voidIt.isPending}
              onClick={() => voidIt.mutate()}
              className={buttonClass({ variant: 'danger', size: 'sm' })}
            >
              Anular pago
            </button>
          </>
        }
      >
        <div className="grid gap-3">
          {error && <Alert tone="danger" title={error} />}
          <TextArea label="Motivo" value={reason} onChange={(e) => setReason(e.target.value)} rows={2} />
        </div>
      </Dialog>
    </Card>
  )
}

/**
 * Cierres › Propinas (owner and manager): what each barber is owed in tips,
 * every payment method included, pay it with cash from the drawer, print the
 * receipt to sign, and the history.
 */
export function TipsView() {
  const { repo } = useAdminAuth()
  const qc = useQueryClient()
  const toast = useToast()
  const { data } = useQuery({ queryKey: ['admin', 'tips'], queryFn: () => repo.getTips() })
  const { data: team } = useQuery({ queryKey: ['admin', 'team'], queryFn: () => repo.getTeam() })
  const [paying, setPaying] = useState<StaffTips | null>(null)
  const [error, setError] = useState<string | null>(null)
  const pay = useMutation({
    mutationFn: (s: StaffTips) => repo.payTips(s.staffId, s.amount),
    onSuccess: async (payout) => {
      setPaying(null)
      setError(null)
      await qc.invalidateQueries({ queryKey: ['admin'] })
      toast(`Pago registrado: ${money(payout.amount)} a ${payout.staffName}`)
      void printTipReceipt(payout).catch(() =>
        toast('No se pudo generar el recibo; reimprímelo del historial.', 'danger'),
      )
    },
    onError: (e) => setError(errorMessage(e)),
  })

  if (!data) return <Skeleton className="h-64 rounded-lg" aria-busy="true" />
  const staff = tipsByStaff(data.pending, team?.staff ?? [])
  const total = staff.reduce((t, s) => t + Math.max(0, s.amount), 0)

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-6">
      <Card
        title="Propinas por pagar"
        description={
          <>
            Todo lo pendiente por barbero, en efectivo, tarjeta y transferencia. Con tarjeta, de las propinas mayores a{' '}
            {money(data.rule.over)} se descuentan {money(data.rule.fee)} por la terminal. Se pagan con efectivo de la
            caja y quedan como salida a nombre del barbero (no es gasto del negocio).
            {data.separateFrom && (
              <> Propinas desde el {dm(data.separateFrom)}; las anteriores se pagaron en la nómina.</>
            )}
          </>
        }
        actions={
          staff.length > 0 && (
            <p className="text-right">
              <span className="block text-[12px] text-fg-muted">Total por pagar</span>
              <span className="tabular text-xl font-semibold">{money(total)}</span>
            </p>
          )
        }
        className="min-w-0"
      >
        {staff.length ? (
          <ul className="grid gap-3">
            {staff.map((s) => (
              <PendingCard
                key={s.staffId}
                s={s}
                onPay={() => {
                  setPaying(s)
                  setError(null)
                }}
              />
            ))}
          </ul>
        ) : (
          <p className="text-sm text-fg-muted">No hay propinas pendientes. Todo está pagado.</p>
        )}
      </Card>

      <History />

      <Dialog
        open={!!paying}
        onOpenChange={(o) => !o && setPaying(null)}
        title={paying ? `Pagar ${money(paying.amount)} a ${paying.name}` : ''}
        description="Sale de la caja de hoy como «Pago de propinas» a su nombre. Al confirmar se imprime el recibo (2 copias) para que lo firme."
        footer={
          <>
            <button
              type="button"
              onClick={() => setPaying(null)}
              className={buttonClass({ variant: 'secondary', size: 'sm' })}
            >
              Volver
            </button>
            <button
              type="button"
              disabled={pay.isPending}
              onClick={() => paying && pay.mutate(paying)}
              className={buttonClass({ size: 'sm' })}
            >
              <HandCoins className="size-4" aria-hidden /> {pay.isPending ? 'Registrando…' : 'Confirmar pago'}
            </button>
          </>
        }
      >
        {paying && (
          <div className="grid gap-3 text-sm">
            {error && <Alert tone="danger" title={error} />}
            <dl className="grid gap-1.5">
              {METHODS.map((m) => (
                <div key={m} className="flex justify-between gap-3">
                  <dt className="text-fg-muted">Propinas en {methodLabels[m].toLowerCase()}</dt>
                  <dd className="tabular">{money(paying.byMethod[m])}</dd>
                </div>
              ))}
              {paying.fee !== 0 && (
                <div className="flex justify-between gap-3">
                  <dt className="text-fg-muted">Descuento terminal</dt>
                  <dd className="tabular">−{money(paying.fee)}</dd>
                </div>
              )}
              <div className="flex justify-between gap-3 border-t border-line pt-2 font-semibold">
                <dt>Le pagas en efectivo</dt>
                <dd className="tabular text-lg">{money(paying.amount)}</dd>
              </div>
            </dl>
          </div>
        )}
      </Dialog>
    </div>
  )
}
