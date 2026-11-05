import { useMemo, useState, type ReactNode } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Check, Scissors, UserRound, X } from 'lucide-react'
import type { Customer, LocalDate, Service, ServiceCategory, Slot, Staff } from '@/domain/types'
import { Avatar } from '@/components/booking/Avatar'
import { Alert } from '@/components/ui/Alert'
import { buttonClass } from '@/components/ui/buttonClass'
import { TextArea } from '@/components/ui/Field'
import { cn } from '@/lib/cn'
import { formatMxPhone } from '@/lib/phone'
import {
  capitalize,
  durationLabel,
  formatDay,
  formatTime12,
  formatTimeCompact,
  localDate,
  localTime,
  money,
} from '@/lib/time'
import { useAdminAuth } from '../auth/AdminAuth'
import { Input, SearchInput, Segmented } from '../ui/controls'
import { DatePicker } from '../ui/DatePicker'
import { SidePanel } from '../ui/SidePanel'
import { useToast } from '../ui/Toast'
import { errorMessage, useAgendaActions } from './useAgendaActions'

export interface NewAppointmentDraft {
  kind: 'cita' | 'walk_in'
  staffId: string | 'any'
  date: LocalDate
  /** "HH:mm" picked on the grid, if any. */
  time?: string
}

function ServicePicker({
  categories,
  services,
  value,
  onChange,
}: {
  categories: ServiceCategory[]
  services: Service[]
  value: string[]
  onChange: (ids: string[]) => void
}) {
  return (
    <fieldset className="grid gap-1.5">
      <legend className="sr-only">Servicios</legend>
      <div className="max-h-64 overflow-y-auto rounded-md border border-line">
        {categories.map((c) => {
          const items = services.filter((s) => s.categoryId === c.id)
          if (!items.length) return null
          return (
            <div key={c.id}>
              <p className="sticky top-0 z-[1] border-b border-line bg-surface px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-fg-muted">
                {c.name}
              </p>
              {items.map((s) => {
                const on = value.includes(s.id)
                return (
                  <label
                    key={s.id}
                    className={cn(
                      'flex min-h-11 cursor-pointer items-center gap-3 border-b border-line px-3 py-2 text-sm last:border-0',
                      on ? 'bg-selected' : 'hover:bg-fg/[0.03]',
                    )}
                  >
                    <input
                      type="checkbox"
                      checked={on}
                      onChange={() => onChange(on ? value.filter((x) => x !== s.id) : [...value, s.id])}
                      className="peer sr-only"
                    />
                    <span
                      aria-hidden
                      className={cn(
                        'grid size-5 shrink-0 place-items-center rounded border-[1.5px] peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-focus',
                        on ? 'border-ink-950 bg-ink-950 text-white' : 'border-line-strong bg-raised',
                      )}
                    >
                      {on && <Check className="size-3.5" strokeWidth={3} />}
                    </span>
                    <span className="min-w-0 flex-1 truncate">{s.name}</span>
                    <span className="tabular shrink-0 text-fg-muted">
                      {durationLabel(s.durationMin)} · {money(s.price)}
                    </span>
                  </label>
                )
              })}
            </div>
          )
        })}
      </div>
    </fieldset>
  )
}

/** Find an existing customer or type a new one. */
function CustomerPicker({
  value,
  onChange,
  phoneOptional,
  newCustomer,
  onNewCustomer,
}: {
  value: Customer | null
  onChange: (c: Customer | null) => void
  phoneOptional: boolean
  newCustomer: { name: string; phone: string; email: string }
  onNewCustomer: (v: { name: string; phone: string; email: string }) => void
}) {
  const { repo } = useAdminAuth()
  const [query, setQuery] = useState('')
  const q = query.trim()
  const { data: results } = useQuery({
    queryKey: ['admin', 'customers', q],
    queryFn: () => repo.findCustomers(q),
    enabled: q.length >= 2,
  })

  if (value) {
    return (
      <div className="flex items-center gap-3 rounded-md border border-ink-950 bg-selected px-3 py-2.5">
        <UserRound className="size-5 shrink-0" strokeWidth={1.75} aria-hidden />
        <div className="min-w-0 flex-1 text-sm">
          <p className="truncate font-semibold">{value.name}</p>
          <p className="truncate text-fg-muted">{value.phone ? formatMxPhone(value.phone) : 'Sin teléfono'}</p>
        </div>
        <button
          type="button"
          onClick={() => onChange(null)}
          aria-label="Quitar cliente"
          className="grid size-9 place-items-center rounded-full hover:bg-fg/5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-focus"
        >
          <X className="size-4" aria-hidden />
        </button>
      </div>
    )
  }

  return (
    <div className="grid gap-3">
      <SearchInput
        label="Buscar cliente"
        placeholder="Buscar cliente por nombre o teléfono"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />
      {q.length >= 2 && results && results.length > 0 && (
        <ul aria-label="Clientes encontrados" className="divide-y divide-line rounded-md border border-line">
          {results.map((c) => (
            <li key={c.id}>
              <button
                type="button"
                onClick={() => onChange(c)}
                className="flex min-h-11 w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm hover:bg-fg/[0.03] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-focus"
              >
                <span className="truncate font-medium">{c.name}</span>
                <span className="tabular shrink-0 text-fg-muted">{c.phone ? formatMxPhone(c.phone) : '—'}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {q.length >= 2 && results?.length === 0 && (
        <p className="text-[13px] text-fg-muted">
          Nadie con ese nombre o teléfono. Captúralo abajo como cliente nuevo.
        </p>
      )}
      <fieldset className="grid gap-3 rounded-md border border-line p-3">
        <legend className="px-1 text-[13px] font-medium">Cliente nuevo</legend>
        <Input
          label="Nombre"
          value={newCustomer.name}
          onChange={(e) => onNewCustomer({ ...newCustomer, name: e.target.value })}
          autoComplete="off"
        />
        <div className="grid gap-3 sm:grid-cols-2">
          <Input
            label={phoneOptional ? 'Teléfono (opcional)' : 'Teléfono'}
            type="tel"
            inputMode="tel"
            value={newCustomer.phone}
            onChange={(e) => onNewCustomer({ ...newCustomer, phone: e.target.value })}
            autoComplete="off"
          />
          <Input
            label="Correo (opcional)"
            type="email"
            value={newCustomer.email}
            onChange={(e) => onNewCustomer({ ...newCustomer, email: e.target.value })}
            autoComplete="off"
          />
        </div>
      </fieldset>
    </div>
  )
}

type Period = 'Mañana' | 'Tarde' | 'Noche'
const periodOf = (time: string): Period => (time < '12:00' ? 'Mañana' : time < '18:00' ? 'Tarde' : 'Noche')

/** Barbers as buttons with their photo (radio group): one tap, no dropdown. */
function BarberPicker({ staff, value, onChange }: { staff: Staff[]; value: string; onChange: (id: string) => void }) {
  const options = [{ id: 'any', name: 'Primero disponible', photoUrl: null as string | null }, ...staff]
  return (
    <div role="radiogroup" aria-label="Barbero" className="flex flex-wrap gap-2">
      {options.map((o, i) => {
        const on = value === o.id
        return (
          <button
            key={o.id}
            type="button"
            role="radio"
            aria-checked={on}
            tabIndex={on || (!options.some((x) => x.id === value) && i === 0) ? 0 : -1}
            data-value={o.id}
            onClick={() => onChange(o.id)}
            onKeyDown={(e) => {
              const d =
                e.key === 'ArrowRight' || e.key === 'ArrowDown'
                  ? 1
                  : e.key === 'ArrowLeft' || e.key === 'ArrowUp'
                    ? -1
                    : 0
              if (!d) return
              e.preventDefault()
              const next = options[(i + d + options.length) % options.length]!
              onChange(next.id)
              ;(
                e.currentTarget.parentElement?.querySelector(`[data-value="${next.id}"]`) as HTMLElement | null
              )?.focus()
            }}
            className={cn(
              'inline-flex h-11 items-center gap-2 rounded-full border-[1.5px] pl-1.5 pr-4 text-sm font-medium transition-colors duration-fast',
              'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus',
              on ? 'border-ink-950 bg-ink-950 text-white' : 'border-line-strong bg-raised hover:border-fg',
            )}
          >
            {o.id === 'any' ? (
              <span
                aria-hidden
                className={cn('grid size-8 place-items-center rounded-full', on ? 'bg-white/15' : 'bg-fg/[0.06]')}
              >
                <Scissors className="size-4" strokeWidth={1.75} />
              </span>
            ) : (
              <Avatar name={o.name} src={o.photoUrl} size={32} />
            )}
            {o.id === 'any' ? o.name : o.name.split(' ')[0]}
          </button>
        )
      })}
    </div>
  )
}

/** Free times as buttons grouped by part of the day (radio group). */
function TimeChips({
  slots,
  value,
  onChange,
  staff,
  showBarber,
}: {
  slots: Slot[]
  value: string
  onChange: (startsAt: string) => void
  staff: Staff[]
  showBarber: boolean
}) {
  const groups = (['Mañana', 'Tarde', 'Noche'] as Period[])
    .map((p) => ({ p, items: slots.filter((s) => periodOf(s.time) === p) }))
    .filter((g) => g.items.length)
  return (
    <div role="radiogroup" aria-label="Hora" className="grid gap-3">
      {groups.map((g) => (
        <div key={g.p}>
          <p className="mb-1.5 text-xs font-semibold uppercase tracking-[0.08em] text-fg-muted">{g.p}</p>
          <div className="grid grid-cols-4 gap-1.5 sm:grid-cols-5">
            {g.items.map((s) => {
              const on = s.startsAt === value
              const who = showBarber ? staff.find((x) => x.id === s.staffId)?.name.split(' ')[0] : undefined
              return (
                <button
                  key={s.startsAt}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  aria-label={`${formatTime12(s.time)}${who ? ` con ${who}` : ''}`}
                  onClick={() => onChange(s.startsAt)}
                  className={cn(
                    'tabular h-10 rounded-md border text-sm font-semibold transition-colors duration-fast coarse:h-11',
                    'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus',
                    on ? 'border-ink-950 bg-ink-950 text-white' : 'border-line-strong bg-raised hover:border-fg',
                  )}
                >
                  {formatTimeCompact(s.time)}
                </button>
              )
            })}
          </div>
        </div>
      ))}
    </div>
  )
}

function Step({ n, title, children, aside }: { n: number; title: string; children: ReactNode; aside?: ReactNode }) {
  return (
    <section className="grid gap-3">
      <div className="flex items-center justify-between gap-3">
        <h3 className="flex items-center gap-2 text-sm font-semibold">
          <span
            aria-hidden
            className="tabular grid size-6 place-items-center rounded-full bg-ink-950 text-xs font-semibold text-white"
          >
            {n}
          </span>
          {title}
        </h3>
        {aside}
      </div>
      {children}
    </section>
  )
}

/**
 * Book from the panel (phone, WhatsApp, front desk) or register a walk-in.
 * Built around how a request arrives — "¿tienes el jueves a las 5 con Leo?":
 * date, barber and time first, then services and the customer. Times show
 * right away (using the shortest service) and re-check when services are added.
 * Staff can book on short notice; only free times are offered.
 */
export function NewAppointmentPanel({
  draft,
  staff,
  categories,
  services,
  timeZone,
  now,
  onClose,
}: {
  draft: NewAppointmentDraft | null
  staff: Staff[]
  categories: ServiceCategory[]
  services: Service[]
  timeZone: string
  now: Date
  onClose: () => void
}) {
  const { repo } = useAdminAuth()
  const { create } = useAgendaActions()
  const toast = useToast()
  const today = localDate(now, timeZone)
  const [kind, setKind] = useState<'cita' | 'walk_in'>('cita')
  const [serviceIds, setServiceIds] = useState<string[]>([])
  const [staffId, setStaffId] = useState<string>('any')
  const [date, setDate] = useState<LocalDate>('')
  const [startsAt, setStartsAt] = useState('')
  const [wantedTime, setWantedTime] = useState<string | undefined>()
  const [notice, setNotice] = useState<string | null>(null)
  const [customer, setCustomer] = useState<Customer | null>(null)
  const [newCustomer, setNewCustomer] = useState({ name: '', phone: '', email: '' })
  const [notes, setNotes] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [shownFor, setShownFor] = useState<NewAppointmentDraft | null>(null)

  // Reset the form each time the panel opens with a new draft.
  if (draft !== shownFor) {
    setShownFor(draft)
    if (draft) {
      setKind(draft.kind)
      setServiceIds([])
      setStaffId(draft.staffId)
      setDate(draft.date < today ? today : draft.date)
      setStartsAt('')
      setWantedTime(draft.time)
      setNotice(null)
      setCustomer(null)
      setNewCustomer({ name: '', phone: '', email: '' })
      setNotes('')
      setError(null)
    }
  }

  // Before services are chosen, show times that fit the shortest service.
  const shortest = useMemo(() => [...services].sort((a, b) => a.durationMin - b.durationMin)[0]?.id, [services])
  const forSlots = serviceIds.length ? serviceIds : shortest ? [shortest] : []
  const { data: slots, isFetching } = useQuery({
    queryKey: ['admin', 'slots', 'new', forSlots.join(','), staffId, date],
    queryFn: () => repo.getAvailableSlots({ serviceIds: forSlots, staffId, date }),
    enabled: !!draft && kind === 'cita' && forSlots.length > 0 && !!date,
  })
  const free = useMemo(() => slots?.filter((s) => s.available) ?? [], [slots])
  const picked = free.find((s) => s.startsAt === startsAt)

  // Preselect the time clicked on the grid once its slot is known to be free.
  if (wantedTime && slots && !isFetching) {
    const match = free.find((s) => s.time === wantedTime)
    setWantedTime(undefined)
    if (match) setStartsAt(match.startsAt)
  }
  // Adding services can make the chosen time too short: say so and clear it.
  if (startsAt && slots && !isFetching && !picked) {
    setNotice(`Con esos servicios ya no cabe a las ${formatTime12(localTime(startsAt, timeZone))}. Elige otra hora.`)
    setStartsAt('')
  }

  const chosen = services.filter((s) => serviceIds.includes(s.id))
  const totalMin = chosen.reduce((m, s) => m + s.durationMin, 0)
  const totalPrice = chosen.reduce((m, s) => m + s.price, 0)
  const walkIn = kind === 'walk_in'
  const who = picked?.staffId ? staff.find((s) => s.id === picked.staffId)?.name.split(' ')[0] : undefined

  const submit = () => {
    if (!walkIn && !startsAt) return setError('Elige fecha y hora.')
    if (!serviceIds.length) return setError('Elige al menos un servicio.')
    if (!customer && !newCustomer.name.trim()) return setError('Elige un cliente o escribe el nombre del nuevo.')
    setError(null)
    create.mutate(
      {
        serviceIds,
        staffId: walkIn ? staffId : (picked?.staffId ?? staffId),
        startsAt: walkIn ? now.toISOString() : startsAt,
        customer: customer ? { id: customer.id } : newCustomer,
        notes,
        source: walkIn ? 'walk_in' : 'panel',
      },
      {
        onSuccess: (a) => {
          const name = staff.find((s) => s.id === a.staffId)?.name.split(' ')[0] ?? ''
          toast(
            walkIn
              ? `Walk-in registrado con ${name}`
              : `Cita agendada: ${capitalize(formatDay(localDate(a.startsAt, timeZone), "EEE d 'de' MMM"))}, ${formatTime12(localTime(a.startsAt, timeZone))} con ${name}`,
          )
          onClose()
        },
        onError: (e) => setError(errorMessage(e)),
      },
    )
  }

  const summary = [
    !walkIn && picked
      ? `${capitalize(formatDay(date, "EEE d 'de' MMM"))}, ${formatTime12(picked.time)}${who ? ` con ${who}` : ''}`
      : null,
    chosen.length ? `${durationLabel(totalMin)} · ${money(totalPrice)}` : null,
  ]
    .filter(Boolean)
    .join(' · ')

  return (
    <SidePanel
      open={!!draft}
      onOpenChange={(o) => !o && onClose()}
      wide
      title={walkIn ? 'Registrar walk-in' : 'Agendar cita'}
      description={walkIn ? 'Cliente que llegó sin cita; empieza ahora.' : 'Por teléfono, WhatsApp o en recepción.'}
      footer={
        <>
          <span className="tabular min-w-0 text-sm text-fg-muted sm:mr-auto sm:self-center" aria-live="polite">
            {summary}
          </span>
          <button type="button" onClick={onClose} className={buttonClass({ variant: 'secondary', size: 'sm' })}>
            Cancelar
          </button>
          <button type="button" onClick={submit} disabled={create.isPending} className={buttonClass({ size: 'sm' })}>
            {create.isPending ? 'Guardando…' : walkIn ? 'Registrar walk-in' : 'Agendar cita'}
          </button>
        </>
      }
    >
      <form
        className="grid gap-7"
        onSubmit={(e) => {
          e.preventDefault()
          submit()
        }}
      >
        {error && <Alert tone="danger" title={error} />}
        <Segmented<'cita' | 'walk_in'>
          label="Tipo"
          value={kind}
          onChange={(k) => {
            setKind(k)
            setError(null)
          }}
          options={[
            { value: 'cita', label: 'Cita' },
            { value: 'walk_in', label: 'Walk-in (ahora)' },
          ]}
        />

        <Step n={1} title={walkIn ? 'Con quién' : 'Cuándo y con quién'}>
          {!walkIn && (
            <DatePicker
              label="Fecha"
              value={date}
              today={today}
              min={today}
              onChange={(d) => {
                setDate(d)
                setStartsAt('')
                setNotice(null)
              }}
            />
          )}
          <div className="grid gap-1.5">
            <p className="text-[13px] font-medium" aria-hidden>
              Barbero
            </p>
            <BarberPicker
              staff={staff}
              value={staffId}
              onChange={(id) => {
                setStaffId(id)
                setStartsAt('')
                setNotice(null)
              }}
            />
          </div>
          {walkIn ? (
            <p className="rounded-md bg-surface px-3 py-2.5 text-sm">
              Empieza ahora, a las <strong className="tabular">{formatTime12(localTime(now, timeZone))}</strong>, con el
              barbero libre.
            </p>
          ) : (
            <div className="grid gap-1.5">
              <p className="text-[13px] font-medium" aria-hidden>
                Hora
              </p>
              {notice && <Alert tone="warning" title={notice} />}
              {isFetching && !slots ? (
                <p className="text-sm text-fg-muted">Buscando horarios…</p>
              ) : free.length === 0 ? (
                <p className="rounded-md border border-dashed border-line px-3 py-4 text-sm text-fg-muted">
                  Sin horarios libres ese día{staffId !== 'any' ? ' con ese barbero' : ''}. Prueba otro día o «Primero
                  disponible».
                </p>
              ) : (
                <TimeChips
                  slots={free}
                  value={startsAt}
                  onChange={(v) => {
                    setStartsAt(v)
                    setNotice(null)
                  }}
                  staff={staff}
                  showBarber={staffId === 'any'}
                />
              )}
              {!serviceIds.length && free.length > 0 && (
                <p className="text-[13px] text-fg-muted">
                  Horarios para el servicio más corto; se ajustan al elegir servicios.
                </p>
              )}
            </div>
          )}
        </Step>

        <Step n={2} title="Servicios">
          <ServicePicker categories={categories} services={services} value={serviceIds} onChange={setServiceIds} />
        </Step>

        <Step n={3} title="Cliente">
          <CustomerPicker
            value={customer}
            onChange={setCustomer}
            phoneOptional={walkIn}
            newCustomer={newCustomer}
            onNewCustomer={setNewCustomer}
          />
          <TextArea label="Notas" optional value={notes} onChange={(e) => setNotes(e.target.value)} />
        </Step>
      </form>
    </SidePanel>
  )
}
