import type { Appointment, Staff, TimeBlock, TimeRange } from '@/domain/types'
import { localTime, toMinutes, weekdayOf } from '@/lib/time'
import type { AgendaDay } from './domain'

/**
 * Pure numbers behind the overview screen. No React, no clock of its own:
 * everything comes from the day's data and `now`, so it is easy to test and
 * will work the same with Supabase.
 */

export const isPending = (a: Appointment) => a.status === 'booked' || a.status === 'confirmed'
/** Counts toward the day's work and value (cancelled and no-shows do not). */
const counts = (a: Appointment) => a.status !== 'cancelled' && a.status !== 'no_show'

export interface StaffLoad {
  staff: Staff
  /** Working ranges that day (from the barber's weekly schedule). */
  ranges: TimeRange[]
  workingMin: number
  bookedMin: number
  /** 0–100, rounded. */
  pct: number
}

export type AlertKind = 'unclosed' | 'unconfirmed' | 'no_show' | 'block' | 'cancelled'

export interface OverviewAlert {
  kind: AlertKind
  appointment?: Appointment
  block?: TimeBlock
}

export interface DayOverview {
  /** Appointments visible to this person (own only for a barber), by start time. */
  appointments: Appointment[]
  totals: {
    /** Everything except cancellations. */
    scheduled: number
    completed: number
    pending: number
    noShow: number
    cancelled: number
  }
  inProgress: Appointment[]
  upcoming: Appointment[]
  next: Appointment | null
  loads: StaffLoad[]
  /** Booked minutes over working minutes, all visible barbers. */
  occupancyPct: number
  /** Sum of prices of appointments that count (MXN). */
  value: number
  alerts: OverviewAlert[]
}

export interface OverviewOptions {
  /** Limit to one barber (the barber role sees only their own day). */
  staffId?: string | null
  /** "Unconfirmed" alerts look this far ahead. */
  confirmWindowMin?: number
}

const minutesOfDay = (at: string, tz: string) => toMinutes(localTime(at, tz))

/** Minutes of `ranges` not covered by `blocks` (both in minutes of the day). */
function freeMinutes(ranges: TimeRange[], blocks: [number, number][]) {
  let total = 0
  for (const r of ranges) {
    const start = toMinutes(r.start)
    const end = toMinutes(r.end)
    const cuts = blocks
      .map(([a, b]) => [Math.max(a, start), Math.min(b, end)] as const)
      .filter(([a, b]) => b > a)
      .sort((x, y) => x[0] - y[0])
    let covered = 0
    let cursor = start
    for (const [a, b] of cuts) {
      if (b <= cursor) continue
      covered += b - Math.max(a, cursor)
      cursor = b
    }
    total += end - start - covered
  }
  return total
}

export function computeOverview(day: AgendaDay, now: Date, opts: OverviewOptions = {}): DayOverview {
  const tz = day.timeZone
  const t = now.getTime()
  const staff = opts.staffId ? day.staff.filter((s) => s.id === opts.staffId) : day.staff
  const ids = new Set(staff.map((s) => s.id))
  const appointments = day.appointments
    .filter((a) => ids.has(a.staffId))
    .sort((a, b) => a.startsAt.localeCompare(b.startsAt))
  const blocks = day.blocks.filter((b) => b.staffId === null || ids.has(b.staffId))

  const start = (a: Appointment) => Date.parse(a.startsAt)
  const end = (a: Appointment) => Date.parse(a.endsAt)
  const pending = appointments.filter(isPending)
  const inProgress = pending.filter((a) => start(a) <= t && t < end(a))
  const upcoming = pending.filter((a) => start(a) > t)

  const weekday = weekdayOf(day.date)
  const loads: StaffLoad[] = staff.map((s) => {
    const ranges = s.schedule[weekday] ?? []
    const own = blocks
      .filter((b) => b.staffId === null || b.staffId === s.id)
      .map((b) => [minutesOfDay(b.startsAt, tz), minutesOfDay(b.endsAt, tz)] as [number, number])
    const workingMin = freeMinutes(ranges, own)
    const bookedMin = appointments.filter((a) => a.staffId === s.id && counts(a)).reduce((m, a) => m + a.durationMin, 0)
    return {
      staff: s,
      ranges,
      workingMin,
      bookedMin,
      pct: workingMin ? Math.min(100, Math.round((bookedMin / workingMin) * 100)) : 0,
    }
  })
  const working = loads.reduce((m, l) => m + l.workingMin, 0)
  const booked = loads.reduce((m, l) => m + l.bookedMin, 0)

  const window = (opts.confirmWindowMin ?? 120) * 60000
  const alerts: OverviewAlert[] = [
    // Time is over and nobody marked it: it should be completed or a no-show.
    ...pending.filter((a) => end(a) <= t).map((a) => ({ kind: 'unclosed' as const, appointment: a })),
    ...upcoming
      .filter((a) => a.status === 'booked' && start(a) - t <= window)
      .map((a) => ({ kind: 'unconfirmed' as const, appointment: a })),
    ...appointments.filter((a) => a.status === 'no_show').map((a) => ({ kind: 'no_show' as const, appointment: a })),
    ...blocks.map((b) => ({ kind: 'block' as const, block: b })),
    ...appointments
      .filter((a) => a.status === 'cancelled')
      .map((a) => ({ kind: 'cancelled' as const, appointment: a })),
  ]

  return {
    appointments,
    totals: {
      scheduled: appointments.filter((a) => a.status !== 'cancelled').length,
      completed: appointments.filter((a) => a.status === 'completed').length,
      pending: pending.length,
      noShow: appointments.filter((a) => a.status === 'no_show').length,
      cancelled: appointments.filter((a) => a.status === 'cancelled').length,
    },
    inProgress,
    upcoming,
    next: upcoming[0] ?? null,
    loads,
    occupancyPct: working ? Math.min(100, Math.round((booked / working) * 100)) : 0,
    value: appointments.filter(counts).reduce((m, a) => m + a.totalPrice, 0),
    alerts,
  }
}

/** First and last minute to draw on the day timeline (shop hours and every visible schedule). */
export function timelineBounds(day: AgendaDay, loads: StaffLoad[]): [number, number] | null {
  const ranges = [...day.hours, ...loads.flatMap((l) => l.ranges)]
  if (!ranges.length) return null
  const from = Math.min(...ranges.map((r) => toMinutes(r.start)))
  const to = Math.max(...ranges.map((r) => toMinutes(r.end)))
  // Whole hours look calmer on the axis.
  return [Math.floor(from / 60) * 60, Math.ceil(to / 60) * 60]
}
