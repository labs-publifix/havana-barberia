import type { Appointment, ID, LocalDate, PaymentMethod, Staff } from '@/domain/types'
import { addDays, formatDay, localDate } from '@/lib/time'
import { weekStart } from './finance'

/**
 * Tips paid to barbers apart from the weekly payroll (pure). Same rules as the
 * database (supabase/migrations/20261123002600_tip_payouts.sql):
 * - Tips accumulate as pending per barber until the owner or manager pays them.
 * - Card tips over `over` pesos have `fee` kept for the terminal; smaller ones go in full.
 * - Paid with cash from the drawer, as a cash move in the barber's name. Not an expense.
 * - Tips on or after `separateFrom` no longer go in the weekly payroll.
 */

export interface TipRule {
  /** Pesos kept from a card tip. */
  fee: number
  /** Only when the card tip is greater than this. */
  over: number
}

export const tipFee = (tip: number, method: PaymentMethod, rule: TipRule) =>
  method === 'card' && tip > rule.over ? Math.min(rule.fee, tip) : 0

/** One appointment whose tip is still to be paid (negative: paid too much after a correction). */
export interface PendingTip {
  staffId: ID
  appointmentId: ID
  date: LocalDate
  customer: string
  method: PaymentMethod
  /** As the customer left it. */
  tip: number
  /** Card fee kept. */
  fee: number
  /** What the barber gets. */
  amount: number
}

export interface TipPayout {
  id: ID
  folio: number
  staffId: ID
  staffName: string
  /** The drawer's day the cash came out of. */
  date: LocalDate
  paidAt: string
  gross: number
  fee: number
  amount: number
  byMethod: Record<PaymentMethod, number>
  firstDate: LocalDate
  lastDate: LocalDate
  lines: Omit<PendingTip, 'staffId'>[]
  paidBy: string
  voided?: { at: string; by: string; reason: string }
}

export interface TipsOverview {
  rule: TipRule
  /** Tips from this date on are paid apart (null: not started). */
  separateFrom: LocalDate | null
  pending: PendingTip[]
}

/**
 * What is pending, from the appointments and the payouts made (the mock data
 * and tests use this; the database computes the same in `pending_tips()`).
 */
export function pendingTips(input: {
  appointments: Appointment[]
  payouts: TipPayout[]
  rule: TipRule
  separateFrom: LocalDate | null
  timeZone: string
}): PendingTip[] {
  const { separateFrom } = input
  if (!separateFrom) return []
  const paid = new Map<ID, { tip: number; amount: number }>()
  for (const p of input.payouts) {
    if (p.voided) continue
    for (const l of p.lines) {
      const x = paid.get(l.appointmentId) ?? { tip: 0, amount: 0 }
      x.tip += l.tip
      x.amount += l.amount
      paid.set(l.appointmentId, x)
    }
  }
  const out: PendingTip[] = []
  for (const a of input.appointments) {
    const date = localDate(a.startsAt, input.timeZone)
    if (date < separateFrom) continue
    const tip = a.payment?.tip ?? 0
    const method = a.payment?.tipMethod ?? 'cash'
    const before = paid.get(a.id) ?? { tip: 0, amount: 0 }
    if (tip === before.tip) continue
    const amount = tip - tipFee(tip, method, input.rule) - before.amount
    const pendingTip = tip - before.tip
    out.push({
      staffId: a.staffId,
      appointmentId: a.id,
      date,
      customer: a.customer.name,
      method,
      tip: pendingTip,
      fee: pendingTip - amount,
      amount,
    })
  }
  return out.sort((a, b) => a.staffId.localeCompare(b.staffId) || a.date.localeCompare(b.date))
}

export interface StaffTips {
  staffId: ID
  name: string
  tip: number
  fee: number
  amount: number
  /** Tips as left, by how the customer paid them. */
  byMethod: Record<PaymentMethod, number>
  lines: PendingTip[]
}

const zero = (): Record<PaymentMethod, number> => ({ cash: 0, card: 0, transfer: 0 })

/** Pending per barber (only barbers with something pending), in team order. */
export function tipsByStaff(pending: PendingTip[], staff: Pick<Staff, 'id' | 'name'>[]): StaffTips[] {
  const order = new Map(staff.map((s, i) => [s.id, i]))
  const map = new Map<ID, StaffTips>()
  for (const l of pending) {
    const s =
      map.get(l.staffId) ??
      ({
        staffId: l.staffId,
        name: staff.find((x) => x.id === l.staffId)?.name ?? 'Barbero',
        tip: 0,
        fee: 0,
        amount: 0,
        byMethod: zero(),
        lines: [],
      } satisfies StaffTips)
    s.tip += l.tip
    s.fee += l.fee
    s.amount += l.amount
    s.byMethod[l.method] += l.tip
    s.lines.push(l)
    map.set(l.staffId, s)
  }
  return [...map.values()]
    .filter((s) => s.amount !== 0)
    .sort((a, b) => (order.get(a.staffId) ?? 99) - (order.get(b.staffId) ?? 99))
}

/** The pending lines a payment takes (all of a barber's, or up to a date), as the database does. */
export function payoutFrom(
  staffTips: StaffTips,
  until?: LocalDate,
): Omit<TipPayout, 'id' | 'folio' | 'date' | 'paidAt' | 'paidBy' | 'staffName'> {
  const lines = staffTips.lines.filter((l) => !until || l.date <= until)
  const byMethod = zero()
  for (const l of lines) byMethod[l.method] += l.tip
  const dates = lines.map((l) => l.date).sort()
  return {
    staffId: staffTips.staffId,
    gross: lines.reduce((t, l) => t + l.tip, 0),
    fee: lines.reduce((t, l) => t + l.fee, 0),
    amount: lines.reduce((t, l) => t + l.amount, 0),
    byMethod,
    firstDate: dates[0] ?? '',
    lastDate: dates.at(-1) ?? '',
    lines: lines.map(({ staffId: _, ...l }) => l),
  }
}

export type TipGroup = 'week' | 'month'

export interface TipHistoryRow {
  /** First day of the week or month. */
  key: LocalDate
  label: string
  staffId: ID
  name: string
  payouts: number
  gross: number
  fee: number
  amount: number
}

/** What each barber took home in tips, by week or month (voided payouts don't count). */
export function tipHistory(payouts: TipPayout[], group: TipGroup, weekStartDay: number): TipHistoryRow[] {
  const map = new Map<string, TipHistoryRow>()
  for (const p of payouts) {
    if (p.voided) continue
    const key = group === 'week' ? weekStart(p.date, weekStartDay) : `${p.date.slice(0, 7)}-01`
    const label =
      group === 'week'
        ? `${formatDay(key, "d 'de' MMM")} – ${formatDay(addDays(key, 6), "d 'de' MMM")}`
        : capitalizeFirst(formatDay(key, "MMMM 'de' yyyy"))
    const id = `${key}|${p.staffId}`
    const row = map.get(id) ?? {
      key,
      label,
      staffId: p.staffId,
      name: p.staffName,
      payouts: 0,
      gross: 0,
      fee: 0,
      amount: 0,
    }
    row.payouts++
    row.gross += p.gross
    row.fee += p.fee
    row.amount += p.amount
    map.set(id, row)
  }
  return [...map.values()].sort((a, b) => b.key.localeCompare(a.key) || a.name.localeCompare(b.name))
}

const capitalizeFirst = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

/** CSV rows: one per payout, with its breakdown. */
export function tipPayoutsCsv(payouts: TipPayout[]): (string | number)[][] {
  return [
    [
      'Folio',
      'Fecha de pago',
      'Barbero',
      'Propinas del',
      'Al',
      'Efectivo',
      'Tarjeta',
      'Transferencia',
      'Propinas recibidas',
      'Descuento terminal',
      'Pagado',
      'Pagó',
      'Estado',
    ],
    ...payouts.map((p) => [
      p.folio,
      p.date,
      p.staffName,
      p.firstDate,
      p.lastDate,
      p.byMethod.cash,
      p.byMethod.card,
      p.byMethod.transfer,
      p.gross,
      p.fee,
      p.voided ? 0 : p.amount,
      p.paidBy,
      p.voided ? `Anulado: ${p.voided.reason}` : 'Pagado',
    ]),
  ]
}

/** CSV rows: the history grouped by week or month. */
export function tipHistoryCsv(rows: TipHistoryRow[], group: TipGroup): (string | number)[][] {
  return [
    [group === 'week' ? 'Semana' : 'Mes', 'Barbero', 'Pagos', 'Propinas recibidas', 'Descuento terminal', 'Pagado'],
    ...rows.map((r) => [r.label, r.name, r.payouts, r.gross, r.fee, r.amount]),
  ]
}
