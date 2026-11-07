import type { Appointment, ID, LocalDate, Service, Staff, StaffCommission } from '@/domain/types'
import { addDays, formatDay, localDate, weekdayOf } from '@/lib/time'
import { commissionOn } from './team/model'

/**
 * Finance preview (phase 2, pure). Commissions, tips and the weekly payroll are
 * worked out from completed appointments and each barber's commission rule.
 * Amounts in whole MXN pesos. Real figures only ever live in the database.
 */

/** First day of the payroll week that contains `date` (startDay: 0 = Sunday … 6; Monday by default). */
export const weekStart = (date: LocalDate, startDay = 1): LocalDate =>
  addDays(date, -((weekdayOf(date) - startDay + 7) % 7))

/**
 * Fixed-amount bonuses the shop configures. "manual" ones (punctuality,
 * attendance) are marked per barber and week in the payroll; "services" and
 * "products" are earned automatically when the barber reaches the threshold.
 */
export interface BonusRule {
  id: ID
  name: string
  kind: 'manual' | 'services' | 'products'
  /** Services or product units needed in the week (automatic kinds). */
  threshold: number | null
  /** Whole pesos; null until the shop captures it. */
  amount: number | null
  active: boolean
}

/** Finance settings (Ajustes › Finanzas). */
export interface FinanceSettings {
  /** Day the payroll week starts (0 = Sunday … 6 = Saturday). */
  weekStartDay: number
  /** Card terminal fee in percent (absorbed by the shop, never by the barber); null until captured. */
  cardFeePercent: number | null
  bonuses: BonusRule[]
  /** Commission with a discount: on the list price (the shop absorbs it) or on the price charged. */
  discountCommission: 'list' | 'net'
}

/** A manual bonus marked for a barber in a payroll week. */
export interface BonusAward {
  weekStart: LocalDate
  staffId: ID
  bonusId: ID
}

export const defaultFinanceSettings = (): FinanceSettings => ({
  weekStartDay: 1,
  cardFeePercent: null,
  discountCommission: 'list',
  // Amounts are captured by the shop (never real figures in this public repository).
  bonuses: [
    { id: 'puntualidad', name: 'Puntualidad', kind: 'manual', threshold: null, amount: null, active: true },
    { id: 'asistencia', name: 'Asistencia completa', kind: 'manual', threshold: null, amount: null, active: true },
    { id: 'meta-servicios', name: 'Meta de servicios', kind: 'services', threshold: null, amount: null, active: true },
    {
      id: 'venta-productos',
      name: 'Venta de productos',
      kind: 'products',
      threshold: null,
      amount: null,
      active: true,
    },
  ],
})

/** First problem with the finance settings, as a message to show; null when valid. */
export function financeSettingsError(f: FinanceSettings): string | null {
  if (!Number.isInteger(f.weekStartDay) || f.weekStartDay < 0 || f.weekStartDay > 6)
    return 'Elige el día de inicio de la semana.'
  if (f.cardFeePercent !== null && !(f.cardFeePercent >= 0 && f.cardFeePercent <= 10))
    return 'La comisión de la terminal va de 0 a 10 %.'
  const names = new Set<string>()
  for (const b of f.bonuses) {
    const name = b.name.trim()
    if (!name) return 'Cada bono necesita un nombre.'
    if (names.has(name.toLowerCase())) return `Hay dos bonos llamados «${name}».`
    names.add(name.toLowerCase())
    if (b.amount !== null && (!Number.isInteger(b.amount) || b.amount < 0 || b.amount > 100000))
      return `Escribe el monto de «${name}» en pesos, sin centavos.`
    if (
      b.kind !== 'manual' &&
      b.threshold !== null &&
      (!Number.isInteger(b.threshold) || b.threshold < 1 || b.threshold > 999)
    )
      return `Revisa la meta de «${name}».`
  }
  return null
}

/** Card fee on an amount, rounded to whole pesos (0 when the fee is not captured). */
export const cardFee = (amount: number, percent: number | null) => (percent ? Math.round((amount * percent) / 100) : 0)

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
  /** Bonuses earned this week (fixed amounts). */
  bonuses: { id: ID; name: string; amount: number }[]
  bonusTotal: number
  /** commission + tips + bonuses − advances. */
  pay: number
}

export interface Advance {
  id: ID
  staffId: ID
  date: LocalDate
  amount: number
  note: string
}

/** A commission rule in force from a date (changes never rewrite past weeks). */
export interface CommissionVersion extends StaffCommission {
  validFrom: LocalDate
}

/** Each barber's completed work between `from` and `to` (local dates, inclusive). */
export function earnings(input: {
  appointments: Appointment[]
  services: Service[]
  staff: Staff[]
  commissions: StaffCommission[]
  advances?: Advance[]
  sales?: ProductSale[]
  bonusRules?: BonusRule[]
  bonusAwards?: BonusAward[]
  /** 'list' (default): commission on the list price, the shop absorbs discounts; 'net': on the price charged. */
  discountCommission?: 'list' | 'net'
  /** Commission rules over time; the one in force on each appointment's date applies. */
  commissionHistory?: CommissionVersion[]
  from: LocalDate
  to: LocalDate
  timeZone: string
}): BarberEarnings[] {
  const { from, to, timeZone } = input
  const inRange = (d: LocalDate) => d >= from && d <= to
  const ruleAt = (staffId: ID, date: LocalDate) => {
    const versions = (input.commissionHistory ?? [])
      .filter((v) => v.staffId === staffId && v.validFrom <= date)
      .sort((x, y) => y.validFrom.localeCompare(x.validFrom))
    return versions[0] ?? input.commissions.find((c) => c.staffId === staffId)
  }
  return input.staff.map((s) => {
    const lines: EarningLine[] = input.appointments
      .filter((a) => a.staffId === s.id && a.status === 'completed' && inRange(localDate(a.startsAt, timeZone)))
      .sort((a, b) => a.startsAt.localeCompare(b.startsAt))
      .map((a) => {
        const p = a.payment
        // With a discount, commissions follow the setting: list price (the shop absorbs it) or the price charged.
        const listTotal = a.serviceIds.reduce((t, id) => t + (input.services.find((x) => x.id === id)?.price ?? 0), 0)
        const factor =
          p?.discount && input.discountCommission === 'net' && listTotal > 0
            ? Math.max(0, 1 - p.discount.amount / (listTotal - (p.rewardAmount ?? 0) || 1))
            : 1
        const services = a.serviceIds.map((id) => {
          const svc = input.services.find((x) => x.id === id)
          const list = svc?.price ?? 0
          // The loyalty free cut is not charged and pays no commission; on a combo only the haircut part is free.
          const free = p?.rewardServiceId === id ? (p.rewardAmount ?? list) : 0
          const price = list - free
          const name = free
            ? `${svc?.name ?? 'Servicio'} (corte gratis${price ? ' aplicado' : ''})`
            : (svc?.name ?? 'Servicio')
          const c = price > 0 ? commissionOn({ id, price }, ruleAt(s.id, localDate(a.startsAt, timeZone))) : 0
          return { id, name, price, commission: c === null ? null : Math.round(c * factor) }
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
    // Products: counter sales by this barber plus products sold in their appointments' tickets.
    const sold = [
      ...(input.sales ?? [])
        .filter((x) => x.staffId === s.id && inRange(localDate(x.at, timeZone)))
        .flatMap((x) => x.items),
      ...input.appointments
        .filter((a) => a.staffId === s.id && a.status === 'completed' && inRange(localDate(a.startsAt, timeZone)))
        .flatMap((a) => a.payment?.products ?? []),
    ]
    const productCommission = sold.reduce((t, i) => t + (i.commission ?? 0) * i.qty, 0)
    const advances = (input.advances ?? [])
      .filter((x) => x.staffId === s.id && inRange(x.date))
      .reduce((t, x) => t + x.amount, 0)
    const count = { services: all.length, products: sold.reduce((t, i) => t + i.qty, 0) }
    const bonuses = (input.bonusRules ?? [])
      .filter((b) => b.active && b.amount)
      .filter((b) =>
        b.kind === 'manual'
          ? (input.bonusAwards ?? []).some((w) => w.staffId === s.id && w.bonusId === b.id && w.weekStart === from)
          : b.threshold !== null && count[b.kind] >= b.threshold,
      )
      .map((b) => ({ id: b.id, name: b.name, amount: b.amount! }))
    const bonusTotal = bonuses.reduce((t, b) => t + b.amount, 0)
    return {
      staffId: s.id,
      name: s.name,
      lines,
      services: all.length,
      sales: lines.reduce((t, l) => t + l.price, 0),
      commission: commission + productCommission,
      products: count.products,
      missing: all.filter((x) => x.commission === null).length,
      tips,
      advances,
      bonuses,
      bonusTotal,
      pay: commission + productCommission + tips + bonusTotal - advances,
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

/** Money taken out of (or put into) the drawer during the day. */
export interface CashMove {
  id: ID
  date: LocalDate
  at: string
  kind: 'out' | 'in'
  amount: number
  concept: string
  by: string
}

/** The day's cash count (arqueo), saved when the drawer is closed. */
export interface DailyClose {
  date: LocalDate
  openingFund: number
  expected: number
  counted: number
  /** counted − expected: positive is extra cash, negative is missing cash. */
  difference: number
  note: string
  closedBy: string
  closedAt: string
}

/** Cash that should be in the drawer: opening fund + cash charges + cash tips + cash in − cash out. */
export function expectedCash(input: {
  openingFund: number
  cashCharges: number
  cashTips: number
  moves: Pick<CashMove, 'kind' | 'amount'>[]
}) {
  const ins = input.moves.filter((m) => m.kind === 'in').reduce((t, m) => t + m.amount, 0)
  const outs = input.moves.filter((m) => m.kind === 'out').reduce((t, m) => t + m.amount, 0)
  return { ins, outs, expected: input.openingFund + input.cashCharges + input.cashTips + ins - outs }
}
