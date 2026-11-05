import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Check, UserRound, X } from 'lucide-react'
import type { Customer, LocalDate, Service, ServiceCategory, Staff } from '@/domain/types'
import { Alert } from '@/components/ui/Alert'
import { buttonClass } from '@/components/ui/buttonClass'
import { TextArea } from '@/components/ui/Field'
import { cn } from '@/lib/cn'
import { formatMxPhone } from '@/lib/phone'
import { durationLabel, formatTime12, localDate, localTime, money } from '@/lib/time'
import { useAdminAuth } from '../auth/AdminAuth'
import { Input, SearchInput, Segmented } from '../ui/controls'
import { DatePicker } from '../ui/DatePicker'
import { Select } from '../ui/Select'
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
      <legend className="mb-1.5 text-[13px] font-medium">Servicios</legend>
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

/**
 * New appointment (by phone or at the desk) or walk-in (right now). Staff can
 * book on short notice; the slot list only offers free times for the chosen
 * services and barber.
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
  const [kind, setKind] = useState<'cita' | 'walk_in'>('cita')
  const [serviceIds, setServiceIds] = useState<string[]>([])
  const [staffId, setStaffId] = useState<string>('any')
  const [date, setDate] = useState<LocalDate>('')
  const [startsAt, setStartsAt] = useState('')
  const [wantedTime, setWantedTime] = useState<string | undefined>()
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
      setDate(draft.date)
      setStartsAt('')
      setWantedTime(draft.time)
      setCustomer(null)
      setNewCustomer({ name: '', phone: '', email: '' })
      setNotes('')
      setError(null)
    }
  }

  const { data: slots, isFetching } = useQuery({
    queryKey: ['admin', 'slots', 'new', serviceIds.join(','), staffId, date],
    queryFn: () => repo.getAvailableSlots({ serviceIds, staffId, date }),
    enabled: !!draft && kind === 'cita' && serviceIds.length > 0 && !!date,
  })
  const free = useMemo(() => slots?.filter((s) => s.available) ?? [], [slots])
  // Preselect the time clicked on the grid once its slot is known to be free.
  if (wantedTime && free.length) {
    const match = free.find((s) => s.time === wantedTime)
    setWantedTime(undefined)
    if (match) setStartsAt(match.startsAt)
  }

  const chosen = services.filter((s) => serviceIds.includes(s.id))
  const totalMin = chosen.reduce((m, s) => m + s.durationMin, 0)
  const totalPrice = chosen.reduce((m, s) => m + s.price, 0)
  const walkIn = kind === 'walk_in'

  const submit = () => {
    if (!serviceIds.length) return setError('Elige al menos un servicio.')
    if (!walkIn && !startsAt) return setError('Elige un horario.')
    if (!customer && !newCustomer.name.trim()) return setError('Elige un cliente o escribe el nombre del nuevo.')
    setError(null)
    create.mutate(
      {
        serviceIds,
        staffId,
        startsAt: walkIn ? now.toISOString() : startsAt,
        customer: customer ? { id: customer.id } : newCustomer,
        notes,
        source: walkIn ? 'walk_in' : 'panel',
      },
      {
        onSuccess: (a) => {
          const who = staff.find((s) => s.id === a.staffId)?.name.split(' ')[0] ?? ''
          toast(
            walkIn
              ? `Walk-in registrado con ${who}`
              : `Cita agendada: ${formatTime12(localTime(a.startsAt, timeZone))} con ${who}`,
          )
          onClose()
        },
        onError: (e) => setError(errorMessage(e)),
      },
    )
  }

  return (
    <SidePanel
      open={!!draft}
      onOpenChange={(o) => !o && onClose()}
      title={walkIn ? 'Registrar walk-in' : 'Nueva cita'}
      description={walkIn ? 'Cliente que llegó sin cita; empieza ahora.' : 'Por teléfono o en recepción.'}
      footer={
        <>
          <span className="tabular text-sm text-fg-muted sm:mr-auto sm:self-center">
            {chosen.length ? `${durationLabel(totalMin)} · ${money(totalPrice)}` : ''}
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
        className="grid gap-5"
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
        <ServicePicker categories={categories} services={services} value={serviceIds} onChange={setServiceIds} />
        <Select
          label="Barbero"
          value={staffId}
          onValueChange={(v) => {
            setStaffId(v)
            setStartsAt('')
          }}
          options={[
            { value: 'any', label: 'Primero disponible' },
            ...staff.map((s) => ({ value: s.id, label: s.name })),
          ]}
        />
        {walkIn ? (
          <p className="rounded-md bg-surface px-3 py-2.5 text-sm">
            Empieza ahora, a las <strong className="tabular">{formatTime12(localTime(now, timeZone))}</strong>, con el
            barbero libre.
          </p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            <DatePicker
              label="Fecha"
              value={date}
              today={localDate(now, timeZone)}
              min={localDate(now, timeZone)}
              onChange={(d) => {
                setDate(d)
                setStartsAt('')
              }}
            />
            <Select
              label="Hora"
              value={startsAt}
              onValueChange={setStartsAt}
              disabled={!serviceIds.length || isFetching || free.length === 0}
              hint={
                !serviceIds.length
                  ? 'Elige servicios para ver horarios.'
                  : isFetching
                    ? 'Buscando horarios…'
                    : free.length === 0
                      ? 'Sin horarios libres ese día.'
                      : undefined
              }
              options={[
                { value: '', label: 'Elige un horario' },
                ...free.map((s) => ({ value: s.startsAt, label: formatTime12(s.time) })),
              ]}
            />
          </div>
        )}
        <div className="grid gap-2">
          <p className="text-[13px] font-medium">Cliente</p>
          <CustomerPicker
            value={customer}
            onChange={setCustomer}
            phoneOptional={walkIn}
            newCustomer={newCustomer}
            onNewCustomer={setNewCustomer}
          />
        </div>
        <TextArea label="Notas" optional value={notes} onChange={(e) => setNotes(e.target.value)} />
      </form>
    </SidePanel>
  )
}
