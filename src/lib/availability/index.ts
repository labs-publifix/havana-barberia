import type { Appointment, BookingPolicy, BusinessHours, LocalDate, Slot, Staff, TimeBlock } from '@/domain/types'
import { addDays, fromMinutes, localDate, toMinutes, weekdayOf, zonedInstant } from '@/lib/time'

/**
 * Availability engine. Pure: no React, no storage, no device time zone.
 *
 * Builds a grid (every `slotStepMin`) across the business hours of `date`.
 * A slot is available when at least one candidate barber can take the whole
 * appointment: inside their schedule, not overlapping appointments or blocks
 * (plus the optional buffer), after the minimum notice, and ending at or
 * before closing. With several candidates ("any"), the barber with the fewest
 * active appointments that day takes it; ties go to the earlier one in `staff`.
 */

export type BusyAppointment = Pick<Appointment, 'id' | 'staffId' | 'startsAt' | 'endsAt' | 'status'>

export interface AvailabilityInput {
  date: LocalDate
  durationMin: number
  /** Candidate barbers, in tie-break order. One item for a specific barber. */
  staff: Staff[]
  hours: BusinessHours
  policy: BookingPolicy
  appointments: BusyAppointment[]
  blocks: TimeBlock[]
  now: Date
  /** Appointment being rescheduled: its own time does not count as busy. */
  excludeAppointmentId?: string
}

const ACTIVE: ReadonlySet<Appointment['status']> = new Set(['booked', 'confirmed', 'completed'])

export const isActiveStatus = (s: Appointment['status']) => ACTIVE.has(s)

interface Interval {
  start: number
  end: number
}

const overlaps = (a: Interval, b: Interval) => a.start < b.end && b.start < a.end

/** Whether `date` is inside the bookable window (today … today + maxAdvanceDays). */
export function isWithinBookingWindow(date: LocalDate, now: Date, hours: BusinessHours, policy: BookingPolicy) {
  const today = localDate(now, hours.timeZone)
  return date >= today && date <= addDays(today, policy.maxAdvanceDays)
}

export function computeSlots(input: AvailabilityInput): Slot[] {
  const { date, durationMin, staff, hours, policy, now } = input
  if (durationMin <= 0 || staff.length === 0) return []
  if (!isWithinBookingWindow(date, now, hours, policy)) return []

  const wd = weekdayOf(date)
  const shopRanges = hours.weekly[wd] ?? []
  if (shopRanges.length === 0) return []

  const tz = hours.timeZone
  const dayStart = zonedInstant(date, '00:00', tz).getTime()
  const toMin = (iso: string) => Math.round((Date.parse(iso) - dayStart) / 60000)
  const earliest = Math.ceil((now.getTime() + policy.minNoticeMin * 60000 - dayStart) / 60000)

  const relevant = input.appointments.filter((a) => isActiveStatus(a.status) && a.id !== input.excludeAppointmentId)

  const perStaff = staff.map((s, order) => {
    const busy: Interval[] = []
    let load = 0
    for (const a of relevant) {
      if (a.staffId !== s.id) continue
      const iv = { start: toMin(a.startsAt), end: toMin(a.endsAt) + policy.bufferMin }
      if (iv.end <= 0 || iv.start >= 24 * 60 + policy.bufferMin) continue
      busy.push(iv)
      load++
    }
    for (const b of input.blocks) {
      if (b.staffId !== null && b.staffId !== s.id) continue
      busy.push({ start: toMin(b.startsAt), end: toMin(b.endsAt) })
    }
    const ranges = (s.schedule[wd] ?? []).map((r) => ({ start: toMinutes(r.start), end: toMinutes(r.end) }))
    return { staff: s, order, busy, load, ranges }
  })

  const slots: Slot[] = []
  const seen = new Set<number>()
  for (const r of shopRanges) {
    const open = toMinutes(r.start)
    const close = toMinutes(r.end)
    for (let t = open; t + durationMin <= close; t += policy.slotStepMin) {
      if (seen.has(t)) continue
      seen.add(t)
      const need: Interval = { start: t, end: t + durationMin + policy.bufferMin }
      const work: Interval = { start: t, end: t + durationMin }
      const candidates =
        t < earliest
          ? []
          : perStaff.filter(
              (p) =>
                p.ranges.some((sr) => work.start >= sr.start && work.end <= sr.end) &&
                !p.busy.some((b) => overlaps(b, need)),
            )
      const pick = candidates.sort((a, b) => a.load - b.load || a.order - b.order)[0]
      slots.push({
        time: fromMinutes(t),
        startsAt: new Date(dayStart + t * 60000).toISOString(),
        endsAt: new Date(dayStart + (t + durationMin) * 60000).toISOString(),
        available: Boolean(pick),
        staffId: pick?.staff.id ?? null,
      })
    }
  }
  return slots.sort((a, b) => a.startsAt.localeCompare(b.startsAt))
}

/** Total duration of the chosen services. */
export const totalDuration = (services: { durationMin: number }[]) => services.reduce((s, x) => s + x.durationMin, 0)

/** Available slots closest in time to `target` (for "that slot was just taken"). */
export function nearestAvailable(slots: Slot[], target: string, count = 3): Slot[] {
  const t = Date.parse(target)
  return slots
    .filter((s) => s.available && s.startsAt !== target)
    .sort((a, b) => Math.abs(Date.parse(a.startsAt) - t) - Math.abs(Date.parse(b.startsAt) - t))
    .slice(0, count)
    .sort((a, b) => a.startsAt.localeCompare(b.startsAt))
}

/** Staff able to perform every one of the given services. */
export function staffForServices(staff: Staff[], serviceIds: string[]): Staff[] {
  return staff
    .filter(
      (s) => s.active && (s.serviceIds === 'all' || serviceIds.every((id) => (s.serviceIds as string[]).includes(id))),
    )
    .sort((a, b) => a.order - b.order)
}
