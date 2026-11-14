import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { Mail, Moon, Phone, UserRound } from 'lucide-react'
import { routes } from '@/app/routes'
import type { Appointment, LocalDate, Service, Staff } from '@/domain/types'
import { Avatar } from '@/components/booking/Avatar'
import { Alert } from '@/components/ui/Alert'
import { buttonClass } from '@/components/ui/buttonClass'
import { Dialog } from '@/components/ui/Dialog'
import { TextArea } from '@/components/ui/Field'
import { usePolicy } from '@/app/queries'
import { rewardAvailable, rewardFor } from '@/lib/loyalty'
import { printTicket, ticketFromAppointment } from '../ticket'
import { TicketButtons } from '../ui/TicketButtons'
import { formatMxPhone } from '@/lib/phone'
import { capitalize, durationLabel, formatDateLong, formatTime12, localDate, localTime, money } from '@/lib/time'
import { useAdminAuth, useAdminSession } from '../auth/AdminAuth'
import type { PaymentInput, StaffStatusChange } from '../domain'
import { methodLabels, productsTotalOf, methodPhrases } from '../cash'
import { CompleteDialog } from './CompleteDialog'
import { EditAppointmentPanel } from './EditAppointmentPanel'
import { DatePicker } from '../ui/DatePicker'
import { Select } from '../ui/Select'
import { SidePanel } from '../ui/SidePanel'
import { useToast } from '../ui/Toast'
import { AdminStatusBadge } from '../ui/AdminStatusBadge'
import { isLive, sourceLabel } from '../ui/appointmentStyle'
import { canComplete, canMarkNoShow, isOpen } from './model'
import { errorMessage, useAgendaActions } from './useAgendaActions'
import { isFinanceRole, isOwnerRole } from '../domain'

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="grid gap-2">
      <h3 className="text-[12px] font-semibold uppercase tracking-[0.08em] text-fg-muted">{title}</h3>
      {children}
    </section>
  )
}

function Reschedule({
  appointment: a,
  staff,
  timeZone,
  onDone,
  onBack,
}: {
  appointment: Appointment
  staff: Staff[]
  timeZone: string
  onDone: () => void
  onBack: () => void
}) {
  const { repo } = useAdminAuth()
  const { reschedule } = useAgendaActions()
  const toast = useToast()
  const [staffId, setStaffId] = useState(a.staffId)
  const [date, setDate] = useState<LocalDate>(localDate(a.startsAt, timeZone))
  const [startsAt, setStartsAt] = useState('')
  const [error, setError] = useState<string | null>(null)
  const { data: slots, isFetching } = useQuery({
    queryKey: ['admin', 'slots', a.id, staffId, date],
    queryFn: () => repo.getAvailableSlots({ serviceIds: a.serviceIds, staffId, date, excludeAppointmentId: a.id }),
  })
  const free = slots?.filter((s) => s.available) ?? []

  const save = () => {
    if (!startsAt) return setError('Elige un horario.')
    setError(null)
    reschedule.mutate([a.id, { startsAt, staffId }], {
      onSuccess: (r) => {
        toast(
          `Cita movida al ${formatDateLong(localDate(r.startsAt, timeZone))}, ${formatTime12(localTime(r.startsAt, timeZone))}`,
        )
        onDone()
      },
      onError: (e) => setError(errorMessage(e)),
    })
  }

  return (
    <div className="grid gap-5">
      {error && <Alert tone="danger" title={error} />}
      <Select
        label="Barbero"
        value={staffId}
        onValueChange={(v) => {
          setStaffId(v)
          setStartsAt('')
        }}
        options={staff.map((s) => ({ value: s.id, label: s.name }))}
      />
      <DatePicker
        label="Fecha"
        value={date}
        today={localDate(new Date(), timeZone)}
        min={localDate(new Date(), timeZone)}
        onChange={(d) => {
          setDate(d)
          setStartsAt('')
        }}
      />
      <Select
        label="Hora"
        value={startsAt}
        onValueChange={setStartsAt}
        disabled={isFetching || free.length === 0}
        hint={
          isFetching
            ? 'Buscando horarios…'
            : free.length === 0
              ? 'Sin horarios libres ese día con ese barbero.'
              : `${free.length} horarios libres (${durationLabel(a.durationMin)}).`
        }
        options={[
          { value: '', label: 'Elige un horario' },
          ...free.map((s) => ({ value: s.startsAt, label: formatTime12(s.time) })),
        ]}
      />
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <button type="button" onClick={onBack} className={buttonClass({ variant: 'secondary', size: 'sm' })}>
          Volver
        </button>
        <button type="button" onClick={save} disabled={reschedule.isPending} className={buttonClass({ size: 'sm' })}>
          {reschedule.isPending ? 'Guardando…' : 'Guardar cambio'}
        </button>
      </div>
    </div>
  )
}

/**
 * Everything about one appointment, with the actions that apply right now.
 * Desk roles can do everything; a barber can confirm, complete and mark no-show
 * on their own appointments.
 */
export function AppointmentPanel({
  appointment: a,
  staff,
  services,
  timeZone,
  now,
  canManage,
  onClose,
}: {
  appointment: Appointment | null
  staff: Staff[]
  services: Service[]
  timeZone: string
  now: Date
  canManage: boolean
  onClose: () => void
}) {
  const { repo } = useAdminAuth()
  const { setStatus, complete, notes: saveNotes } = useAgendaActions()
  const toast = useToast()
  const [mode, setMode] = useState<'detail' | 'reschedule'>('detail')
  const [confirm, setConfirm] = useState<null | 'cancelled' | 'no_show'>(null)
  const [charging, setCharging] = useState(false)
  const [fixing, setFixing] = useState(false)
  const [editing, setEditing] = useState(false)
  const [chargeError, setChargeError] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [notes, setNotes] = useState(a?.notes ?? '')
  const [shownFor, setShownFor] = useState(a?.id)
  if (a?.id !== shownFor) {
    setShownFor(a?.id)
    setNotes(a?.notes ?? '')
    setMode('detail')
    setError(null)
    setFixing(false)
    setEditing(false)
  }

  const { toleranceMin } = usePolicy()
  const { user } = useAdminSession()
  // Corrections are for the owner and the developer only.
  const isOwner = isOwnerRole(user.role)
  const qc = useQueryClient()
  const { data: productsOnSale } = useQuery({
    queryKey: ['admin', 'products'],
    queryFn: () => repo.listProducts(),
    enabled: charging || fixing,
  })
  const correct = useMutation({
    mutationFn: (v: { payment: PaymentInput & { serviceIds?: string[] }; reason: string }) =>
      repo.correctPayment(a!.id, { ...v.payment, serviceIds: v.payment.serviceIds ?? a!.serviceIds }, v.reason),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['admin'] })
      setFixing(false)
      toast('Cobro corregido')
    },
    onError: (e) => setChargeError(errorMessage(e)),
  })
  const voidCharge = useMutation({
    mutationFn: (reason: string) => repo.voidPayment(a!.id, reason),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['admin'] })
      setFixing(false)
      toast('Cobro anulado: la cita quedó sin cobrar')
    },
    onError: (e) => setChargeError(errorMessage(e)),
  })
  const { data: card } = useQuery({
    queryKey: ['admin', 'day', 'loyalty', a?.customerId],
    queryFn: () => repo.getLoyaltyForCustomer(a!.customerId),
    enabled: !!a,
  })

  if (!a) return null

  const barber = staff.find((s) => s.id === a.staffId)
  // The same service can appear twice (e.g. two haircuts added at checkout): one row with its quantity.
  const svc = [...new Set(a.serviceIds)]
    .map((id) => ({ s: services.find((x) => x.id === id), n: a.serviceIds.filter((x) => x === id).length }))
    .filter((x): x is { s: Service; n: number } => !!x.s)
  const day = capitalize(formatDateLong(localDate(a.startsAt, timeZone)))
  const range = `${formatTime12(localTime(a.startsAt, timeZone))} – ${formatTime12(localTime(a.endsAt, timeZone))}`
  const open = isOpen(a)
  const completeOk = canComplete(a, now)
  const noShowOk = canMarkNoShow(a, now, toleranceMin)

  const change = (status: StaffStatusChange) => {
    setError(null)
    setStatus.mutate([a.id, status], {
      onSuccess: () => {
        setConfirm(null)
        toast({ confirmed: 'Cita confirmada', no_show: 'Marcada como no-show', cancelled: 'Cita cancelada' }[status])
      },
      onError: (e) => {
        setConfirm(null)
        setError(errorMessage(e))
      },
    })
  }

  const finish = (payment: PaymentInput, print: boolean) => {
    setChargeError(null)
    complete.mutate([a.id, payment], {
      onSuccess: (r) => {
        setCharging(false)
        if (print && r.appointment.payment)
          void printTicket(ticketFromAppointment(r.appointment, services, barber?.name, r.loyalty)).catch(() =>
            toast('No se pudo generar el ticket. Usa «Imprimir ticket» en la cita.', 'danger'),
          )
        const p = r.appointment.payment
        const paid = p
          ? ` · ${money(p.amount + productsTotalOf(p) + p.tip)}${p.splits?.length ? ' (pago mixto)' : ` ${methodPhrases[p.method]}`}`
          : ''
        const l = r.loyalty
        toast(
          `Cita completada${paid}` +
            (r.stampAdded && l
              ? l.stamps >= l.goal
                ? ' · ¡corte gratis desbloqueado!'
                : ` · sello ${l.stamps} de ${l.goal}`
              : ''),
        )
      },
      onError: (e) => setChargeError(errorMessage(e)),
    })
  }

  const notesChanged = notes.trim() !== a.notes
  const busy = setStatus.isPending || complete.isPending

  return (
    <>
      <SidePanel
        open
        onOpenChange={(o) => !o && onClose()}
        title={mode === 'reschedule' ? `Reprogramar a ${a.customer.name}` : a.customer.name}
        description={`${day} · ${range}`}
        footer={
          mode === 'detail' && open && canManage ? (
            <>
              <button
                type="button"
                onClick={() => setConfirm('cancelled')}
                className={buttonClass({ variant: 'ghost', size: 'sm', className: 'text-fg-danger sm:mr-auto' })}
              >
                Cancelar cita
              </button>
              {isOwner && (
                <button
                  type="button"
                  onClick={() => setEditing(true)}
                  className={buttonClass({ variant: 'secondary', size: 'sm' })}
                >
                  Editar cita
                </button>
              )}
              <button
                type="button"
                onClick={() => setMode('reschedule')}
                className={buttonClass({ variant: 'secondary', size: 'sm' })}
              >
                Reprogramar
              </button>
            </>
          ) : undefined
        }
      >
        {mode === 'reschedule' ? (
          <Reschedule
            appointment={a}
            staff={staff}
            timeZone={timeZone}
            onBack={() => setMode('detail')}
            onDone={() => setMode('detail')}
          />
        ) : (
          <div className="grid gap-6">
            {error && <Alert tone="danger" title={error} />}

            <div className="grid gap-3 rounded-lg border border-line bg-surface p-4">
              <div className="flex flex-wrap items-center gap-2">
                {isLive(a, now) ? (
                  <span className="inline-flex h-[22px] items-center gap-1.5 rounded-full bg-ink-950 px-2.5 text-[12.5px] font-semibold text-white">
                    <span aria-hidden className="size-1.5 rounded-full bg-aqua-500" /> En curso
                  </span>
                ) : (
                  <AdminStatusBadge status={a.status} />
                )}
                <span className="text-[13px] text-fg-muted">{sourceLabel[a.source ?? 'online']}</span>
                {a.afterHours && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-fg/[0.06] px-2 py-0.5 text-[12px] font-medium">
                    <Moon className="size-3.5" aria-hidden /> Fuera de horario
                  </span>
                )}
              </div>
              {open && (
                <div className="flex flex-wrap gap-2">
                  {a.status === 'booked' && (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => change('confirmed')}
                      className={buttonClass({ variant: 'secondary', size: 'sm' })}
                    >
                      Confirmar
                    </button>
                  )}
                  <button
                    type="button"
                    disabled={busy || !completeOk}
                    onClick={() => {
                      setChargeError(null)
                      setCharging(true)
                    }}
                    className={buttonClass({ size: 'sm' })}
                  >
                    Completar y cobrar
                  </button>
                  <button
                    type="button"
                    disabled={busy || !noShowOk}
                    onClick={() => setConfirm('no_show')}
                    className={buttonClass({ variant: 'secondary', size: 'sm' })}
                  >
                    No se presentó
                  </button>
                </div>
              )}
              {open && !noShowOk && (
                <p className="text-[13px] text-fg-muted">No-show disponible tras {toleranceMin} min de tolerancia.</p>
              )}
            </div>

            {a.payment && (
              <Section title="Pago">
                <dl className="grid gap-1 rounded-md border border-line px-3 py-2.5 text-sm">
                  <div className="flex justify-between gap-3">
                    <dt className="text-fg-muted">Servicios</dt>
                    <dd className="tabular">{money(a.payment.amount)}</dd>
                  </div>
                  {a.payment.rewardAmount ? (
                    <p className="text-[13px] text-fg-muted">
                      Incluye corte gratis de lealtad (−{money(a.payment.rewardAmount)}).
                    </p>
                  ) : null}
                  {a.payment.discount && (
                    <p className="text-[13px] text-fg-muted">
                      Descuento de {money(a.payment.discount.amount)} · {a.payment.discount.reason} · autorizó{' '}
                      {a.payment.discount.authorizedByName}
                    </p>
                  )}
                  {(a.payment.products ?? []).map((p) => (
                    <div key={p.productId} className="flex justify-between gap-3">
                      <dt className="text-fg-muted">{p.qty > 1 ? `${p.qty} × ${p.name}` : p.name}</dt>
                      <dd className="tabular">{money(p.price * p.qty)}</dd>
                    </div>
                  ))}
                  <div className="flex justify-between gap-3">
                    <dt className="text-fg-muted">
                      Propina{a.payment.tip > 0 ? ` · ${methodLabels[a.payment.tipMethod]}` : ''}
                    </dt>
                    <dd className="tabular">{a.payment.tip > 0 ? money(a.payment.tip) : 'Sin propina'}</dd>
                  </div>
                  <div className="flex justify-between gap-3 border-t border-line pt-1.5 font-semibold">
                    <dt>Total cobrado · {formatTime12(localTime(a.payment.paidAt, timeZone))}</dt>
                    <dd className="tabular">{money(a.payment.amount + productsTotalOf(a.payment) + a.payment.tip)}</dd>
                  </div>
                  <p className="text-[13px] text-fg-muted">
                    {a.payment.splits?.length
                      ? `Pago mixto: ${a.payment.splits.map((x) => `${methodLabels[x.method]} ${money(x.amount)}`).join(' + ')}`
                      : `Pagó con ${methodLabels[a.payment.method].toLowerCase()}`}
                  </p>
                  {a.payment.correction && (
                    <p className="text-[13px] text-fg-muted">
                      Corregido por {a.payment.correction.by} el{' '}
                      {capitalize(formatDateLong(localDate(a.payment.correction.at, timeZone)))} ·{' '}
                      {a.payment.correction.reason}
                    </p>
                  )}
                </dl>
                <TicketButtons ticket={() => ticketFromAppointment(a, services, barber?.name, card)} />
                {isOwner && a.status === 'completed' && (
                  <button
                    type="button"
                    onClick={() => {
                      setChargeError(null)
                      setFixing(true)
                    }}
                    className={buttonClass({ variant: 'secondary', size: 'sm', className: 'justify-self-start' })}
                  >
                    Corregir cobro
                  </button>
                )}
              </Section>
            )}

            <Section title="Servicios">
              <ul className="divide-y divide-line rounded-md border border-line">
                {svc.map(({ s, n }) => (
                  <li key={s.id} className="flex items-center justify-between gap-3 px-3 py-2.5 text-sm">
                    <span className="min-w-0">
                      <span className="block font-medium">
                        {n > 1 ? `${n} × ` : ''}
                        {s.name}
                      </span>
                      <span className="text-fg-muted">{durationLabel(s.durationMin)}</span>
                    </span>
                    <span className="tabular font-medium">{money(s.price * n)}</span>
                  </li>
                ))}
                <li className="flex items-center justify-between gap-3 px-3 py-2.5 text-sm font-semibold">
                  <span>Total · {durationLabel(a.durationMin)}</span>
                  <span className="tabular">{money(a.totalPrice)}</span>
                </li>
              </ul>
            </Section>

            {barber && (
              <Section title="Barbero">
                <p className="flex items-center gap-3 text-sm font-medium">
                  <Avatar name={barber.name} src={barber.photoUrl} size={32} />
                  {barber.name}
                </p>
              </Section>
            )}

            <Section title="Contacto">
              <div className="grid gap-1.5 text-sm">
                {canManage && (
                  <Link
                    to={`${routes.adminSection('clientes')}?cliente=${a.customerId}`}
                    className="inline-flex items-center gap-2 font-medium underline decoration-line-strong underline-offset-4 hover:decoration-fg"
                  >
                    <UserRound className="size-4 text-fg-muted" aria-hidden /> Ver ficha del cliente
                  </Link>
                )}
                {a.customer.phone ? (
                  <a
                    href={`tel:+52${a.customer.phone}`}
                    className="inline-flex items-center gap-2 font-medium underline decoration-line-strong underline-offset-4 hover:decoration-fg"
                  >
                    <Phone className="size-4 text-fg-muted" aria-hidden /> {formatMxPhone(a.customer.phone)}
                  </a>
                ) : (
                  <p className="text-fg-muted">Sin teléfono</p>
                )}
                {a.customer.email && (
                  <a
                    href={`mailto:${a.customer.email}`}
                    className="inline-flex items-center gap-2 underline decoration-line-strong underline-offset-4 hover:decoration-fg"
                  >
                    <Mail className="size-4 text-fg-muted" aria-hidden /> {a.customer.email}
                  </a>
                )}
              </div>
            </Section>

            {card && (
              <Section title="Lealtad">
                <div className="flex items-center gap-3">
                  <div role="img" aria-label={`${card.stamps} de ${card.goal} sellos`} className="flex flex-wrap gap-1">
                    {Array.from({ length: card.goal }, (_, i) => (
                      <span
                        key={i}
                        className={
                          i < card.stamps
                            ? 'size-3.5 rounded-full bg-ink-950'
                            : 'size-3.5 rounded-full border border-line-strong'
                        }
                      />
                    ))}
                  </div>
                  <span className="tabular text-sm font-medium">
                    {card.stamps}/{card.goal}
                  </span>
                </div>
                {card.rewardExpiresAt && (
                  <p className="text-[13px] text-fg-accent">
                    Corte gratis disponible hasta el {formatDateLong(localDate(card.rewardExpiresAt, timeZone))}.
                  </p>
                )}
              </Section>
            )}

            <Section title="Notas">
              <TextArea
                label="Notas de la cita"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Preferencias, alergias, recordatorios…"
                disabled={!canManage}
              />
              {notesChanged && canManage && (
                <button
                  type="button"
                  disabled={saveNotes.isPending}
                  onClick={() =>
                    saveNotes.mutate([a.id, notes], {
                      onSuccess: () => toast('Notas guardadas'),
                      onError: (e) => setError(errorMessage(e)),
                    })
                  }
                  className={buttonClass({ variant: 'secondary', size: 'sm', className: 'justify-self-start' })}
                >
                  Guardar notas
                </button>
              )}
            </Section>
          </div>
        )}
      </SidePanel>

      <Dialog
        open={confirm !== null}
        onOpenChange={(o) => !o && setConfirm(null)}
        title={confirm === 'cancelled' ? '¿Cancelar esta cita?' : '¿Marcar como no-show?'}
        description={
          confirm === 'cancelled'
            ? `${a.customer.name}, ${day.toLowerCase()} a las ${formatTime12(localTime(a.startsAt, timeZone))}. El horario queda libre.`
            : `${a.customer.name} no llegó. Queda en su historial y el horario se libera.`
        }
        footer={
          <>
            <button
              type="button"
              onClick={() => setConfirm(null)}
              className={buttonClass({ variant: 'secondary', size: 'sm' })}
            >
              Volver
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => confirm && change(confirm)}
              className={buttonClass({ variant: 'danger', size: 'sm' })}
            >
              {confirm === 'cancelled' ? 'Sí, cancelar' : 'Sí, no se presentó'}
            </button>
          </>
        }
      />
      <CompleteDialog
        appointment={a}
        open={charging}
        busy={complete.isPending}
        error={chargeError}
        onCancel={() => setCharging(false)}
        onConfirm={finish}
        reward={rewardAvailable(card, now) ? rewardFor(a.serviceIds, services) : null}
        products={productsOnSale ?? []}
        services={services}
        canAuthorize={isFinanceRole(user.role)}
      />
      {isOwner && a.payment && (
        <CompleteDialog
          appointment={a}
          open={fixing}
          busy={correct.isPending || voidCharge.isPending}
          error={chargeError}
          onCancel={() => setFixing(false)}
          onConfirm={(payment, _print, reason) => correct.mutate({ payment, reason: reason ?? '' })}
          onVoid={(reason) => voidCharge.mutate(reason)}
          correcting={a.payment}
          reward={a.payment.rewardServiceId || rewardAvailable(card, now) ? rewardFor(a.serviceIds, services) : null}
          products={productsOnSale ?? []}
          services={services}
          canAuthorize
        />
      )}
      {isOwner && isOpen(a) && (
        <EditAppointmentPanel appointment={a} services={services} open={editing} onClose={() => setEditing(false)} />
      )}
    </>
  )
}
