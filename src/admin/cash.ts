import type { Appointment, PaymentMethod } from '@/domain/types'

/**
 * Daily cash count from completed appointments (pure; product sales join it in
 * the finance phase). Amounts in whole MXN pesos.
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
  /** Services charged, by payment method. */
  services: Record<PaymentMethod, number>
  /** Tips, by how they were paid. */
  tips: Record<PaymentMethod, number>
  /** Everything that came in by method (services + tips): what should be in the drawer, terminal or bank. */
  inByMethod: Record<PaymentMethod, number>
  servicesTotal: number
  tipsTotal: number
  total: number
  /** Completed appointments with a recorded payment. */
  paidCount: number
  /** Completed appointments without payment (recorded before payments existed). */
  unpaidCount: number
}

const zero = (): Record<PaymentMethod, number> => ({ cash: 0, card: 0, transfer: 0 })

export function cashSummary(appointments: Appointment[]): CashSummary {
  const services = zero()
  const tips = zero()
  let paidCount = 0
  let unpaidCount = 0
  for (const a of appointments) {
    if (a.status !== 'completed') continue
    if (!a.payment) {
      unpaidCount++
      continue
    }
    paidCount++
    services[a.payment.method] += a.payment.amount
    tips[a.payment.tipMethod] += a.payment.tip
  }
  const sum = (r: Record<PaymentMethod, number>) => r.cash + r.card + r.transfer
  const inByMethod = {
    cash: services.cash + tips.cash,
    card: services.card + tips.card,
    transfer: services.transfer + tips.transfer,
  }
  return {
    services,
    tips,
    inByMethod,
    servicesTotal: sum(services),
    tipsTotal: sum(tips),
    total: sum(inByMethod),
    paidCount,
    unpaidCount,
  }
}
