import { repo } from '../../data/store'
import type { Appointment, AppointmentStatus } from '../../data/types'

export const STATUS_LABEL: Record<AppointmentStatus, string> = {
  confirmada: 'Confirmada',
  completada: 'Completada',
  cancelada: 'Cancelada',
  no_asistio: 'No asistió',
}

export function StatusBadge({ status }: { status: AppointmentStatus }) {
  return <span className={`status ${status}`}>{STATUS_LABEL[status]}</span>
}

export function StatusActions({ a, onChange }: { a: Appointment; onChange: () => void }) {
  const set = async (s: AppointmentStatus) => {
    await repo.setStatus(a.id, s)
    onChange()
  }
  if (a.status !== 'confirmada') {
    return (
      <button className="btn quiet sm" onClick={() => set('confirmada')}>
        Reabrir
      </button>
    )
  }
  return (
    <>
      <button className="btn ghost sm" onClick={() => set('completada')}>
        Completada
      </button>
      <button className="btn quiet sm" onClick={() => set('no_asistio')}>
        No asistió
      </button>
      <button
        className="btn quiet sm"
        onClick={() => {
          if (confirm(`¿Cancelar la cita de ${a.customerName}?`)) set('cancelada')
        }}
      >
        Cancelar
      </button>
    </>
  )
}
