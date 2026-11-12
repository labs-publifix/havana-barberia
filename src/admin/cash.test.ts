import { describe, expect, it } from 'vitest'
import type { Appointment, AppointmentPayment } from '@/domain/types'
import { cashSummary, productsSold } from './cash'

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

  it('a product sold in the appointment ticket counts as a product, with its customer', () => {
    const ticket = {
      ...appt('completed', {
        method: 'cash',
        amount: 280,
        paidAt: '2026-11-12T01:30:00Z',
        products: [{ productId: 'pomada', name: 'Pomada Fijación Media', qty: 1, price: 390, commission: null }],
      }),
      customer: { name: 'Mathias', phone: '', email: '' },
    } as Appointment
    const counter = {
      at: '2026-11-11T20:00:00Z',
      method: 'card' as const,
      total: 580,
      items: [{ name: 'Aceite de barba', qty: 2, price: 290 }],
    }
    const s = cashSummary([ticket], [counter])
    expect(s).toMatchObject({ servicesTotal: 280, productsTotal: 970, productPieces: 3 })
    expect(s.charges).toEqual({ cash: 670, card: 580, transfer: 0 })
    expect(productsSold([ticket], [counter])).toEqual([
      { at: counter.at, name: 'Aceite de barba', qty: 2, total: 580, customer: null },
      { at: '2026-11-12T01:30:00Z', name: 'Pomada Fijación Media', qty: 1, total: 390, customer: 'Mathias' },
    ])
  })
})
