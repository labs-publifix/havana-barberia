import { useState, type ReactNode } from 'react'
import { Check } from 'lucide-react'
import { Avatar } from '@/components/booking/Avatar'
import { ServiceCard } from '@/components/booking/ServiceCard'
import { Alert } from '@/components/ui/Alert'
import { buttonClass } from '@/components/ui/buttonClass'
import { Dialog } from '@/components/ui/Dialog'
import { TextArea } from '@/components/ui/Field'
import type { Service } from '@/domain/types'
import { cn } from '@/lib/cn'
import { durationLabel } from '@/lib/time'
import type { AdminCatalog, ServiceInput } from '../domain'
import { errorMessage } from '../agenda/useAgendaActions'
import { Input, Switch } from '../ui/controls'
import { Select } from '../ui/Select'
import { SidePanel } from '../ui/SidePanel'
import { useToast } from '../ui/Toast'
import { useCatalogActions } from './useCatalogActions'

export type ServiceDraft = { mode: 'new'; categoryId?: string } | { mode: 'edit'; id: string }

const DURATIONS = Array.from({ length: 16 }, (_, i) => (i + 1) * 15)

interface Form {
  categoryId: string
  name: string
  description: string
  durationMin: number
  price: string
  loyaltyEligible: boolean
  active: boolean
  staffIds: string[]
}

function Group({ title, children, hint }: { title: string; children: ReactNode; hint?: ReactNode }) {
  return (
    <section className="grid gap-3">
      <h3 className="text-[12px] font-semibold uppercase tracking-[0.08em] text-fg-muted">{title}</h3>
      {children}
      {hint && <p className="text-[13px] text-fg-muted">{hint}</p>}
    </section>
  )
}

/**
 * Create or edit a service: name, category, description, duration, price (the
 * same with every barber), loyalty, visibility and who performs it, with a live
 * preview of the card customers see. Owner and manager edit; reception reads.
 */
export function ServicePanel({
  draft,
  catalog,
  canEdit,
  onClose,
}: {
  draft: ServiceDraft | null
  catalog: AdminCatalog
  canEdit: boolean
  onClose: () => void
}) {
  const { saveService, deleteService } = useCatalogActions()
  const toast = useToast()
  const [form, setForm] = useState<Form | null>(null)
  const [shownFor, setShownFor] = useState<ServiceDraft | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)

  const editing = draft?.mode === 'edit' ? catalog.services.find((s) => s.id === draft.id) : undefined
  if (draft !== shownFor) {
    setShownFor(draft)
    setError(null)
    setConfirmDelete(false)
    if (!draft) setForm(null)
    else if (editing)
      setForm({
        categoryId: editing.categoryId,
        name: editing.name,
        description: editing.description,
        durationMin: editing.durationMin,
        price: String(editing.price),
        loyaltyEligible: editing.loyaltyEligible,
        active: editing.active,
        staffIds: catalog.staffFor[editing.id] ?? [],
      })
    else
      setForm({
        categoryId: (draft.mode === 'new' && draft.categoryId) || catalog.categories[0]?.id || '',
        name: '',
        description: '',
        durationMin: 30,
        price: '',
        loyaltyEligible: false,
        active: true,
        staffIds: catalog.staff.map((s) => s.id),
      })
  }

  if (!draft || !form) return null
  const set = (patch: Partial<Form>) => setForm({ ...form, ...patch })
  const price = Number(form.price)
  const used = editing ? (catalog.usage[editing.id] ?? 0) : 0
  const preview: Service = {
    id: 'preview',
    categoryId: form.categoryId,
    name: form.name.trim() || 'Nombre del servicio',
    description: form.description.trim(),
    durationMin: form.durationMin,
    price: Number.isFinite(price) ? Math.round(price) : 0,
    active: form.active,
    order: 0,
    loyaltyEligible: form.loyaltyEligible,
  }

  const submit = () => {
    const parsed = form.price.trim() === '' ? NaN : Number(form.price.replace(/[$,\s]/g, ''))
    if (!Number.isFinite(parsed)) return setError('Escribe el precio en pesos.')
    const input: ServiceInput = {
      id: editing?.id,
      categoryId: form.categoryId,
      name: form.name,
      description: form.description,
      durationMin: form.durationMin,
      price: parsed,
      loyaltyEligible: form.loyaltyEligible,
      active: form.active,
      staffIds: form.staffIds,
    }
    setError(null)
    saveService.mutate(input, {
      onSuccess: (s) => {
        toast(editing ? `«${s.name}» actualizado` : `«${s.name}» creado`)
        onClose()
      },
      onError: (e) => setError(errorMessage(e)),
    })
  }

  return (
    <>
      <SidePanel
        open
        wide
        onOpenChange={(o) => !o && onClose()}
        title={editing ? editing.name : 'Nuevo servicio'}
        description={
          editing
            ? `${used ? `Usado en ${used} ${used === 1 ? 'cita' : 'citas'}` : 'Sin citas todavía'}${canEdit ? '' : ' · Solo lectura'}`
            : 'Aparecerá en el sitio y en la reserva si queda visible.'
        }
        footer={
          canEdit ? (
            <>
              {editing && (
                <button
                  type="button"
                  onClick={() => setConfirmDelete(true)}
                  disabled={used > 0}
                  title={used > 0 ? 'Tiene citas: ocúltalo en lugar de borrarlo' : undefined}
                  className={buttonClass({ variant: 'ghost', size: 'sm', className: 'text-fg-danger sm:mr-auto' })}
                >
                  Eliminar
                </button>
              )}
              <button type="button" onClick={onClose} className={buttonClass({ variant: 'secondary', size: 'sm' })}>
                Cancelar
              </button>
              <button
                type="button"
                onClick={submit}
                disabled={saveService.isPending}
                className={buttonClass({ size: 'sm' })}
              >
                {saveService.isPending ? 'Guardando…' : editing ? 'Guardar cambios' : 'Crear servicio'}
              </button>
            </>
          ) : undefined
        }
      >
        <form
          className="grid gap-7"
          onSubmit={(e) => {
            e.preventDefault()
            if (canEdit) submit()
          }}
        >
          {error && <Alert tone="danger" title={error} />}
          <fieldset disabled={!canEdit} className="grid gap-7 disabled:opacity-90">
            <Group title="Servicio">
              <Input label="Nombre" value={form.name} onChange={(e) => set({ name: e.target.value })} />
              <Select
                label="Categoría"
                value={form.categoryId}
                onValueChange={(v) => set({ categoryId: v })}
                disabled={!canEdit}
                options={catalog.categories.map((c) => ({ value: c.id, label: c.name }))}
              />
              <TextArea
                label="Descripción"
                optional
                value={form.description}
                onChange={(e) => set({ description: e.target.value })}
                placeholder="Una línea que explique qué incluye."
              />
            </Group>

            <Group
              title="Duración y precio"
              hint="El precio es el mismo con cualquier barbero. Cambiarlo no modifica citas ya agendadas."
            >
              <div className="grid gap-4 sm:grid-cols-2">
                <Select
                  label="Duración"
                  value={String(form.durationMin)}
                  onValueChange={(v) => set({ durationMin: Number(v) })}
                  disabled={!canEdit}
                  options={DURATIONS.map((m) => ({ value: String(m), label: durationLabel(m) }))}
                />
                <Input
                  label="Precio"
                  inputMode="numeric"
                  prefix="$"
                  suffix="MXN"
                  value={form.price}
                  onChange={(e) => set({ price: e.target.value.replace(/[^\d]/g, '') })}
                  placeholder="0"
                />
              </div>
            </Group>

            <Group title="Lo realizan" hint="Solo estos barberos aparecen al reservar este servicio.">
              <div role="group" aria-label="Barberos que lo realizan" className="flex flex-wrap gap-2">
                {catalog.staff.map((s) => {
                  const on = form.staffIds.includes(s.id)
                  return (
                    <button
                      key={s.id}
                      type="button"
                      aria-pressed={on}
                      disabled={!canEdit}
                      onClick={() =>
                        set({ staffIds: on ? form.staffIds.filter((x) => x !== s.id) : [...form.staffIds, s.id] })
                      }
                      className={cn(
                        'inline-flex h-11 items-center gap-2 rounded-full border-[1.5px] pl-1.5 pr-4 text-sm font-medium transition-colors duration-fast',
                        'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus disabled:cursor-default',
                        on ? 'border-ink-950 bg-ink-950 text-white' : 'border-line-strong bg-raised hover:border-fg',
                      )}
                    >
                      <Avatar name={s.name} src={s.photoUrl} size={32} />
                      {s.name}
                      {on && <Check className="size-4" strokeWidth={2.25} aria-hidden />}
                    </button>
                  )
                })}
              </div>
            </Group>

            <Group title="Opciones">
              <div className="grid gap-4 rounded-md border border-line p-4">
                <Switch
                  label="Visible en el sitio y la reserva"
                  description="Ocúltalo para dejar de ofrecerlo sin perder su historial."
                  checked={form.active}
                  disabled={!canEdit}
                  onChange={(active) => set({ active })}
                />
                <Switch
                  label="Cuenta para el sello de lealtad"
                  description="Al completar una cita con este servicio, el cliente gana un sello."
                  checked={form.loyaltyEligible}
                  disabled={!canEdit}
                  onChange={(loyaltyEligible) => set({ loyaltyEligible })}
                />
              </div>
            </Group>
          </fieldset>

          <Group title="Así se ve en el sitio">
            <div aria-hidden className="pointer-events-none rounded-lg bg-surface p-3" {...{ inert: '' }}>
              <ServiceCard service={preview} selected={false} onToggle={() => {}} />
            </div>
            {!form.active && (
              <p className="text-[13px] text-fg-muted">Oculto: no aparece en el sitio ni en la reserva.</p>
            )}
          </Group>
        </form>
      </SidePanel>

      {editing && (
        <Dialog
          open={confirmDelete}
          onOpenChange={setConfirmDelete}
          title={`¿Eliminar «${editing.name}»?`}
          description="No tiene citas, así que se puede borrar. Esta acción no se puede deshacer."
          footer={
            <>
              <button
                type="button"
                onClick={() => setConfirmDelete(false)}
                className={buttonClass({ variant: 'secondary', size: 'sm' })}
              >
                Volver
              </button>
              <button
                type="button"
                disabled={deleteService.isPending}
                onClick={() =>
                  deleteService.mutate(editing.id, {
                    onSuccess: () => {
                      toast('Servicio eliminado')
                      onClose()
                    },
                    onError: (e) => {
                      setConfirmDelete(false)
                      setError(errorMessage(e))
                    },
                  })
                }
                className={buttonClass({ variant: 'danger', size: 'sm' })}
              >
                Sí, eliminar
              </button>
            </>
          }
        />
      )}
    </>
  )
}
