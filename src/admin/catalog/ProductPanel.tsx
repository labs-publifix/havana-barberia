import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Alert } from '@/components/ui/Alert'
import { buttonClass } from '@/components/ui/buttonClass'
import { Dialog } from '@/components/ui/Dialog'
import type { Product } from '@/domain/types'
import { cn } from '@/lib/cn'
import { money } from '@/lib/time'
import { useAdminAuth } from '../auth/AdminAuth'
import type { ProductInput } from '../domain'
import { errorMessage } from '../agenda/useAgendaActions'
import { Input, Switch } from '../ui/controls'
import { ImageUploader } from '../ui/ImageUploader'
import { SidePanel } from '../ui/SidePanel'
import { useToast } from '../ui/Toast'
import { parseMoney, productMargin } from './products'

export type ProductDraft = { mode: 'new' } | { mode: 'edit'; product: Product }

interface Form {
  name: string
  brand: string
  price: string
  cost: string
  commission: string
  imageUrl: string | null
  active: boolean
}

const asText = (n: number | null) => (n === null ? '' : String(n))
const digits = (s: string) => s.replace(/[^\d]/g, '')

/**
 * Create or edit a product: photo, name, brand, public price and, for owner and
 * manager only, cost and the barber's commission, with the margin worked out
 * as they type. Cost and commission can stay empty until the owner captures them.
 */
export function ProductPanel({
  draft,
  canEdit,
  seesFinance,
  onClose,
}: {
  draft: ProductDraft | null
  canEdit: boolean
  seesFinance: boolean
  onClose: () => void
}) {
  const { repo } = useAdminAuth()
  const qc = useQueryClient()
  const toast = useToast()
  const [form, setForm] = useState<Form | null>(null)
  const [shownFor, setShownFor] = useState<ProductDraft | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const editing = draft?.mode === 'edit' ? draft.product : undefined

  if (draft !== shownFor) {
    setShownFor(draft)
    setError(null)
    setConfirmDelete(false)
    setForm(
      !draft
        ? null
        : editing
          ? {
              name: editing.name,
              brand: editing.brand,
              price: String(editing.price),
              cost: asText(editing.cost),
              commission: asText(editing.commission),
              imageUrl: editing.imageUrl,
              active: editing.active,
            }
          : { name: '', brand: '', price: '', cost: '', commission: '', imageUrl: null, active: true },
    )
  }

  const refresh = () => qc.invalidateQueries({ queryKey: ['admin', 'products'] })
  const save = useMutation({ mutationFn: (input: ProductInput) => repo.saveProduct(input), onSuccess: refresh })
  const remove = useMutation({ mutationFn: (id: string) => repo.deleteProduct(id), onSuccess: refresh })

  if (!draft || !form) return null
  const set = (patch: Partial<Form>) => setForm({ ...form, ...patch })
  const price = parseMoney(form.price)
  const cost = parseMoney(form.cost)
  const commission = parseMoney(form.commission)
  const margin =
    price !== null && !Number.isNaN(price)
      ? productMargin({
          price,
          cost: Number.isNaN(cost) ? null : cost,
          commission: Number.isNaN(commission) ? null : commission,
        })
      : null

  const submit = () => {
    if (price === null || Number.isNaN(price)) return setError('Escribe el precio público en pesos.')
    setError(null)
    save.mutate(
      {
        id: editing?.id,
        name: form.name,
        brand: form.brand,
        price,
        // Reception never sees these fields: keep what was stored.
        cost: seesFinance ? cost : (editing?.cost ?? null),
        commission: seesFinance ? commission : (editing?.commission ?? null),
        imageUrl: form.imageUrl,
        active: form.active,
      },
      {
        onSuccess: (p) => {
          toast(editing ? `«${p.name}» actualizado` : `«${p.name}» creado`)
          onClose()
        },
        onError: (e) => setError(errorMessage(e)),
      },
    )
  }

  return (
    <>
      <SidePanel
        open
        onOpenChange={(o) => !o && onClose()}
        title={editing ? editing.name : 'Nuevo producto'}
        description={canEdit ? 'Producto de venta en la barbería.' : 'Solo lectura'}
        footer={
          canEdit ? (
            <>
              {editing && (
                <button
                  type="button"
                  onClick={() => setConfirmDelete(true)}
                  className={buttonClass({ variant: 'ghost', size: 'sm', className: 'text-fg-danger sm:mr-auto' })}
                >
                  Eliminar
                </button>
              )}
              <button type="button" onClick={onClose} className={buttonClass({ variant: 'secondary', size: 'sm' })}>
                Cancelar
              </button>
              <button type="button" onClick={submit} disabled={save.isPending} className={buttonClass({ size: 'sm' })}>
                {save.isPending ? 'Guardando…' : editing ? 'Guardar cambios' : 'Crear producto'}
              </button>
            </>
          ) : undefined
        }
      >
        <form
          className="grid gap-6"
          onSubmit={(e) => {
            e.preventDefault()
            if (canEdit) submit()
          }}
        >
          {error && <Alert tone="danger" title={error} />}
          <ImageUploader
            label="Foto"
            value={form.imageUrl}
            onChange={(imageUrl) => set({ imageUrl })}
            onUpload={(blob) => repo.uploadProductImage(blob)}
            disabled={!canEdit}
          />
          <fieldset disabled={!canEdit} className="grid gap-5">
            <Input label="Nombre del producto" value={form.name} onChange={(e) => set({ name: e.target.value })} />
            <Input label="Marca" hint="Opcional." value={form.brand} onChange={(e) => set({ brand: e.target.value })} />
            <Input
              label="Precio público"
              inputMode="numeric"
              prefix="$"
              suffix="MXN"
              placeholder="0"
              value={form.price}
              onChange={(e) => set({ price: digits(e.target.value) })}
            />

            {seesFinance && (
              <section className="grid gap-4 rounded-lg border border-line p-4">
                <div>
                  <h3 className="text-sm font-semibold">Costo y comisión</h3>
                  <p className="text-[13px] text-fg-muted">Solo los ven dueño y gerente. Puedes dejarlos vacíos.</p>
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Input
                    label="Costo"
                    hint="Lo que cuesta producirlo o comprarlo."
                    inputMode="numeric"
                    prefix="$"
                    placeholder="Sin capturar"
                    value={form.cost}
                    onChange={(e) => set({ cost: digits(e.target.value) })}
                  />
                  <Input
                    label="Comisión para el barbero"
                    hint="Monto fijo por pieza vendida."
                    inputMode="numeric"
                    prefix="$"
                    placeholder="Sin capturar"
                    value={form.commission}
                    onChange={(e) => set({ commission: digits(e.target.value) })}
                  />
                </div>
                {margin && (
                  <div
                    aria-live="polite"
                    className={cn(
                      'flex flex-wrap items-baseline justify-between gap-2 rounded-md px-3 py-2.5',
                      margin.amount < 0 ? 'bg-red-100 text-red-700' : 'bg-surface',
                    )}
                  >
                    <span className="text-sm font-medium">Margen por pieza{margin.complete ? '' : ' (estimado)'}</span>
                    <span className="tabular text-lg font-semibold">
                      {money(margin.amount)}
                      {margin.pct !== null && <span className="ml-1.5 text-sm font-medium">({margin.pct}%)</span>}
                    </span>
                    {!margin.complete && (
                      <span className="w-full text-[13px] text-fg-muted">
                        Falta capturar{' '}
                        {cost === null && commission === null
                          ? 'costo y comisión'
                          : cost === null
                            ? 'el costo'
                            : 'la comisión'}
                        .
                      </span>
                    )}
                    {margin.amount < 0 && <span className="w-full text-[13px]">Se vende por debajo de su costo.</span>}
                  </div>
                )}
              </section>
            )}

            <div className="rounded-md border border-line p-4">
              <Switch
                label="Disponible para venta"
                description="Desactívalo si ya no lo manejan; se conserva en la lista."
                checked={form.active}
                disabled={!canEdit}
                onChange={(active) => set({ active })}
              />
            </div>
          </fieldset>
        </form>
      </SidePanel>

      {editing && (
        <Dialog
          open={confirmDelete}
          onOpenChange={setConfirmDelete}
          title={`¿Eliminar «${editing.name}»?`}
          description="Se borra del catálogo de productos. Esta acción no se puede deshacer."
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
                disabled={remove.isPending}
                onClick={() =>
                  remove.mutate(editing.id, {
                    onSuccess: () => {
                      toast('Producto eliminado')
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
