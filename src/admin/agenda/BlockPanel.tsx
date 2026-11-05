import { useState } from 'react'
import type { LocalDate, Staff, TimeBlock } from '@/domain/types'
import { Alert } from '@/components/ui/Alert'
import { buttonClass } from '@/components/ui/buttonClass'
import { capitalize, formatDateLong, formatTime12, localDate, localTime, toMinutes, zonedInstant } from '@/lib/time'
import { Input, Select } from '../ui/controls'
import { SidePanel } from '../ui/SidePanel'
import { useToast } from '../ui/Toast'
import { timeOptions } from './model'
import { errorMessage, useAgendaActions } from './useAgendaActions'

const REASONS = ['Comida', 'Vacaciones', 'Capacitación', 'Trámite personal', 'Día festivo']
const SHOP = 'shop'

export type BlockDraft = { mode: 'new'; staffId: string | null; date: LocalDate } | { mode: 'view'; block: TimeBlock }

/** Block time (lunch, vacation, holiday) so nobody can book it, or review and remove a block. */
export function BlockPanel({
  draft,
  staff,
  timeZone,
  canManage,
  onClose,
}: {
  draft: BlockDraft | null
  staff: Staff[]
  timeZone: string
  canManage: boolean
  onClose: () => void
}) {
  const { createBlock, deleteBlock } = useAgendaActions()
  const toast = useToast()
  const [who, setWho] = useState(SHOP)
  const [date, setDate] = useState<LocalDate>('')
  const [start, setStart] = useState('14:00')
  const [end, setEnd] = useState('15:00')
  const [reason, setReason] = useState(REASONS[0]!)
  const [other, setOther] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [shownFor, setShownFor] = useState<BlockDraft | null>(null)
  if (draft !== shownFor) {
    setShownFor(draft)
    if (draft?.mode === 'new') {
      setWho(draft.staffId ?? SHOP)
      setDate(draft.date)
      setStart('14:00')
      setEnd('15:00')
      setReason(REASONS[0]!)
      setOther('')
      setError(null)
    }
  }

  const times = timeOptions(8 * 60, 22 * 60).map((t) => ({ value: t, label: formatTime12(t) }))
  const staffName = (id: string | null) => (id ? (staff.find((s) => s.id === id)?.name ?? '') : 'Toda la barbería')

  if (draft?.mode === 'view') {
    const b = draft.block
    return (
      <SidePanel
        open
        onOpenChange={(o) => !o && onClose()}
        title={b.reason}
        description={`${capitalize(formatDateLong(localDate(b.startsAt, timeZone)))} · ${formatTime12(localTime(b.startsAt, timeZone))} – ${formatTime12(localTime(b.endsAt, timeZone))}`}
        footer={
          canManage ? (
            <button
              type="button"
              disabled={deleteBlock.isPending}
              onClick={() =>
                deleteBlock.mutate(b.id, {
                  onSuccess: () => {
                    toast('Bloqueo quitado; el horario vuelve a estar disponible')
                    onClose()
                  },
                  onError: (e) => setError(errorMessage(e)),
                })
              }
              className={buttonClass({ variant: 'danger', size: 'sm' })}
            >
              Quitar bloqueo
            </button>
          ) : undefined
        }
      >
        <div className="grid gap-4 text-sm">
          {error && <Alert tone="danger" title={error} />}
          <p>
            <span className="text-fg-muted">Aplica a:</span> <strong>{staffName(b.staffId)}</strong>
          </p>
          <p className="text-fg-muted">
            Mientras exista, nadie puede reservar en ese horario (ni en línea ni desde el panel).
          </p>
        </div>
      </SidePanel>
    )
  }

  const submit = () => {
    const text = reason === 'Otro' ? other.trim() : reason
    if (!text) return setError('Escribe el motivo.')
    if (toMinutes(end) <= toMinutes(start)) return setError('La hora de fin debe ser después del inicio.')
    setError(null)
    createBlock.mutate(
      {
        staffId: who === SHOP ? null : who,
        startsAt: zonedInstant(date, start, timeZone).toISOString(),
        endsAt: zonedInstant(date, end, timeZone).toISOString(),
        reason: text,
      },
      {
        onSuccess: () => {
          toast('Horario bloqueado')
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
      title="Bloquear horario"
      description="Comidas, vacaciones, trámites o días festivos."
      footer={
        <>
          <button type="button" onClick={onClose} className={buttonClass({ variant: 'secondary', size: 'sm' })}>
            Cancelar
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={createBlock.isPending}
            className={buttonClass({ size: 'sm' })}
          >
            {createBlock.isPending ? 'Guardando…' : 'Bloquear horario'}
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
        <Select
          label="Para"
          value={who}
          onChange={(e) => setWho(e.target.value)}
          options={[{ value: SHOP, label: 'Toda la barbería' }, ...staff.map((s) => ({ value: s.id, label: s.name }))]}
        />
        <Input label="Fecha" type="date" value={date} onChange={(e) => e.target.value && setDate(e.target.value)} />
        <div className="grid grid-cols-2 gap-3">
          <Select label="Desde" value={start} onChange={(e) => setStart(e.target.value)} options={times} />
          <Select label="Hasta" value={end} onChange={(e) => setEnd(e.target.value)} options={times} />
        </div>
        <Select
          label="Motivo"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          options={[...REASONS, 'Otro'].map((r) => ({ value: r, label: r }))}
        />
        {reason === 'Otro' && (
          <Input label="¿Cuál?" value={other} onChange={(e) => setOther(e.target.value)} autoFocus />
        )}
        <p className="text-[13px] text-fg-muted">Si ya hay citas en ese horario, primero reprográmalas o cancélalas.</p>
      </form>
    </SidePanel>
  )
}
