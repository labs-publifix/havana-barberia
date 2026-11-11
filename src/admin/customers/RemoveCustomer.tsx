import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Check, Trash2 } from 'lucide-react'
import { Alert } from '@/components/ui/Alert'
import { buttonClass } from '@/components/ui/buttonClass'
import { Dialog } from '@/components/ui/Dialog'
import type { Customer } from '@/domain/types'
import { cn } from '@/lib/cn'
import { formatMxPhone } from '@/lib/phone'
import { useAdminAuth } from '../auth/AdminAuth'
import { errorMessage } from '../agenda/useAgendaActions'
import { SearchInput } from '../ui/controls'
import { useToast } from '../ui/Toast'
import type { CustomerSummary } from './model'

const contact = (c: Customer) =>
  [c.phone && formatMxPhone(c.phone), c.email].filter(Boolean).join(' · ') || 'Sin contacto'
const citas = (n: number) => `${n} ${n === 1 ? 'cita' : 'citas'}`

/**
 * «Eliminar cliente» at the bottom of the profile (owner, developer, manager).
 * Without appointments it deletes the record after a confirmation. With
 * appointments it offers «Unir con otro cliente»: pick the right record and the
 * duplicate's appointments, stamps (up to the goal) and missing contact data
 * move there before the duplicate is deleted.
 */
export function RemoveCustomer({
  summary,
  appointments,
  onDeleted,
  onMerged,
}: {
  summary: CustomerSummary
  appointments: number
  onDeleted: () => void
  onMerged: (intoId: string) => void
}) {
  const { repo } = useAdminAuth()
  const qc = useQueryClient()
  const toast = useToast()
  const c = summary.customer
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [into, setInto] = useState<Customer | null>(null)
  const [error, setError] = useState<string | null>(null)

  const found = useQuery({
    queryKey: ['admin', 'customer-search', query.trim()],
    queryFn: () => repo.findCustomers(query),
    enabled: open && appointments > 0 && query.trim().length >= 2,
  })
  const intoCard = useQuery({
    queryKey: ['admin', 'customer-card', into?.id],
    queryFn: () => repo.getLoyaltyForCustomer(into!.id),
    enabled: !!into,
  })

  const done = () => qc.invalidateQueries({ queryKey: ['admin'] })
  const remove = useMutation({
    mutationFn: () => repo.deleteCustomer(c.id),
    onSuccess: () => {
      toast(`${c.name} eliminado`)
      void done()
      onDeleted()
    },
    onError: (e) => setError(errorMessage(e)),
  })
  const merge = useMutation({
    mutationFn: (target: Customer) => repo.mergeCustomers(c.id, target.id),
    onSuccess: (kept) => {
      toast(`${c.name} quedó unido con ${kept.name}`)
      void done()
      onMerged(kept.id)
    },
    onError: (e) => setError(errorMessage(e)),
  })

  const close = (o: boolean) => {
    setOpen(o)
    if (!o) {
      setQuery('')
      setInto(null)
      setError(null)
    }
  }

  const mine = summary.loyalty?.stamps ?? 0
  const theirs = intoCard.data?.stamps ?? 0
  const goal = intoCard.data?.goal ?? summary.loyalty?.goal ?? 10
  const total = Math.min(goal, mine + theirs)
  const results = (found.data ?? []).filter((x) => x.id !== c.id)

  const cancel = (
    <button type="button" onClick={() => close(false)} className={buttonClass({ variant: 'secondary', size: 'sm' })}>
      Volver
    </button>
  )

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line pt-5">
        <p className="text-[13px] text-fg-muted">¿Está registrado dos veces o ya no debe estar?</p>
        <button
          type="button"
          onClick={() => setOpen(true)}
          className={buttonClass({ variant: 'ghost', size: 'sm', className: 'text-danger' })}
        >
          <Trash2 className="size-4" strokeWidth={1.75} aria-hidden /> Eliminar cliente
        </button>
      </div>

      {appointments === 0 ? (
        <Dialog
          open={open}
          onOpenChange={close}
          title={`¿Eliminar a ${c.name}?`}
          description="No tiene citas. Se borra por completo junto con su tarjeta de sellos y sus invitaciones. No se puede deshacer."
          footer={
            <>
              {cancel}
              <button
                type="button"
                disabled={remove.isPending}
                onClick={() => {
                  setError(null)
                  remove.mutate()
                }}
                className={buttonClass({ variant: 'danger', size: 'sm' })}
              >
                {remove.isPending ? 'Eliminando…' : 'Eliminar cliente'}
              </button>
            </>
          }
        >
          {error && <Alert tone="danger" title={error} />}
        </Dialog>
      ) : (
        <Dialog
          open={open}
          onOpenChange={close}
          title="Unir con otro cliente"
          description={`${c.name} tiene ${citas(appointments)}, así que no se borra a secas: elige su registro correcto y todo pasa ahí.`}
          footer={
            <>
              {cancel}
              <button
                type="button"
                disabled={!into || merge.isPending}
                onClick={() => {
                  setError(null)
                  if (into) merge.mutate(into)
                }}
                className={buttonClass({ variant: 'danger', size: 'sm' })}
              >
                {merge.isPending ? 'Uniendo…' : 'Unir y eliminar duplicado'}
              </button>
            </>
          }
        >
          <div className="grid gap-4">
            {error && <Alert tone="danger" title={error} />}
            <SearchInput
              label="Buscar el registro correcto"
              placeholder="Nombre, teléfono o correo"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value)
                setInto(null)
              }}
              autoFocus
            />
            {query.trim().length >= 2 && (
              <ul
                className="max-h-60 divide-y divide-line overflow-y-auto rounded-md border border-line"
                aria-label="Clientes"
              >
                {results.length ? (
                  results.map((x) => (
                    <li key={x.id}>
                      <button
                        type="button"
                        aria-pressed={into?.id === x.id}
                        onClick={() => setInto(x)}
                        className={cn(
                          'flex min-h-tap w-full items-center gap-3 px-3 py-2 text-left text-sm hover:bg-fg/[0.03]',
                          'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-focus',
                          into?.id === x.id && 'bg-fg/[0.05]',
                        )}
                      >
                        <span className="min-w-0 flex-1">
                          <span className="block truncate font-medium">{x.name}</span>
                          <span className="block truncate text-[13px] text-fg-muted">{contact(x)}</span>
                        </span>
                        {into?.id === x.id && <Check className="size-4 shrink-0" strokeWidth={2} aria-hidden />}
                      </button>
                    </li>
                  ))
                ) : (
                  <li className="px-3 py-2.5 text-sm text-fg-muted">
                    {found.isFetching ? 'Buscando…' : 'Sin resultados.'}
                  </li>
                )}
              </ul>
            )}
            {into && (
              <div className="rounded-md border border-line px-3 py-3 text-sm">
                <p className="font-medium">Al unir con {into.name}:</p>
                <ul className="mt-1.5 grid list-disc gap-1 pl-5 text-fg-muted">
                  <li>
                    {appointments === 1 ? 'Su cita pasa' : `Sus ${appointments} citas pasan`} a {into.name}.
                  </li>
                  {mine + theirs > 0 && (
                    <li className="tabular">
                      Sellos: {theirs} + {mine} = {total} de {goal}
                      {mine + theirs > goal ? ' (no pasa del tope)' : ''}.
                    </li>
                  )}
                  {(!into.phone && c.phone) || (!into.email && c.email) ? (
                    <li>
                      Se completan los datos que le faltan (
                      {[!into.phone && c.phone && 'teléfono', !into.email && c.email && 'correo']
                        .filter(Boolean)
                        .join(' y ')}
                      ).
                    </li>
                  ) : null}
                  <li>
                    «{c.name}» se elimina y queda una nota en {into.name}. No se puede deshacer.
                  </li>
                </ul>
              </div>
            )}
          </div>
        </Dialog>
      )}
    </>
  )
}
