import { describe, expect, it } from 'vitest'
import type { Appointment, AppointmentPayment } from '@/domain/types'
import { cashAlerts, cashDayStatus, cashSummary, closeBalanced, closeDifference, productsSold } from './cash'

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

describe('cashDayStatus', () => {
  const day = (date: string, extra: Partial<Parameters<typeof cashDayStatus>[0]> = {}) => ({
    date,
    appointments: [] as unknown[],
    sales: [] as unknown[],
    moves: [] as unknown[],
    close: null as { difference: number } | null,
    ...extra,
  })
  const today = '2026-11-17'

  it('flags a past day with activity and no close, and a close that did not match', () => {
    expect(cashDayStatus(day('2026-11-16', { appointments: [{}] }), today)).toBe('missing')
    expect(cashDayStatus(day('2026-11-16', { moves: [{}] }), today)).toBe('missing')
    expect(cashDayStatus(day('2026-11-16', { close: { difference: -50 } }), today)).toBe('mismatch')
    expect(cashDayStatus(day('2026-11-16', { close: { difference: 0 } }), today)).toBe('ok')
  })

  it('does not flag today, nor a day with nothing to close', () => {
    expect(cashDayStatus(day(today, { appointments: [{}] }), today)).toBe('open')
    expect(cashDayStatus(day('2026-11-15'), today)).toBe('idle')
  })

  it('lists only the days that need attention', () => {
    const days = [
      day('2026-11-14', { appointments: [{}] }),
      day('2026-11-15'),
      day('2026-11-16', { close: { difference: 20 } }),
      day(today, { sales: [{}] }),
    ]
    expect(cashAlerts(days, today).map((a) => [a.day.date, a.status])).toEqual([
      ['2026-11-14', 'missing'],
      ['2026-11-16', 'mismatch'],
    ])
  })
})

describe('closeBalanced / closeDifference', () => {
  it('a close only balances when cash, card and transfers all match', () => {
    expect(closeBalanced({ difference: 0, cardDifference: 0, transferDifference: 0 })).toBe(true)
    expect(closeBalanced({ difference: 0, cardDifference: 0, transferDifference: -50 })).toBe(false)
    // $50 extra in card and $50 missing in transfers: the total is 0, but it didn't match.
    expect(closeBalanced({ difference: 0, cardDifference: 50, transferDifference: -50 })).toBe(false)
    expect(closeDifference({ difference: -10, cardDifference: 20, transferDifference: -50 })).toBe(-40)
  })

  it('older closes (cash only) still read', () => {
    expect(closeBalanced({ difference: 0, cardDifference: null, transferDifference: null })).toBe(true)
    expect(closeDifference({ difference: -10, cardDifference: null, transferDifference: null })).toBe(-10)
    expect(
      cashDayStatus(
        { date: '2026-11-16', appointments: [], sales: [], moves: [], close: { difference: 0, transferDifference: -50 } },
        '2026-11-17',
      ),
    ).toBe('mismatch')
  })
})
