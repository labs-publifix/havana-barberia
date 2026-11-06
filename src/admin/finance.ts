import type { Appointment, ID, LocalDate, Service, Staff, StaffCommission } from '@/domain/types'
import { addDays, formatDay, localDate, weekdayOf } from '@/lib/time'
import { commissionOn } from './team/model'

/**
 * Finance preview (phase 2, pure). Commissions, tips and the weekly payroll are
 * worked out from completed appointments and each barber's commission rule.
 * Amounts in whole MXN pesos. Real figures only ever live in the database.
 */

/** Monday of the week that contains `date` (the shop's week runs Monday to Sunday). */
export const weekStart = (date: LocalDate): LocalDate => addDays(date, -((weekdayOf(date) + 6) % 7))

/** "2 – 8 de noviembre" or "28 de oct – 3 de nov". */
export function weekLabel(from: LocalDate) {
  const to = addDays(from, 6)
  return from.slice(5, 7) === to.slice(5, 7)
    ? `${formatDay(from, 'd')} – ${formatDay(to, "d 'de' MMMM")}`
    : `${formatDay(from, "d 'de' MMM")} – ${formatDay(to, "d 'de' MMM")}`
}

/** A product sale at the counter (phase-2 preview). */
export interface ProductSale {
  id: ID
  at: string
  items: { productId: ID; name: string; qty: number; price: number; commission: number | null }[]
  /** Barber who sold it (earns the product commission), or null. */
  staffId: ID | null
  method: 'cash' | 'card' | 'transfer'
  total: number
}

export interface EarningLine {
  appointmentId: ID
  date: LocalDate
  customer: string
  services: { id: ID; name: string; price: number; commission: number | null }[]
  price: number
  tip: number
}

export interface BarberEarnings {
  staffId: ID
  name: string
  lines: EarningLine[]
  services: number
  sales: number
  /** Sum of the commissions that are captured (services and products sold). */
  commission: number
  /** Product units sold. */
  products: number
  /** Services done with no commission captured (rule empty for them). */
  missing: number
  tips: number
  /** Advances (anticipos) given during the week. */
  advances: number
  /** commission + tips − advances. */
  pay: number
}

export interface Advance {
  id: ID
  staffId: ID
  date: LocalDate
  amount: number
  note: string
}

/** Each barber's completed work between `from` and `to` (local dates, inclusive). */
export function earnings(input: {
  appointments: Appointment[]
  services: Service[]
  staff: Staff[]
  commissions: StaffCommission[]
  advances?: Advance[]
  sales?: ProductSale[]
  from: LocalDate
  to: LocalDate
  timeZone: string
}): BarberEarnings[] {
  const { from, to, timeZone } = input
  const inRange = (d: LocalDate) => d >= from && d <= to
  return input.staff.map((s) => {
    const rule = input.commissions.find((c) => c.staffId === s.id)
    const lines: EarningLine[] = input.appointments
      .filter((a) => a.staffId === s.id && a.status === 'completed' && inRange(localDate(a.startsAt, timeZone)))
      .sort((a, b) => a.startsAt.localeCompare(b.startsAt))
      .map((a) => {
        const services = a.serviceIds.map((id) => {
          const svc = input.services.find((x) => x.id === id)
          const price = svc?.price ?? 0
          return { id, name: svc?.name ?? 'Servicio', price, commission: commissionOn({ id, price }, rule) }
        })
        return {
          appointmentId: a.id,
          date: localDate(a.startsAt, timeZone),
          customer: a.customer.name,
          services,
          price: a.payment?.amount ?? a.totalPrice,
          tip: a.payment?.tip ?? 0,
        }
      })
    const all = lines.flatMap((l) => l.services)
    const commission = all.reduce((t, x) => t + (x.commission ?? 0), 0)
    const tips = lines.reduce((t, l) => t + l.tip, 0)
    const sold = (input.sales ?? [])
      .filter((x) => x.staffId === s.id && inRange(localDate(x.at, timeZone)))
      .flatMap((x) => x.items)
    const productCommission = sold.reduce((t, i) => t + (i.commission ?? 0) * i.qty, 0)
    const advances = (input.advances ?? [])
      .filter((x) => x.staffId === s.id && inRange(x.date))
      .reduce((t, x) => t + x.amount, 0)
    return {
      staffId: s.id,
      name: s.name,
      lines,
      services: all.length,
      sales: lines.reduce((t, l) => t + l.price, 0),
      commission: commission + productCommission,
      products: sold.reduce((t, i) => t + i.qty, 0),
      missing: all.filter((x) => x.commission === null).length,
      tips,
      advances,
      pay: commission + productCommission + tips - advances,
    }
  })
}

/** Day-by-day totals for a chart: sales and completed appointments per local date. */
export function dailySales(appointments: Appointment[], from: LocalDate, to: LocalDate, timeZone: string) {
  const days: { date: LocalDate; sales: number; count: number }[] = []
  for (let d = from; d <= to; d = addDays(d, 1)) days.push({ date: d, sales: 0, count: 0 })
  const byDate = new Map(days.map((x) => [x.date, x]))
  for (const a of appointments) {
    if (a.status !== 'completed') continue
    const day = byDate.get(localDate(a.startsAt, timeZone))
    if (!day) continue
    day.sales += a.payment?.amount ?? a.totalPrice
    day.count++
  }
  return days
}
