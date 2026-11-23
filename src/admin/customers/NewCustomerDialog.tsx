import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Alert } from '@/components/ui/Alert'
import { buttonClass } from '@/components/ui/buttonClass'
import { Dialog } from '@/components/ui/Dialog'
import { TextArea } from '@/components/ui/Field'
import type { Customer } from '@/domain/types'
import { useAdminAuth } from '../auth/AdminAuth'
import { errorMessage } from '../agenda/useAgendaActions'
import { Input } from '../ui/controls'
import { useToast } from '../ui/Toast'

const empty = { name: '', phone: '', email: '', notes: '' }

/**
 * Clientes › Nuevo cliente: add someone to the customer list without an
 * appointment (name and a phone or e-mail). A phone or e-mail that already
 * belongs to someone is refused, so nobody is duplicated.
 */
export function NewCustomerDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onCreated: (c: Customer) => void
}) {
  const { repo } = useAdminAuth()
  const qc = useQueryClient()
  const toast = useToast()
  const [form, setForm] = useState(empty)
  const [error, setError] = useState<string | null>(null)
  const set = (patch: Partial<typeof empty>) => setForm((f) => ({ ...f, ...patch }))
  const create = useMutation({
    mutationFn: () => repo.createCustomer(form),
    onSuccess: async (c) => {
      setForm(empty)
      setError(null)
      await qc.invalidateQueries({ queryKey: ['admin', 'customers'] })
      toast(`${c.name} agregado a tus clientes`)
      onCreated(c)
    },
    onError: (e) => setError(errorMessage(e)),
  })
  const close = (o: boolean) => {
    if (!o) {
      setError(null)
      setForm(empty)
    }
    onOpenChange(o)
  }

  return (
    <Dialog
      open={open}
      onOpenChange={close}
      title="Nuevo cliente"
      description="Regístralo aunque no tenga cita. Con su teléfono o correo podrás invitarlo y agendarle después."
      footer={
        <>
          <button
            type="button"
            onClick={() => close(false)}
            className={buttonClass({ variant: 'secondary', size: 'sm' })}
          >
            Cancelar
          </button>
          <button type="submit" form="new-customer" disabled={create.isPending} className={buttonClass({ size: 'sm' })}>
            {create.isPending ? 'Guardando…' : 'Guardar cliente'}
          </button>
        </>
      }
    >
      <form
        id="new-customer"
        className="grid gap-4"
        onSubmit={(e) => {
          e.preventDefault()
          create.mutate()
        }}
      >
        {error && <Alert tone="danger" title={error} />}
        <Input label="Nombre" autoComplete="off" value={form.name} onChange={(e) => set({ name: e.target.value })} />
        <Input
          label="Teléfono"
          inputMode="tel"
          autoComplete="off"
          placeholder="10 dígitos"
          value={form.phone}
          onChange={(e) => set({ phone: e.target.value })}
        />
        <Input
          label="Correo (opcional)"
          type="email"
          autoComplete="off"
          value={form.email}
          onChange={(e) => set({ email: e.target.value })}
        />
        <TextArea
          label="Notas (opcional)"
          rows={2}
          value={form.notes}
          onChange={(e) => set({ notes: e.target.value })}
        />
      </form>
    </Dialog>
  )
}
