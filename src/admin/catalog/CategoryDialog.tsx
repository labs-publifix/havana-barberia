import { useState } from 'react'
import { Alert } from '@/components/ui/Alert'
import { buttonClass } from '@/components/ui/buttonClass'
import { Dialog } from '@/components/ui/Dialog'
import type { ServiceCategory } from '@/domain/types'
import { errorMessage } from '../agenda/useAgendaActions'
import { Input } from '../ui/controls'
import { useToast } from '../ui/Toast'
import { useCatalogActions } from './useCatalogActions'

export type CategoryDraft = { mode: 'new' } | { mode: 'edit'; category: ServiceCategory }

/** Create or rename a category. */
export function CategoryDialog({ draft, onClose }: { draft: CategoryDraft | null; onClose: () => void }) {
  const { saveCategory } = useCatalogActions()
  const toast = useToast()
  const [name, setName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [shownFor, setShownFor] = useState<CategoryDraft | null>(null)
  if (draft !== shownFor) {
    setShownFor(draft)
    setName(draft?.mode === 'edit' ? draft.category.name : '')
    setError(null)
  }

  const submit = () =>
    saveCategory.mutate(
      { id: draft?.mode === 'edit' ? draft.category.id : undefined, name },
      {
        onSuccess: (c) => {
          toast(draft?.mode === 'edit' ? 'Categoría renombrada' : `Categoría «${c.name}» creada`)
          onClose()
        },
        onError: (e) => setError(errorMessage(e)),
      },
    )

  return (
    <Dialog
      open={!!draft}
      onOpenChange={(o) => !o && onClose()}
      title={draft?.mode === 'edit' ? 'Renombrar categoría' : 'Nueva categoría'}
      footer={
        <>
          <button type="button" onClick={onClose} className={buttonClass({ variant: 'secondary', size: 'sm' })}>
            Cancelar
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={saveCategory.isPending}
            className={buttonClass({ size: 'sm' })}
          >
            {draft?.mode === 'edit' ? 'Guardar' : 'Crear categoría'}
          </button>
        </>
      }
    >
      <form
        className="grid gap-4"
        onSubmit={(e) => {
          e.preventDefault()
          submit()
        }}
      >
        {error && <Alert tone="danger" title={error} />}
        <Input label="Nombre" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
      </form>
    </Dialog>
  )
}
