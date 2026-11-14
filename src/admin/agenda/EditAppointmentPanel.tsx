import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Minus, Plus, UserRound, X } from 'lucide-react'
import { Alert } from '@/components/ui/Alert'
import { buttonClass } from '@/components/ui/buttonClass'
import { TextArea } from '@/components/ui/Field'
import type { Appointment, Customer, Service } from '@/domain/types'
import { formatMxPhone } from '@/lib/phone'
import { durationLabel, money } from '@/lib/time'
import { useAdminAuth } from '../auth/AdminAuth'
import { errorMessage } from './useAgendaActions'
import { SearchInput } from '../ui/controls'
import { SidePanel } from '../ui/SidePanel'
import { useToast } from '../ui/Toast'

const counts = (ids: string[]) => ids.reduce<Record<string, number>>((m, id) => ({ ...m, [id]: (m[id] ?? 0) + 1 }), {})

/**
 * «Editar cita» (owner and developer): fix the services, the customer or the
 * notes of an appointment that is not charged yet. Duration and price follow
 * the services; the time and barber are changed with «Reprogramar».
 */
export function EditAppointmentPanel({
  appointment: a,
  services,
  open,
  onClose,
}: {
  appointment: Appointment
  services: Service[]
  open: boolean
  onClose: () => void
}) {
  const { repo } = useAdminAuth()
  const qc = useQueryClient()
  const toast = useToast()
  const [qty, setQty] = useState<Record<string, number>>(() => counts(a.serviceIds))
  const [customer, setCustomer] = useState<Pick<Customer, 'id' | 'name' | 'phone'>>({
    id: a.customerId,
    name: a.customer.name,
    phone: a.customer.phone,
  })
  const [changing, setChanging] = useState(false)
  const [query, setQuery] = useState('')
  const [notes, setNotes] = useState(a.notes)
  const [error, setError] = useState<string | null>(null)
  const [openFor, setOpenFor] = useState<string | null>(null)
  if (open && openFor !== a.id) {
    setOpenFor(a.id)
    setQty(counts(a.serviceIds))
    setCustomer({ id: a.customerId, name: a.customer.name, phone: a.customer.phone })
    setChanging(false)
    setQuery('')
    setNotes(a.notes)
    setError(null)
  }
  if (!open && openFor) setOpenFor(null)

  const found = useQuery({
    queryKey: ['admin', 'customer-search', query.trim()],
    queryFn: () => repo.findCustomers(query),
    enabled: open && changing && query.trim().length >= 2,
  })

  // The services, in the original order first; repeats allowed.
  const ids = (() => {
    const left = { ...qty }
    const out: string[] = []
    for (const id of a.serviceIds)
      if ((left[id] ?? 0) > 0) {
        out.push(id)
        left[id] = left[id]! - 1
      }
    return [...out, ...Object.entries(left).flatMap(([id, n]) => Array.from({ length: n }, () => id))]
  })()
  const chosen = ids.map((id) => services.find((s) => s.id === id)).filter((s): s is Service => !!s)
  const minutes = chosen.reduce((t, s) => t + s.durationMin, 0)
  const price = chosen.reduce((t, s) => t + s.price, 0)
  const list = services.filter((s) => s.active || a.serviceIds.includes(s.id))
  const step = (id: string, d: number) => setQty((q) => ({ ...q, [id]: Math.max(0, Math.min(10, (q[id] ?? 0) + d)) }))

  const save = useMutation({
    mutationFn: () => repo.editAppointment(a.id, { serviceIds: ids, customerId: customer.id, notes }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['admin'] })
      toast('Cita actualizada')
      onClose()
    },
    onError: (e) => setError(errorMessage(e)),
  })

  return (
    <SidePanel
      open={open}
      wide
      onOpenChange={(o) => !o && onClose()}
      title="Editar cita"
      description="Servicios, cliente y notas. Para cambiar día, hora o barbero usa «Reprogramar»."
      footer={
        <>
          <span className="tabular min-w-0 text-sm text-fg-muted sm:mr-auto sm:self-center">
            {chosen.length ? `${durationLabel(minutes)} · ${money(price)}` : 'Sin servicios'}
          </span>
          <button type="button" onClick={onClose} className={buttonClass({ variant: 'secondary', size: 'sm' })}>
            Cancelar
          </button>
          <button
            type="button"
            disabled={save.isPending || !ids.length}
            onClick={() => {
              setError(null)
              save.mutate()
            }}
            className={buttonClass({ size: 'sm' })}
          >
            {save.isPending ? 'Guardando…' : 'Guardar cambios'}
          </button>
        </>
      }
    >
      <div className="grid grid-cols-[minmax(0,1fr)] gap-6">
        {error && <Alert tone="danger" title={error} />}

        <section className="grid gap-2">
          <h3 className="text-[12px] font-semibold uppercase tracking-[0.08em] text-fg-muted">Servicios</h3>
          <ul className="divide-y divide-line rounded-md border border-line" aria-label="Servicios de la cita">
            {list.map((s) => {
              const n = qty[s.id] ?? 0
              return (
                <li key={s.id} className="flex items-center gap-2 px-3 py-2">
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-medium [overflow-wrap:anywhere]">{s.name}</span>
                    <span className="tabular text-[13px] text-fg-muted">
                      {money(s.price)} · {durationLabel(s.durationMin)}
                    </span>
                  </span>
                  <button
                    type="button"
                    aria-label={`Quitar uno de ${s.name}`}
                    disabled={!n}
                    onClick={() => step(s.id, -1)}
                    className="grid size-10 shrink-0 place-items-center rounded-full border border-line hover:border-fg disabled:opacity-30"
                  >
                    <Minus className="size-4" aria-hidden />
                  </button>
                  <span className="tabular w-6 text-center font-semibold" aria-label={`Cantidad de ${s.name}`}>
                    {n}
                  </span>
                  <button
                    type="button"
                    aria-label={`Agregar uno de ${s.name}`}
                    onClick={() => step(s.id, 1)}
                    className="grid size-10 shrink-0 place-items-center rounded-full border border-line hover:border-fg"
                  >
                    <Plus className="size-4" aria-hidden />
                  </button>
                </li>
              )
            })}
          </ul>
          <p className="text-[13px] text-fg-muted">
            La duración y el precio se recalculan; si ya no cabe con el barbero, te avisamos.
          </p>
        </section>

        <section className="grid gap-2">
          <h3 className="text-[12px] font-semibold uppercase tracking-[0.08em] text-fg-muted">Cliente</h3>
          <div className="flex items-center gap-3 rounded-md border border-line px-3 py-2.5">
            <UserRound className="size-5 shrink-0" strokeWidth={1.75} aria-hidden />
            <div className="min-w-0 flex-1 text-sm">
              <p className="truncate font-semibold">{customer.name}</p>
              <p className="truncate text-fg-muted">
                {customer.phone ? formatMxPhone(customer.phone) : 'Sin teléfono'}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setChanging((c) => !c)}
              className={buttonClass({ variant: 'secondary', size: 'sm' })}
            >
              {changing ? 'Listo' : 'Cambiar cliente'}
            </button>
          </div>
          {changing && (
            <div className="grid gap-2">
              <SearchInput
                label="Buscar cliente"
                placeholder="Nombre, teléfono o correo"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                autoFocus
              />
              {query.trim().length >= 2 && (
                <ul className="max-h-60 divide-y divide-line overflow-y-auto rounded-md border border-line">
                  {(found.data ?? []).length ? (
                    found.data!.map((c) => (
                      <li key={c.id}>
                        <button
                          type="button"
                          onClick={() => {
                            setCustomer({ id: c.id, name: c.name, phone: c.phone })
                            setChanging(false)
                            setQuery('')
                          }}
                          className="flex min-h-tap w-full items-center gap-3 px-3 py-2 text-left text-sm hover:bg-fg/[0.03] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-focus"
                        >
                          <span className="min-w-0 flex-1">
                            <span className="block truncate font-medium">{c.name}</span>
                            <span className="block truncate text-[13px] text-fg-muted">
                              {[c.phone && formatMxPhone(c.phone), c.email].filter(Boolean).join(' · ') ||
                                'Sin contacto'}
                            </span>
                          </span>
                        </button>
                      </li>
                    ))
                  ) : (
                    <li className="px-3 py-2.5 text-sm text-fg-muted">
                      {found.isFetching ? 'Buscando…' : 'Sin resultados. Créalo primero en Clientes o al agendar.'}
                    </li>
                  )}
                </ul>
              )}
              {customer.id !== a.customerId && (
                <button
                  type="button"
                  onClick={() => setCustomer({ id: a.customerId, name: a.customer.name, phone: a.customer.phone })}
                  className={buttonClass({ variant: 'ghost', size: 'sm', className: 'justify-self-start' })}
                >
                  <X className="size-4" aria-hidden /> Volver a {a.customer.name}
                </button>
              )}
            </div>
          )}
        </section>

        <TextArea label="Notas" optional value={notes} onChange={(e) => setNotes(e.target.value)} />
      </div>
    </SidePanel>
  )
}
