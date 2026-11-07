import { describe, expect, it } from 'vitest'
import type { Appointment, AppointmentPayment } from '@/domain/types'
import { cashSummary } from './cash'

let n = 0
const appt = (status: Appointment['status'], payment?: Partial<AppointmentPayment>): Appointment =>
  ({
    id: `a${++n}`,
    status,
    totalPrice: payment?.amount ?? 280,
    payment: payment
      ? { method: 'cash', amount: 280, tip: 0, tipMethod: 'cash', paidAt: '2026-11-06T18:00:00Z', ...payment }
      : undefined,
  }) as Appointment

describe('cashSummary', () => {
  it('adds services by method and tips by how they were paid', () => {
    const s = cashSummary([
      appt('completed', { method: 'cash', amount: 280 }),
      appt('completed', { method: 'card', amount: 500, tip: 50, tipMethod: 'card' }),
      appt('completed', { method: 'card', amount: 280, tip: 30, tipMethod: 'cash' }),
      appt('completed', { method: 'transfer', amount: 430 }),
    ])
    expect(s.charges).toEqual({ cash: 280, card: 780, transfer: 430 })
    expect(s.tips).toEqual({ cash: 30, card: 50, transfer: 0 })
    expect(s.inByMethod).toEqual({ cash: 310, card: 830, transfer: 430 })
    expect(s).toMatchObject({ servicesTotal: 1490, tipsTotal: 80, total: 1570, paidCount: 4, unpaidCount: 0 })
  })

  it('ignores appointments that were not completed and counts completed ones without payment apart', () => {
    const s = cashSummary([appt('confirmed'), appt('no_show'), appt('cancelled'), appt('completed')])
    expect(s).toMatchObject({ total: 0, paidCount: 0, unpaidCount: 1 })
  })

  it('splits mixed payments and adds products and counter sales', () => {
    const s = cashSummary(
      [
        appt('completed', {
          method: 'card',
          amount: 500,
          products: [{ productId: 'p', name: 'Cera', qty: 2, price: 150, commission: null }],
          splits: [
            { method: 'cash', amount: 300 },
            { method: 'card', amount: 500 },
          ],
        }),
      ],
      [{ method: 'transfer', total: 260 }],
    )
    expect(s.charges).toEqual({ cash: 300, card: 500, transfer: 260 })
    expect(s).toMatchObject({ servicesTotal: 500, productsTotal: 560, total: 1060 })
  })
})
