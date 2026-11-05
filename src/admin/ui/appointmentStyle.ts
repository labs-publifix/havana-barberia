import type { Appointment, AppointmentSource } from '@/domain/types'

/**
 * How appointments look on the timeline and the agenda grid. Visual weight
 * follows what needs attention: confirmed work is solid, unconfirmed is dashed,
 * done is quiet. One class string per state (cn() does not resolve conflicts).
 */
export const liveStyle = 'bg-ink-950 text-white ring-2 ring-inset ring-aqua-500'

export const statusStyle: Record<Appointment['status'], string> = {
  confirmed: 'bg-ink-950 text-white',
  booked: 'border-[1.5px] border-dashed border-ink-950 bg-raised text-fg',
  completed: 'bg-success-100 text-success-700',
  no_show: 'bg-red-100 text-red-700',
  cancelled: 'border border-line bg-surface text-fg-muted',
}

/** Lowercase words for screen readers ("…, sin confirmar"). */
export const statusText: Record<Appointment['status'], string> = {
  booked: 'sin confirmar',
  confirmed: 'confirmada',
  completed: 'completada',
  cancelled: 'cancelada',
  no_show: 'no se presentó',
}

export const sourceLabel: Record<AppointmentSource, string> = {
  online: 'Reservó en línea',
  panel: 'Agendada desde el panel',
  walk_in: 'Walk-in',
}

/** Appointment in progress right now (started, not ended, not closed). */
export const isLive = (a: Appointment, now: Date) =>
  (a.status === 'booked' || a.status === 'confirmed') &&
  Date.parse(a.startsAt) <= now.getTime() &&
  now.getTime() < Date.parse(a.endsAt)

/** "Mauricio O." */
export const shortName = (name: string) => {
  const [first = '', last = ''] = name.split(/\s+/)
  return last ? `${first} ${last.charAt(0)}.` : first
}
