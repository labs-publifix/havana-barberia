import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Check, Lock, Printer, Trash2 } from 'lucide-react'
import { Badge } from '@/components/ui/Badge'
import { Dialog } from '@/components/ui/Dialog'
import { Alert } from '@/components/ui/Alert'
import { buttonClass } from '@/components/ui/buttonClass'
import { Skeleton } from '@/components/ui/Skeleton'
import { business } from '@/config/business'
import type { PaymentMethod } from '@/domain/types'
import { addDays, capitalize, formatDay, localDate, money } from '@/lib/time'
import { useFinanceWeek } from '../useFinanceWeek'
import { useAdminAuth, useAdminSession } from '../auth/AdminAuth'
import { errorMessage } from '../agenda/useAgendaActions'
import { cashSummary, methodLabels } from '../cash'
import { cardFee, earnings, weekLabel, type BarberEarnings } from '../finance'
import { Input, Switch } from '../ui/controls'
import { Card, PageHeader } from '../ui/Panel'
import { Select } from '../ui/Select'
import { SidePanel } from '../ui/SidePanel'
import { useToast } from '../ui/Toast'
import { WeekPicker } from '../ui/WeekPicker'

const tz = business.hours.timeZone
const METHODS: PaymentMethod[] = ['cash', 'card', 'transfer']
const th = 'px-3 py-2 text-[13px] font-medium text-fg-muted'

/** Cierre y nómina (phase-2 preview): the week's income by payment method, advances and each barber's receipt. */
export default function Payroll() {
  const { repo } = useAdminAuth()
  const qc = useQueryClient()
  const toast = useToast()
  const today = localDate(new Date(), tz)
  const { from, setFrom, current } = useFinanceWeek()
  const to = addDays(from, 6)
  const { data } = useQuery({ queryKey: ['admin', 'finance', from, to], queryFn: () => repo.getFinance(from, to) })
  const [receipt, setReceipt] = useState<BarberEarnings | null>(null)
  const [adv, setAdv] = useState({ staffId: '', amount: '', note: '' })
  const [error, setError] = useState<string | null>(null)
  const [confirmClose, setConfirmClose] = useState(false)
  const { user } = useAdminSession()

  const refresh = () => qc.invalidateQueries({ queryKey: ['admin', 'finance'] })
  const add = useMutation({
    mutationFn: () =>
      repo.addAdvance({
        staffId: adv.staffId,
        amount: Number(adv.amount),
        note: adv.note,
        date: today >= from && today <= to ? today : from,
      }),
    onSuccess: async () => {
      setAdv({ staffId: '', amount: '', note: '' })
      setError(null)
      await refresh()
      toast('Anticipo registrado')
    },
    onError: (e) => setError(errorMessage(e)),
  })
  const toggle = useMutation({
    mutationFn: (x: { staffId: string; bonusId: string; on: boolean }) =>
      repo.setBonusAward({ weekStart: from, staffId: x.staffId, bonusId: x.bonusId }, x.on),
    onSuccess: refresh,
    onError: (e) => toast(errorMessage(e), 'danger'),
  })
  const paid = useMutation({
    mutationFn: (x: { staffId: string; on: boolean }) => repo.markPaid(from, x.staffId, x.on),
    onSuccess: refresh,
    onError: (e) => toast(errorMessage(e), 'danger'),
  })
  const reopen = useMutation({
    mutationFn: () => repo.reopenWeek(from),
    onSuccess: refresh,
    onError: (e) => toast(errorMessage(e), 'danger'),
  })
  const closeWeek = useMutation({
    mutationFn: () => repo.closeWeek(from),
    onSuccess: async () => {
      setConfirmClose(false)
      await refresh()
      toast('Semana cerrada')
    },
    onError: (e) => toast(errorMessage(e), 'danger'),
  })
  const remove = useMutation({ mutationFn: (id: string) => repo.deleteAdvance(id), onSuccess: refresh })

  if (!data) {
    return (
      <div className="grid gap-4" aria-busy="true">
        <Skeleton className="h-48 rounded-lg" />
        <Skeleton className="h-48 rounded-lg" />
      </div>
    )
  }

  const cash = cashSummary(data.appointments, data.sales)
  const closed = data.close
  const computed = earnings({
    ...data,
    bonusRules: data.settings.bonuses,
    discountCommission: data.settings.discountCommission,
    from,
    to,
    timeZone: tz,
  }).filter((r) => r.services > 0 || r.advances > 0 || data.staff.find((s) => s.id === r.staffId)?.active)
  // A closed week shows its frozen receipts.
  const rows = closed ? closed.rows : computed
  const total = rows.reduce(
    (t, r) => ({
      commission: t.commission + r.commission,
      tips: t.tips + r.tips,
      advances: t.advances + r.advances,
      bonuses: t.bonuses + r.bonusTotal,
      pay: t.pay + r.pay,
    }),
    { commission: 0, tips: 0, advances: 0, bonuses: 0, pay: 0 },
  )
  const fee = data.settings.cardFeePercent
  const cardIn = cash.inByMethod.card
  const manualBonuses = data.settings.bonuses.filter((b) => b.active && b.kind === 'manual')
  const awarded = (staffId: string, bonusId: string) =>
    data.bonusAwards.some((w) => w.staffId === staffId && w.bonusId === bonusId && w.weekStart === from)
  const staffName = (id: string) => data.staff.find((s) => s.id === id)?.name ?? 'Barbero'

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-6">
      <PageHeader
        description="Cierre de la semana: lo que entró por forma de pago, anticipos y el recibo de cada barbero."
        actions={
          <>
            <WeekPicker value={from} onChange={setFrom} current={current} />
            {!closed && (
              <button type="button" onClick={() => setConfirmClose(true)} className={buttonClass({ size: 'sm' })}>
                <Lock className="size-4" aria-hidden /> Cerrar semana
              </button>
            )}
          </>
        }
      />
      {closed && (
        <Alert
          tone="success"
          title={`Semana cerrada el ${formatDay(localDate(closed.closedAt, tz), "EEEE d 'de' MMMM")} por ${closed.closedBy}`}
        >
          Los recibos quedaron guardados tal como estaban y ya no cambian. {Object.keys(closed.paid).length} de{' '}
          {closed.rows.length} pagados.
          {user.role === 'owner' && (
            <button
              type="button"
              onClick={() => reopen.mutate()}
              className="ml-2 font-semibold underline underline-offset-2"
            >
              Reabrir semana
            </button>
          )}
        </Alert>
      )}

      <Card
        title="Entradas por forma de pago"
        description={`${cash.paidCount} citas cobradas · servicios ${money(cash.servicesTotal)} · productos ${money(cash.productsTotal)}. Los pagos mixtos cuentan en cada forma de pago.`}
        className="min-w-0"
        bodyClassName="relative overflow-x-auto"
      >
        <table className="w-full min-w-[460px] text-sm">
          <caption className="sr-only">Entradas por forma de pago</caption>
          <thead>
            <tr className="text-left">
              <th scope="col" className={`${th} pl-5`}>
                Forma de pago
              </th>
              <th scope="col" className={`${th} text-right`}>
                Cobros
              </th>
              <th scope="col" className={`${th} text-right`}>
                Propinas
              </th>
              <th scope="col" className={`${th} pr-5 text-right`}>
                Total
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line border-t border-line">
            {METHODS.map((m) => (
              <tr key={m}>
                <th scope="row" className="px-5 py-2.5 text-left font-medium">
                  {methodLabels[m]}
                </th>
                <td className="tabular px-3 py-2.5 text-right">{money(cash.charges[m])}</td>
                <td className="tabular px-3 py-2.5 text-right">{money(cash.tips[m])}</td>
                <td className="tabular px-5 py-2.5 text-right font-semibold">{money(cash.inByMethod[m])}</td>
              </tr>
            ))}
            <tr className="bg-surface">
              <th scope="row" className="px-5 py-2.5 text-left font-semibold">
                Total
              </th>
              <td className="tabular px-3 py-2.5 text-right font-semibold">
                {money(cash.servicesTotal + cash.productsTotal)}
              </td>
              <td className="tabular px-3 py-2.5 text-right font-semibold">{money(cash.tipsTotal)}</td>
              <td className="tabular px-5 py-2.5 text-right text-base font-semibold">{money(cash.total)}</td>
            </tr>
          </tbody>
        </table>
        <p className="border-t border-line px-5 py-3 text-[13px] text-fg-muted">
          {fee
            ? `Comisión de la terminal (${fee} %) sobre ${money(cardIn)} con tarjeta: −${money(cardFee(cardIn, fee))}. La absorbe la barbería; las propinas llegan completas al barbero.`
            : 'Comisión de la terminal: captúrala en Ajustes › Finanzas. La absorbe la barbería; las propinas llegan completas al barbero.'}
        </p>
      </Card>

      <Card
        title="Nómina de la semana"
        description="Comisión + propinas + bonos − anticipos."
        className="min-w-0"
        bodyClassName="relative overflow-x-auto"
      >
        <table className="w-full min-w-[820px] text-sm">
          <caption className="sr-only">Nómina por barbero</caption>
          <thead>
            <tr className="text-left">
              <th scope="col" className={`${th} pl-5`}>
                Barbero
              </th>
              <th scope="col" className={`${th} text-right`}>
                Comisión
              </th>
              <th scope="col" className={`${th} text-right`}>
                Propinas
              </th>
              <th scope="col" className={`${th} text-right`}>
                Bonos
              </th>
              <th scope="col" className={`${th} text-right`}>
                Anticipos
              </th>
              <th scope="col" className={`${th} text-right`}>
                A pagar
              </th>
              <th scope="col" className={`${th} pr-5`}>
                <span className="sr-only">Recibo</span>
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line border-t border-line">
            {rows.map((r) => (
              <tr key={r.staffId}>
                <th scope="row" className="px-5 py-2.5 text-left font-medium">
                  {r.name}
                  {r.missing > 0 && (
                    <span className="block text-[13px] font-normal text-fg-muted">
                      {r.missing} {r.missing === 1 ? 'servicio' : 'servicios'} sin comisión capturada
                    </span>
                  )}
                </th>
                <td className="tabular px-3 py-2.5 text-right">{money(r.commission)}</td>
                <td className="tabular px-3 py-2.5 text-right">{money(r.tips)}</td>
                <td className="tabular px-3 py-2.5 text-right">{r.bonusTotal ? money(r.bonusTotal) : '—'}</td>
                <td className="tabular px-3 py-2.5 text-right">{r.advances ? `−${money(r.advances)}` : '—'}</td>
                <td className="tabular px-3 py-2.5 text-right font-semibold">{money(r.pay)}</td>
                <td className="px-5 py-2.5 text-right">
                  <div className="flex items-center justify-end gap-2">
                    {closed &&
                      (closed.paid[r.staffId] ? (
                        <button
                          type="button"
                          onClick={() => paid.mutate({ staffId: r.staffId, on: false })}
                          aria-label={`Quitar pagado de ${r.name}`}
                          title={`Pagado por ${closed.paid[r.staffId]!.by}`}
                        >
                          <Badge tone="success">
                            <Check className="size-3.5" aria-hidden /> Pagado
                          </Badge>
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => paid.mutate({ staffId: r.staffId, on: true })}
                          className={buttonClass({ size: 'sm' })}
                        >
                          Marcar pagado
                        </button>
                      ))}
                    <button
                      type="button"
                      onClick={() => setReceipt(r)}
                      aria-label={`Ver recibo de ${r.name}`}
                      className={buttonClass({ variant: 'secondary', size: 'sm' })}
                    >
                      Ver recibo
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            <tr className="bg-surface">
              <th scope="row" className="px-5 py-2.5 text-left font-semibold">
                Total
              </th>
              <td className="tabular px-3 py-2.5 text-right font-semibold">{money(total.commission)}</td>
              <td className="tabular px-3 py-2.5 text-right font-semibold">{money(total.tips)}</td>
              <td className="tabular px-3 py-2.5 text-right font-semibold">
                {total.bonuses ? money(total.bonuses) : '—'}
              </td>
              <td className="tabular px-3 py-2.5 text-right font-semibold">
                {total.advances ? `−${money(total.advances)}` : '—'}
              </td>
              <td className="tabular px-3 py-2.5 text-right text-base font-semibold">{money(total.pay)}</td>
              <td />
            </tr>
          </tbody>
        </table>
      </Card>

      <Card
        title="Bonos de la semana"
        description="Marca los bonos que se ganaron. Meta de servicios y venta de productos se calculan solos. Montos y metas en Ajustes › Finanzas."
        className="min-w-0"
      >
        {manualBonuses.length === 0 ? (
          <p className="text-sm text-fg-muted">No hay bonos que se marquen a mano.</p>
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2" aria-label="Bonos por barbero">
            {rows.map((r) => (
              <li key={r.staffId} className="rounded-md border border-line p-4">
                <p className="font-semibold">{r.name}</p>
                <div className="mt-2 grid gap-3">
                  {manualBonuses.map((b) => (
                    <Switch
                      key={b.id}
                      label={b.name}
                      description={b.amount ? money(b.amount) : 'Monto sin capturar'}
                      checked={awarded(r.staffId, b.id)}
                      disabled={toggle.isPending || !!closed}
                      onChange={(on) => toggle.mutate({ staffId: r.staffId, bonusId: b.id, on })}
                    />
                  ))}
                  {r.bonuses
                    .filter((b) => !manualBonuses.some((m) => m.id === b.id))
                    .map((b) => (
                      <p key={b.id} className="flex justify-between text-sm">
                        <span>{b.name} (meta alcanzada)</span>
                        <span className="tabular font-medium">{money(b.amount)}</span>
                      </p>
                    ))}
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card title="Anticipos" description="Dinero adelantado a un barbero; se descuenta de su pago de la semana.">
        {closed ? null : (
          <form
            className="grid items-end gap-3 sm:grid-cols-[200px_140px_minmax(0,1fr)_auto]"
            onSubmit={(e) => {
              e.preventDefault()
              add.mutate()
            }}
          >
            <Select
              label="Barbero"
              value={adv.staffId}
              onValueChange={(staffId) => setAdv((a) => ({ ...a, staffId }))}
              options={[
                { value: '', label: 'Elige' },
                ...data.staff.filter((s) => s.active).map((s) => ({ value: s.id, label: s.name })),
              ]}
            />
            <Input
              label="Monto"
              prefix="$"
              inputMode="numeric"
              value={adv.amount}
              onChange={(e) => setAdv((a) => ({ ...a, amount: e.target.value.replace(/\D/g, '') }))}
            />
            <Input
              label="Nota (opcional)"
              value={adv.note}
              onChange={(e) => setAdv((a) => ({ ...a, note: e.target.value }))}
            />
            <button
              type="submit"
              disabled={!adv.staffId || !adv.amount || add.isPending}
              className={buttonClass({ size: 'sm' })}
            >
              Registrar
            </button>
          </form>
        )}
        {error && <Alert tone="danger" title={error} className="mt-3" />}
        {data.advances.length > 0 ? (
          <ul className="mt-4 divide-y divide-line rounded-md border border-line" aria-label="Anticipos de la semana">
            {data.advances.map((x) => (
              <li key={x.id} className="flex items-center gap-3 px-4 py-2.5 text-sm">
                <span className="tabular w-16 shrink-0 text-fg-muted">{capitalize(formatDay(x.date, 'EEE d'))}</span>
                <span className="min-w-0 flex-1">
                  <span className="font-medium">{staffName(x.staffId)}</span>
                  {x.note && <span className="text-fg-muted"> · {x.note}</span>}
                </span>
                <span className="tabular font-semibold">{money(x.amount)}</span>
                {!closed && (
                  <button
                    type="button"
                    onClick={() => remove.mutate(x.id)}
                    aria-label={`Quitar anticipo de ${staffName(x.staffId)}`}
                    className="grid size-10 place-items-center rounded-full text-fg-muted hover:bg-fg/5 hover:text-fg focus-visible:outline focus-visible:outline-2 focus-visible:outline-focus"
                  >
                    <Trash2 className="size-4" aria-hidden />
                  </button>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-4 text-sm text-fg-muted">Sin anticipos esta semana.</p>
        )}
      </Card>

      <Dialog
        open={confirmClose}
        onOpenChange={setConfirmClose}
        title={`¿Cerrar la semana del ${weekLabel(from)}?`}
        description={
          to >= today
            ? 'La semana todavía no termina. Al cerrarla, los recibos se guardan como están ahora y ya no cambian.'
            : 'Los recibos se guardan como están y ya no cambian. Después podrás marcar cada uno como pagado.'
        }
        footer={
          <>
            <button
              type="button"
              onClick={() => setConfirmClose(false)}
              className={buttonClass({ variant: 'secondary', size: 'sm' })}
            >
              Volver
            </button>
            <button
              type="button"
              disabled={closeWeek.isPending}
              onClick={() => closeWeek.mutate()}
              className={buttonClass({ size: 'sm' })}
            >
              Cerrar semana
            </button>
          </>
        }
      />

      <SidePanel
        open={!!receipt}
        onOpenChange={(o) => !o && setReceipt(null)}
        title={receipt ? `Recibo · ${receipt.name}` : 'Recibo'}
        description={`Semana del ${weekLabel(from)}`}
        footer={
          <button
            type="button"
            onClick={() => window.print()}
            className={buttonClass({ variant: 'secondary', size: 'sm' })}
          >
            <Printer className="size-4" aria-hidden /> Imprimir
          </button>
        }
      >
        {receipt && (
          <div className="grid gap-5 text-sm">
            <dl className="grid gap-2 rounded-lg border border-line p-4">
              {(
                [
                  ['Servicios realizados', String(receipt.services)],
                  ['Ventas generadas', money(receipt.sales)],
                  ['Comisión', money(receipt.commission)],
                  ['Propinas', money(receipt.tips)],
                  ...receipt.bonuses.map((b) => [`Bono: ${b.name}`, money(b.amount)] as const),
                  ['Anticipos', receipt.advances ? `−${money(receipt.advances)}` : '—'],
                ] as const
              ).map(([k, v]) => (
                <div key={k} className="flex justify-between gap-3">
                  <dt className="text-fg-muted">{k}</dt>
                  <dd className="tabular">{v}</dd>
                </div>
              ))}
              <div className="mt-1 flex justify-between gap-3 border-t border-line pt-3 text-base font-semibold">
                <dt>A pagar</dt>
                <dd className="tabular">{money(receipt.pay)}</dd>
              </div>
            </dl>
            {receipt.missing > 0 && (
              <Alert tone="warning" title={`${receipt.missing} servicios sin comisión capturada`}>
                Captura su comisión en Equipo para que se sume.
              </Alert>
            )}
            <ul className="divide-y divide-line rounded-md border border-line" aria-label="Servicios de la semana">
              {receipt.lines.map((l) => (
                <li key={l.appointmentId} className="flex justify-between gap-3 px-4 py-2.5">
                  <span className="min-w-0">
                    <span className="block">{l.services.map((s) => s.name).join(' + ')}</span>
                    <span className="text-[13px] text-fg-muted">
                      {capitalize(formatDay(l.date, 'EEE d'))} · {l.customer}
                    </span>
                  </span>
                  <span className="tabular shrink-0 text-right">
                    {l.services.some((s) => s.commission === null)
                      ? '—'
                      : money(l.services.reduce((t, s) => t + (s.commission ?? 0), 0))}
                    {l.tip > 0 && <span className="block text-[13px] text-fg-muted">+{money(l.tip)} propina</span>}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </SidePanel>
    </div>
  )
}
