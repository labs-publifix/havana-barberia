import type { Appointment, AppointmentSource, ID, LocalDate, Service, Staff } from '@/domain/types'
import { addDays, localDate, localTime, toMinutes, weekdayOf } from '@/lib/time'
import { productsTotalOf } from '../cash'

/**
 * Report figures (pure). Sales count what was charged (services + products,
 * without tips); only appointments that already started count as done/no-show.
 */

const charged = (a: Appointment) => (a.payment ? a.payment.amount + productsTotalOf(a.payment) : a.totalPrice)

export interface DayPoint {
  date: LocalDate
  sales: number
  done: number
}

/** Sales and completed appointments per day (counter sales of products included). */
export function salesByDay(
  appointments: Appointment[],
  sales: { at: string; total: number }[],
  from: LocalDate,
  to: LocalDate,
  tz: string,
): DayPoint[] {
  const days: DayPoint[] = []
  for (let d = from; d <= to; d = addDays(d, 1)) days.push({ date: d, sales: 0, done: 0 })
  const at = new Map(days.map((x) => [x.date, x]))
  for (const a of appointments) {
    if (a.status !== 'completed') continue
    const day = at.get(localDate(a.startsAt, tz))
    if (!day) continue
    day.sales += charged(a)
    day.done++
  }
  for (const s of sales) {
    const day = at.get(localDate(s.at, tz))
    if (day) day.sales += s.total
  }
  return days
}

/**
 * Share of the barbers' scheduled time that was booked (any appointment not
 * cancelled), from `from` to `to`. Days off and closed days add nothing.
 */
export function occupancy(appointments: Appointment[], staff: Staff[], from: LocalDate, to: LocalDate, tz: string) {
  let available = 0
  let booked = 0
  const per = new Map<ID, { available: number; booked: number }>()
  for (const s of staff.filter((x) => x.active)) per.set(s.id, { available: 0, booked: 0 })
  for (let d = from; d <= to; d = addDays(d, 1)) {
    for (const s of staff) {
      const p = per.get(s.id)
      if (!p) continue
      const mins = (s.schedule[weekdayOf(d)] ?? []).reduce((t, r) => t + toMinutes(r.end) - toMinutes(r.start), 0)
      p.available += mins
      available += mins
    }
  }
  for (const a of appointments) {
    if (a.status === 'cancelled') continue
    const d = localDate(a.startsAt, tz)
    const p = a.staffId ? per.get(a.staffId) : undefined
    if (d < from || d > to || !p) continue
    p.booked += a.durationMin
    booked += a.durationMin
  }
  const pct = (b: number, av: number) => (av ? Math.min(100, Math.round((b / av) * 100)) : 0)
  return {
    pct: pct(booked, available),
    byStaff: new Map([...per].map(([id, v]) => [id, pct(v.booked, v.available)])),
  }
}

/** Appointments (not cancelled) by weekday (Monday first) and starting hour: when the shop is busiest. */
export function demandGrid(appointments: Appointment[], tz: string, hours: number[]) {
  const grid = Array.from({ length: 7 }, () => hours.map(() => 0))
  for (const a of appointments) {
    if (a.status === 'cancelled') continue
    const row = (weekdayOf(localDate(a.startsAt, tz)) + 6) % 7
    const col = hours.indexOf(Math.floor(toMinutes(localTime(a.startsAt, tz)) / 60))
    if (col >= 0) grid[row]![col]!++
  }
  return grid
}

export interface BarberRow {
  id: ID
  name: string
  sales: number
  done: number
  avg: number
  prevSales: number
}

/** Sales and completed appointments per barber, with the previous period's sales. */
export function salesByBarber(current: Appointment[], previous: Appointment[], staff: Staff[]): BarberRow[] {
  const total = (list: Appointment[], id: ID) =>
    list.filter((a) => a.staffId === id && a.status === 'completed').reduce((t, a) => t + charged(a), 0)
  return staff
    .map((s) => {
      const done = current.filter((a) => a.staffId === s.id && a.status === 'completed').length
      const sales = total(current, s.id)
      return {
        id: s.id,
        name: s.name,
        sales,
        done,
        avg: done ? Math.round(sales / done) : 0,
        prevSales: total(previous, s.id),
      }
    })
    .filter((r) => r.done > 0 || r.prevSales > 0)
    .sort((a, b) => b.sales - a.sales)
}

/** Most requested services (completed), with what they brought in at list price. */
export function topServices(appointments: Appointment[], services: Service[], limit = 6) {
  const m = new Map<ID, { n: number; revenue: number }>()
  for (const a of appointments) {
    if (a.status !== 'completed') continue
    for (const id of a.serviceIds) {
      const x = m.get(id) ?? { n: 0, revenue: 0 }
      x.n++
      x.revenue += services.find((s) => s.id === id)?.price ?? 0
      m.set(id, x)
    }
  }
  return [...m]
    .sort((a, b) => b[1].n - a[1].n || b[1].revenue - a[1].revenue)
    .slice(0, limit)
    .map(([id, v]) => ({ id, name: services.find((s) => s.id === id)?.name ?? 'Servicio', ...v }))
}

/** How appointments arrived (not cancelled). */
export function bySource(appointments: Appointment[]): Record<AppointmentSource, number> {
  const r: Record<AppointmentSource, number> = { online: 0, panel: 0, walk_in: 0 }
  for (const a of appointments) if (a.status !== 'cancelled') r[a.source ?? 'online']++
  return r
}

/** Customers served in the period, and how many also came in the previous one. */
export function customersServed(current: Appointment[], previous: Appointment[]) {
  const ids = (list: Appointment[]) => new Set(list.filter((a) => a.status === 'completed').map((a) => a.customerId))
  const now = ids(current)
  const before = ids(previous)
  return { served: now.size, returning: [...now].filter((id) => before.has(id)).length }
}

/** Signed change in percent, or null when there is nothing to compare with. */
export const changePct = (current: number, previous: number) =>
  previous ? Math.round(((current - previous) / previous) * 100) : null

/** Clean axis ticks from 0 up to at least `max` (4 steps of 1/2/2.5/5 × 10ⁿ). */
export function niceTicks(max: number, steps = 4): number[] {
  if (max <= 0) return [0]
  const raw = max / steps
  const mag = 10 ** Math.floor(Math.log10(raw))
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw)!
  return Array.from({ length: Math.ceil(max / step) + 1 }, (_, i) => i * step)
}
