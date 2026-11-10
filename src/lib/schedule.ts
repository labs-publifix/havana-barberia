import type { Appointment, TimeRange, WeeklySchedule } from '@/domain/types'
import { formatTime12, fromMinutes, localDate, localTime, toMinutes, weekdayOf } from './time'

/**
 * Weekly schedule rules (pure). Index 0 = Sunday … 6 = Saturday.
 * A barber's shifts must sit inside the shop's hours, on the 15-minute grid,
 * and not overlap.
 */

export const DAY_NAMES = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado']

/** Problems per weekday (only days with a problem appear). */
export function scheduleErrors(schedule: WeeklySchedule, shop: WeeklySchedule): Record<number, string> {
  const errors: Record<number, string> = {}
  for (let d = 0; d < 7; d++) {
    const ranges = schedule[d] ?? []
    if (!ranges.length) continue
    const open = shop[d] ?? []
    if (!open.length) {
      errors[d] = 'La barbería no abre ese día.'
      continue
    }
    const from = Math.min(...open.map((r) => toMinutes(r.start)))
    const to = Math.max(...open.map((r) => toMinutes(r.end)))
    const sorted = [...ranges].sort((a, b) => toMinutes(a.start) - toMinutes(b.start))
    for (let i = 0; i < sorted.length; i++) {
      const s = toMinutes(sorted[i]!.start)
      const e = toMinutes(sorted[i]!.end)
      if (s % 15 || e % 15) errors[d] = 'Usa horas en punto o cada 15 minutos.'
      else if (e <= s) errors[d] = 'Cada turno debe terminar después de empezar.'
      else if (s < from || e > to)
        errors[d] =
          `Debe quedar dentro del horario de la barbería (${formatTime12(fromMinutes(from))} – ${formatTime12(fromMinutes(to))}).`
      else if (i > 0 && s < toMinutes(sorted[i - 1]!.end)) errors[d] = 'Los turnos se enciman.'
      if (errors[d]) break
    }
  }
  return errors
}

/** "10:00 a. m. – 2:00 p. m. · 3:00 p. m. – 8:30 p. m." or "Descansa". */
export const rangesLabel = (ranges: TimeRange[]) =>
  ranges.length ? ranges.map((r) => `${formatTime12(r.start)} – ${formatTime12(r.end)}`).join(' · ') : 'Descansa'

/** Working minutes in a week. */
export const weeklyMinutes = (schedule: WeeklySchedule) =>
  schedule.reduce((m, day) => m + (day ?? []).reduce((x, r) => x + toMinutes(r.end) - toMinutes(r.start), 0), 0)

/**
 * Upcoming active appointments of a barber that a schedule would leave outside
 * their shifts (they still exist; the shop should move them).
 */
export function outsideSchedule(
  appointments: Appointment[],
  staffId: string,
  schedule: WeeklySchedule,
  timeZone: string,
  now: Date,
): Appointment[] {
  return appointments.filter((a) => {
    if (a.staffId !== staffId || (a.status !== 'booked' && a.status !== 'confirmed')) return false
    if (Date.parse(a.startsAt) <= now.getTime()) return false
    const ranges = schedule[weekdayOf(localDate(a.startsAt, timeZone))] ?? []
    const s = toMinutes(localTime(a.startsAt, timeZone))
    const e = toMinutes(localTime(a.endsAt, timeZone)) || 24 * 60
    return !ranges.some((r) => s >= toMinutes(r.start) && e <= toMinutes(r.end))
  })
}

// ── The shop's own hours (Ajustes › Horario) ─────────────────────────────────
/** What the shop's hours may span: 6:00 a. m. to 11:00 p. m., any day. */
export const SHOP_LIMITS: WeeklySchedule = Array.from({ length: 7 }, () => [{ start: '06:00', end: '23:00' }])

/** Problems per weekday in the shop's hours, plus `-1` when it never opens. */
export function shopHoursErrors(weekly: WeeklySchedule): Record<number, string> {
  const errors = scheduleErrors(weekly, SHOP_LIMITS)
  if (!weekly.some((d) => (d ?? []).length)) errors[-1] = 'La barbería debe abrir al menos un día.'
  return errors
}

/** Upcoming active appointments that fall outside the shop's hours. */
export function outsideShopHours(
  appointments: Appointment[],
  weekly: WeeklySchedule,
  timeZone: string,
  now: Date,
): Appointment[] {
  return appointments.filter((a) => {
    if (a.status !== 'booked' && a.status !== 'confirmed') return false
    if (Date.parse(a.startsAt) <= now.getTime()) return false
    const ranges = weekly[weekdayOf(localDate(a.startsAt, timeZone))] ?? []
    const s = toMinutes(localTime(a.startsAt, timeZone))
    const e = toMinutes(localTime(a.endsAt, timeZone)) || 24 * 60
    return !ranges.some((r) => s >= toMinutes(r.start) && e <= toMinutes(r.end))
  })
}

/** Days on which a barber's shifts no longer fit the shop's hours. */
export function daysOutsideShop(schedule: WeeklySchedule, weekly: WeeklySchedule): number[] {
  return Object.keys(scheduleErrors(schedule, weekly)).map(Number)
}
