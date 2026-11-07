import type { Appointment, LocalDate, TimeRange } from '@/domain/types'
import { addDays, fromMinutes, localTime, toMinutes, weekdayOf } from '@/lib/time'
import type { AgendaDay } from '../domain'

/** Pure helpers for the agenda screen (no React, no clock of its own). */

export type AgendaView = 'dia' | 'semana'

/** Monday-to-Sunday week that contains `date` (the shop's week starts on Monday). */
export function weekOf(date: LocalDate): LocalDate[] {
  const monday = addDays(date, -((weekdayOf(date) + 6) % 7))
  return Array.from({ length: 7 }, (_, i) => addDays(monday, i))
}

/** Step used by the previous/next buttons. */
export const shiftDate = (date: LocalDate, view: AgendaView, dir: -1 | 1) =>
  addDays(date, dir * (view === 'semana' ? 7 : 1))

/**
 * First and last minute to draw: the earliest opening and latest closing across
 * shop hours and the visible barbers' schedules, in whole hours. Falls back to
 * 10:00–20:00 when nobody works in the range.
 */
export function gridBounds(days: AgendaDay[], staffIds: string[] | null): [number, number] {
  const minutes: number[] = []
  const add = (r: TimeRange) => minutes.push(toMinutes(r.start), toMinutes(r.end))
  for (const d of days) {
    d.hours.forEach(add)
    for (const s of d.staff) {
      if (staffIds && !staffIds.includes(s.id)) continue
      ;(s.schedule[weekdayOf(d.date)] ?? []).forEach(add)
    }
    // Appointments outside hours (e.g. a late walk-in) must still be visible.
    for (const a of d.appointments) {
      if (staffIds && !staffIds.includes(a.staffId)) continue
      minutes.push(toMinutes(localTime(a.startsAt, d.timeZone)), toMinutes(localTime(a.endsAt, d.timeZone)))
    }
  }
  if (!minutes.length) return [10 * 60, 20 * 60]
  return [Math.floor(Math.min(...minutes) / 60) * 60, Math.ceil(Math.max(...minutes) / 60) * 60]
}

export const isOpen = (a: Appointment) => a.status === 'booked' || a.status === 'confirmed'

/** Completing makes sense once the appointment started. */
export const canComplete = (a: Appointment, now: Date) => isOpen(a) && now.getTime() >= Date.parse(a.startsAt)

/** A no-show can be recorded after the tolerance has passed. */
export const canMarkNoShow = (a: Appointment, now: Date, toleranceMin: number) =>
  isOpen(a) && now.getTime() >= Date.parse(a.startsAt) + toleranceMin * 60000

/** Times every `step` minutes between two minutes of the day, as "HH:mm". */
export const timeOptions = (from: number, to: number, step = 15) =>
  Array.from({ length: Math.floor((to - from) / step) + 1 }, (_, i) => fromMinutes(from + i * step))

/** Minute of the day under a click on a column, snapped down to the grid. */
export const minuteAt = (offsetPx: number, from: number, pxPerMin: number, step = 15) =>
  from + Math.max(0, Math.floor(offsetPx / pxPerMin / step) * step)
