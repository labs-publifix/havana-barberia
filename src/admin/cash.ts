import type { Appointment, AppointmentPayment, PaymentMethod } from '@/domain/types'

/**
 * Daily cash count from completed appointments and counter sales of products
 * (pure). Products can be sold in an appointment's ticket or at the counter;
 * both count as products. Amounts in whole MXN pesos.
 */

export const methodLabels: Record<PaymentMethod, string> = {
  cash: 'Efectivo',
  card: 'Tarjeta',
  transfer: 'Transferencia',
}

/** "Pagó en efectivo", "con tarjeta", "por transferencia". */
export const methodPhrases: Record<PaymentMethod, string> = {
  cash: 'en efectivo',
  card: 'con tarjeta',
  transfer: 'por transferencia',
}

export interface CashSummary {
  /** Charged by method (services + products, without tips); mixed payments count in each method. */
  charges: Record<PaymentMethod, number>
  /** Tips, by how they were paid. */
  tips: Record<PaymentMethod, number>
  /** Everything that came in by method (charges + tips): what should be in the drawer, terminal or bank. */
  inByMethod: Record<PaymentMethod, number>
  servicesTotal: number
  /** Products from appointment tickets plus counter sales. */
  productsTotal: number
  /** Pieces sold (tickets and counter). */
  productPieces: number
  tipsTotal: number
  total: number
  /** Completed appointments with a recorded payment. */
  paidCount: number
  /** Completed appointments without payment (recorded before payments existed). */
  unpaidCount: number
}

const zero = (): Record<PaymentMethod, number> => ({ cash: 0, card: 0, transfer: 0 })
const sum = (r: Record<PaymentMethod, number>) => r.cash + r.card + r.transfer

/** Products sold in an appointment's ticket. */
export const productsTotalOf = (p: AppointmentPayment) => (p.products ?? []).reduce((t, i) => t + i.price * i.qty, 0)

/** How the charge (services + products) was paid, by method. */
export function chargesByMethod(p: AppointmentPayment): Record<PaymentMethod, number> {
  const r = zero()
  if (p.splits?.length) for (const x of p.splits) r[x.method] += x.amount
  else r[p.method] += p.amount + productsTotalOf(p)
  return r
}

/** Counter sales of products (Ventas) can be added to the same count. */
export function cashSummary(
  appointments: Appointment[],
  sales: { method: PaymentMethod; total: number; items?: { qty: number }[] }[] = [],
): CashSummary {
  const charges = zero()
  const tips = zero()
  let paidCount = 0
  let unpaidCount = 0
  let servicesTotal = 0
  let productsTotal = 0
  let productPieces = 0
  for (const a of appointments) {
    if (a.status !== 'completed') continue
    if (!a.payment) {
      unpaidCount++
      continue
    }
    paidCount++
    const byMethod = chargesByMethod(a.payment)
    for (const m of ['cash', 'card', 'transfer'] as const) charges[m] += byMethod[m]
    servicesTotal += a.payment.amount
    productsTotal += productsTotalOf(a.payment)
    productPieces += (a.payment.products ?? []).reduce((t, i) => t + i.qty, 0)
    tips[a.payment.tipMethod] += a.payment.tip
  }
  for (const s of sales) {
    charges[s.method] += s.total
    productsTotal += s.total
    productPieces += (s.items ?? []).reduce((t, i) => t + i.qty, 0)
  }
  const inByMethod = {
    cash: charges.cash + tips.cash,
    card: charges.card + tips.card,
    transfer: charges.transfer + tips.transfer,
  }
  return {
    charges,
    tips,
    inByMethod,
    servicesTotal,
    productsTotal,
    productPieces,
    tipsTotal: sum(tips),
    total: sum(inByMethod),
    paidCount,
    unpaidCount,
  }
}

export interface ProductSold {
  at: string
  name: string
  qty: number
  /** Price × quantity. */
  total: number
  /** Customer of the appointment ticket, or null for a counter sale. */
  customer: string | null
}

/** Every product sold (appointment tickets and counter), oldest first. */
export function productsSold(
  appointments: Appointment[],
  sales: { at: string; items: { name: string; qty: number; price: number }[] }[] = [],
): ProductSold[] {
  return [
    ...appointments
      .filter((a) => a.status === 'completed' && a.payment)
      .flatMap((a) =>
        (a.payment!.products ?? []).map((i) => ({
          at: a.payment!.paidAt,
          name: i.name,
          qty: i.qty,
          total: i.price * i.qty,
          customer: a.customer.name,
        })),
      ),
    ...sales.flatMap((s) =>
      s.items.map((i) => ({ at: s.at, name: i.name, qty: i.qty, total: i.price * i.qty, customer: null })),
    ),
  ].sort((a, b) => a.at.localeCompare(b.at))
}
