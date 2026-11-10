import { useState, type ReactNode } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { CalendarPlus, MessageCircle, Phone } from 'lucide-react'
import { routes } from '@/app/routes'
import { Alert } from '@/components/ui/Alert'
import { buttonClass } from '@/components/ui/buttonClass'
import { TextArea } from '@/components/ui/Field'
import { Skeleton } from '@/components/ui/Skeleton'
import type { Appointment, Service, Staff } from '@/domain/types'
import { formatMxPhone } from '@/lib/phone'
import { capitalize, formatDateLong, formatDay, formatTime12, localDate, localTime, money } from '@/lib/time'
import { useNewAppointment } from '../agenda/NewAppointmentContext'
import { useAdminAuth, useAdminSession } from '../auth/AdminAuth'
import { AdminStatusBadge } from '../ui/AdminStatusBadge'
import { Input } from '../ui/controls'
import { SidePanel } from '../ui/SidePanel'
import { useToast } from '../ui/Toast'
import { errorMessage } from '../agenda/useAgendaActions'
import { hasReward, isRestricted, NO_SHOW_LIMIT, NO_SHOW_WINDOW_DAYS } from './model'
import { isFinanceRole } from '../domain'

const HISTORY_STEP = 8

function Section({ title, children, aside }: { title: string; children: ReactNode; aside?: ReactNode }) {
  return (
    <section className="grid gap-2.5">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-[12px] font-semibold uppercase tracking-[0.08em] text-fg-muted">{title}</h3>
        {aside}
      </div>
      {children}
    </section>
  )
}

function Stat({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="rounded-md border border-line px-3 py-2.5">
      <p className="text-[12px] text-fg-muted">{label}</p>
      <p className="tabular mt-0.5 text-lg font-semibold leading-tight">{value}</p>
    </div>
  )
}

/** One appointment row: date and time, services, barber, status; opens it in the agenda. */
function ApptRow({ a, staff, services, tz }: { a: Appointment; staff: Staff[]; services: Service[]; tz: string }) {
  const barber = staff.find((s) => s.id === a.staffId)?.name.split(' ')[0]
  const names = a.serviceIds.map((id) => services.find((s) => s.id === id)?.name).filter(Boolean)
  return (
    <li>
      <Link
        to={routes.adminAgenda({ fecha: localDate(a.startsAt, tz), cita: a.id })}
        className="flex items-center gap-3 px-3 py-2.5 text-sm hover:bg-fg/[0.03] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-focus"
      >
        <span className="tabular w-[104px] shrink-0">
          <span className="block font-semibold">
            {capitalize(formatDay(localDate(a.startsAt, tz), 'EEE d MMM yy'))}
          </span>
          <span className="block text-[13px] text-fg-muted">{formatTime12(localTime(a.startsAt, tz))}</span>
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate">{names.join(', ')}</span>
          <span className="block text-[13px] text-fg-muted">
            {barber ? `con ${barber} · ` : ''}
            {money(a.totalPrice)}
          </span>
        </span>
        <AdminStatusBadge status={a.status} />
      </Link>
    </li>
  )
}

/**
 * A customer's profile: contact (call or WhatsApp in one tap), visits and
 * no-shows, loyalty card, upcoming appointments, history and editable details.
 * "Agendar cita" opens the booking panel with this customer already chosen.
 */
export function CustomerPanel({
  customerId,
  staff,
  services,
  timeZone,
  onClose,
}: {
  customerId: string | null
  staff: Staff[]
  services: Service[]
  timeZone: string
  onClose: () => void
}) {
  const { repo } = useAdminAuth()
  const { user } = useAdminSession()
  const booking = useNewAppointment()
  const qc = useQueryClient()
  const toast = useToast()
  const seesMoney = isFinanceRole(user.role)
  const [shown, setShown] = useState(HISTORY_STEP)
  const [form, setForm] = useState<{ name: string; phone: string; email: string; notes: string } | null>(null)
  const [formFor, setFormFor] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const { data } = useQuery({
    queryKey: ['admin', 'customer', customerId],
    queryFn: () => repo.getCustomer(customerId!),
    enabled: !!customerId,
  })
  // Fill the form when a (new) customer loads.
  if (data && data.summary.customer.id !== formFor) {
    const c = data.summary.customer
    setFormFor(c.id)
    setForm({ name: c.name, phone: c.phone ? formatMxPhone(c.phone) : '', email: c.email, notes: c.notes ?? '' })
    setShown(HISTORY_STEP)
    setError(null)
  }

  const save = useMutation({
    mutationFn: () => repo.updateCustomer(customerId!, form!),
    onSuccess: () => {
      toast('Datos del cliente guardados')
      void qc.invalidateQueries({ queryKey: ['admin'] })
      setFormFor(null) // reload the form from the saved data
    },
    onError: (e) => setError(errorMessage(e)),
  })

  if (!customerId) return null
  const s = data?.summary
  const c = s?.customer
  const t = Date.now()
  const upcoming = (data?.appointments ?? [])
    .filter((a) => (a.status === 'booked' || a.status === 'confirmed') && Date.parse(a.endsAt) > t)
    .reverse()
  const past = (data?.appointments ?? []).filter((a) => !upcoming.includes(a))
  const dirty =
    !!c &&
    !!form &&
    (form.name.trim() !== c.name ||
      form.phone.replace(/\D/g, '') !== c.phone ||
      form.email.trim().toLowerCase() !== c.email ||
      form.notes.trim() !== (c.notes ?? ''))
  const card = s?.loyalty

  return (
    <SidePanel
      open
      wide
      onOpenChange={(o) => !o && onClose()}
      title={c?.name ?? 'Cliente'}
      description={
        s && c
          ? `Cliente desde ${formatDay(localDate(c.createdAt, timeZone), "MMMM 'de' yyyy")} · ${s.visits} ${s.visits === 1 ? 'visita' : 'visitas'}`
          : 'Cargando…'
      }
      footer={
        dirty ? (
          <>
            <button
              type="button"
              onClick={() => setFormFor(null)}
              className={buttonClass({ variant: 'secondary', size: 'sm' })}
            >
              Descartar cambios
            </button>
            <button
              type="button"
              disabled={save.isPending}
              onClick={() => {
                setError(null)
                save.mutate()
              }}
              className={buttonClass({ size: 'sm' })}
            >
              {save.isPending ? 'Guardando…' : 'Guardar cambios'}
            </button>
          </>
        ) : undefined
      }
    >
      {!s || !c || !form ? (
        <div className="grid gap-4" aria-busy="true">
          <Skeleton className="h-10 w-2/3" />
          <Skeleton className="h-24" />
          <Skeleton className="h-40" />
        </div>
      ) : (
        <div className="grid gap-7">
          {error && <Alert tone="danger" title={error} />}

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => {
                onClose()
                booking.open({ customer: c })
              }}
              className={buttonClass({ size: 'sm' })}
            >
              <CalendarPlus className="size-4" strokeWidth={1.75} aria-hidden /> Agendar cita
            </button>
            {c.phone && (
              <>
                <a href={`tel:+52${c.phone}`} className={buttonClass({ variant: 'secondary', size: 'sm' })}>
                  <Phone className="size-4" strokeWidth={1.75} aria-hidden /> Llamar
                </a>
                <a
                  href={`https://wa.me/52${c.phone}`}
                  target="_blank"
                  rel="noreferrer"
                  className={buttonClass({ variant: 'secondary', size: 'sm' })}
                >
                  <MessageCircle className="size-4" strokeWidth={1.75} aria-hidden /> WhatsApp
                  <span className="sr-only">(se abre en otra pestaña)</span>
                </a>
              </>
            )}
          </div>

          {isRestricted(s) && (
            <Alert tone="warning" title={`${s.recentNoShows} no-shows en los últimos ${NO_SHOW_WINDOW_DAYS} días`}>
              Con {NO_SHOW_LIMIT} o más, la reserva en línea le pide contactar a la barbería. Puedes agendarle desde
              aquí.
            </Alert>
          )}

          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Stat label="Visitas" value={s.visits} />
            <Stat label="No-shows" value={s.noShows} />
            <Stat
              label="Última visita"
              value={s.lastVisit ? capitalize(formatDay(localDate(s.lastVisit, timeZone), 'd MMM')) : '—'}
            />
            {seesMoney ? (
              <Stat label="Total gastado" value={money(s.totalSpent)} />
            ) : (
              <Stat label="Cancelaciones" value={s.cancellations} />
            )}
          </div>

          <Section title="Lealtad">
            {card ? (
              <div className="grid gap-2">
                <div className="flex items-center gap-3">
                  <div role="img" aria-label={`${card.stamps} de ${card.goal} sellos`} className="flex flex-wrap gap-1">
                    {Array.from({ length: card.goal }, (_, i) => (
                      <span
                        key={i}
                        className={
                          i < card.stamps
                            ? 'size-4 rounded-full bg-ink-950'
                            : 'size-4 rounded-full border border-line-strong'
                        }
                      />
                    ))}
                  </div>
                  <span className="tabular text-sm font-medium">
                    {card.stamps}/{card.goal}
                  </span>
                </div>
                <p className="text-[13px] text-fg-muted">
                  {hasReward(s)
                    ? `Corte gratis disponible hasta el ${formatDateLong(localDate(card.rewardExpiresAt!, timeZone))}.`
                    : `Le faltan ${card.goal - card.stamps} para el corte gratis.`}
                </p>
              </div>
            ) : (
              <p className="text-sm text-fg-muted">Aún sin tarjeta: se crea con su primera cita completada.</p>
            )}
          </Section>

          <Section title={`Próximas citas${upcoming.length ? ` (${upcoming.length})` : ''}`}>
            {upcoming.length ? (
              <ul className="divide-y divide-line rounded-md border border-line">
                {upcoming.map((a) => (
                  <ApptRow key={a.id} a={a} staff={staff} services={services} tz={timeZone} />
                ))}
              </ul>
            ) : (
              <p className="text-sm text-fg-muted">Sin citas próximas.</p>
            )}
          </Section>

          <Section title={`Historial${past.length ? ` (${past.length})` : ''}`}>
            {past.length ? (
              <>
                <ul className="divide-y divide-line rounded-md border border-line">
                  {past.slice(0, shown).map((a) => (
                    <ApptRow key={a.id} a={a} staff={staff} services={services} tz={timeZone} />
                  ))}
                </ul>
                {past.length > shown && (
                  <button
                    type="button"
                    onClick={() => setShown((n) => n + HISTORY_STEP)}
                    className={buttonClass({ variant: 'ghost', size: 'sm', className: 'justify-self-start' })}
                  >
                    Ver más ({past.length - shown})
                  </button>
                )}
              </>
            ) : (
              <p className="text-sm text-fg-muted">Todavía no tiene citas pasadas.</p>
            )}
          </Section>

          <Section title="Datos y notas">
            <form
              className="grid gap-4"
              onSubmit={(e) => {
                e.preventDefault()
                if (dirty) save.mutate()
              }}
            >
              <Input label="Nombre" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
              <div className="grid gap-4 sm:grid-cols-2">
                <Input
                  label="Teléfono"
                  type="tel"
                  inputMode="tel"
                  value={form.phone}
                  onChange={(e) => setForm({ ...form, phone: e.target.value })}
                />
                <Input
                  label="Correo"
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                />
              </div>
              <TextArea
                label="Notas del cliente"
                optional
                placeholder="Preferencias, alergias, cómo le gusta su corte…"
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
              />
            </form>
          </Section>
        </div>
      )}
    </SidePanel>
  )
}
