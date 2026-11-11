import { describe, expect, it } from 'vitest'
import type { Appointment, Service, Staff } from '@/domain/types'
import type { PayrollClose, ProductSale } from './finance'
import { profitReport, type Expense, type ProfitInput } from './profit'

const tz = 'America/Mexico_City'
const week = Array.from({ length: 7 }, () => [{ start: '10:00', end: '20:00' }])
const services: Service[] = [
  { id: 'corte', categoryId: 'cortes', name: 'Corte', description: '', durationMin: 45, price: 280, active: true, order: 1 },
  { id: 'barba', categoryId: 'barba', name: 'Barba', description: '', durationMin: 30, price: 220, active: true, order: 2 },
] as Service[]
const staff: Staff[] = [
  { id: 'leo', name: 'Leonardo', role: 'barber', photoUrl: null, active: true, order: 1, serviceIds: 'all', schedule: week },
]

const appt = (id: string, day: string, serviceIds: string[], payment: Appointment['payment']): Appointment => ({
  id,
  token: id,
  customerId: 'c',
  customer: { name: 'Cliente', phone: '', email: '' },
  staffId: 'leo',
  serviceIds,
  startsAt: `${day}T18:00:00.000Z`,
  endsAt: `${day}T19:00:00.000Z`,
  durationMin: 60,
  totalPrice: 0,
  status: 'completed',
  notes: '',
  createdAt: '',
  loyaltyToken: null,
  payment,
})

const base = (extra: Partial<ProfitInput> = {}): ProfitInput => ({
  appointments: [
    // Corte + barba in cash with a $50 card tip and a wax ($150, cost $60, commission $20).
    appt('a1', '2026-11-03', ['corte', 'barba'], {
      method: 'cash',
      amount: 500,
      tip: 50,
      tipMethod: 'card',
      paidAt: '2026-11-03T19:00:00.000Z',
      products: [{ productId: 'cera', name: 'Cera', qty: 1, price: 150, commission: 20 }],
    }),
    // Corte by card.
    appt('a2', '2026-11-04', ['corte'], { method: 'card', amount: 280, tip: 0, tipMethod: 'cash', paidAt: '2026-11-04T19:00:00.000Z' }),
    // Outside the period.
    appt('a3', '2026-10-20', ['corte'], { method: 'cash', amount: 280, tip: 0, tipMethod: 'cash', paidAt: '2026-10-20T19:00:00.000Z' }),
  ],
  sales: [
    {
      id: 's1',
      at: '2026-11-05T18:00:00.000Z',
      staffId: 'leo',
      method: 'card',
      total: 300,
      items: [{ productId: 'cera', name: 'Cera', qty: 2, price: 150, commission: 20 }],
    } as ProductSale,
  ],
  services,
  staff,
  products: [{ id: 'cera', name: 'Cera', cost: 60 }],
  commissions: [{ staffId: 'leo', mode: 'percent', value: 50, overrides: {} }],
  cardFeePercent: 3,
  expenses: [
    { id: 'e1', date: '2026-11-02', category: 'renta', concept: 'Renta', amount: 1000, method: 'transfer', cashMoveId: null, by: 'Leo' },
    { id: 'e2', date: '2026-10-01', category: 'otros', concept: 'Fuera', amount: 999, method: 'cash', cashMoveId: null, by: 'Leo' },
  ] as Expense[],
  payrollCloses: [],
  weekStartDay: 1,
  from: '2026-11-02',
  to: '2026-11-08',
  timeZone: tz,
  ...extra,
})

describe('utilidades', () => {
  it('income, commissions, expenses and net for the period', () => {
    const r = profitReport(base())
    // Services 500 + 280; products 150 (ticket) + 300 (counter).
    expect(r.services).toMatchObject({ amount: 780, count: 3, commission: 390 })
    expect(r.products).toMatchObject({ amount: 450, units: 3, commission: 60, cost: 180, missingCost: 0 })
    expect(r.gross).toBe(1230)
    expect(r.tips).toBe(50)
    // Card: 280 (a2) + 50 (card tip) + 300 (counter) = 630 → 3 % = 19.
    expect(r.expenses).toMatchObject({ registered: 1000, terminal: 19, productCost: 180, total: 1199 })
    expect(r.commissions).toBe(450)
    expect(r.net).toBe(1230 - 450 - 1199)
    expect(r.margin).toBe(Math.round(((1230 - 450 - 1199) / 1230) * 100))
  })

  it('what sold most: services and products ranked', () => {
    const r = profitReport(base())
    expect(r.topServices.map((s) => [s.id, s.count])).toEqual([
      ['corte', 2],
      ['barba', 1],
    ])
    expect(r.topProducts[0]).toMatchObject({ id: 'cera', count: 3, amount: 450 })
    expect(r.barbers[0]).toMatchObject({ staffId: 'leo', services: 780, products: 450, commission: 450 })
  })

  it('bonuses come from closed payroll weeks; open weeks are flagged', () => {
    const closed = {
      weekStart: '2026-11-02',
      weekEnd: '2026-11-08',
      closedAt: '',
      closedBy: 'Leo',
      paid: {},
      rows: [{ bonusTotal: 200 }],
    } as unknown as PayrollClose
    expect(profitReport(base()).openWeeks).toBe(1)
    const r = profitReport(base({ payrollCloses: [closed] }))
    expect(r.bonuses).toBe(200)
    expect(r.commissions).toBe(650)
    expect(r.openWeeks).toBe(0)
  })

  it('missing costs and commissions are reported, not guessed', () => {
    const r = profitReport(base({ products: [{ id: 'cera', name: 'Cera', cost: null }], commissions: [] }))
    expect(r.products).toMatchObject({ cost: 0, missingCost: 3 })
    expect(r.missingCommissions).toBe(3)
  })

  it('free cut and discounts lower the income from services', () => {
    const r = profitReport(
      base({
        appointments: [
          appt('a4', '2026-11-03', ['corte', 'barba'], {
            method: 'cash',
            amount: 220,
            tip: 0,
            tipMethod: 'cash',
            paidAt: '2026-11-03T19:00:00.000Z',
            rewardServiceId: 'corte',
            rewardAmount: 280,
          }),
        ],
        sales: [],
      }),
    )
    expect(r.services.amount).toBe(220)
    expect(r.topServices.find((s) => s.id === 'corte')?.amount).toBe(0)
  })
})
