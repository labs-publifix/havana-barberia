import { describe, expect, it } from 'vitest'
import { createSeed } from '@/data/mock/seed'
import type { Appointment, StaffCommission } from '@/domain/types'
import { zonedInstant } from '@/lib/time'
import {
  cardFee,
  dailySales,
  defaultFinanceSettings,
  earnings,
  financeSettingsError,
  weekLabel,
  weekStart,
} from './finance'

const TZ = 'America/Mexico_City'
const seed = createSeed(zonedInstant('2026-11-01', '09:00', TZ))
const at = (date: string, time: string) => zonedInstant(date, time, TZ).toISOString()

const appt = (
  id: string,
  staffId: string,
  date: string,
  serviceIds: string[],
  tip = 0,
  status = 'completed',
): Appointment =>
  ({
    id,
    token: id,
    customerId: 'c1',
    customer: { name: 'Ana Ríos', phone: '', email: '' },
    staffId,
    serviceIds,
    startsAt: at(date, '11:00'),
    endsAt: at(date, '12:00'),
    durationMin: 60,
    totalPrice: 0,
    status,
    notes: '',
    createdAt: at(date, '09:00'),
    loyaltyToken: null,
    payment: { method: 'cash', amount: 280, tip, tipMethod: 'cash', paidAt: at(date, '12:00') },
  }) as Appointment

describe('finance', () => {
  it('weeks run Monday to Sunday', () => {
    expect(weekStart('2026-11-05')).toBe('2026-11-02')
    expect(weekStart('2026-11-08')).toBe('2026-11-02')
    expect(weekStart('2026-11-02')).toBe('2026-11-02')
    expect(weekLabel('2026-11-02')).toBe('2 – 8 de noviembre')
    expect(weekLabel('2026-10-26')).toBe('26 de oct – 1 de nov')
  })

  it('adds commissions per service, tips and advances; flags services with no rule', () => {
    const commissions: StaffCommission[] = [
      { staffId: 'leonardo', mode: 'percent', value: 40, overrides: { 'barba-premium': 50 } },
      { staffId: 'isaac', mode: 'percent', value: null, overrides: {} },
    ]
    const rows = earnings({
      appointments: [
        appt('a', 'leonardo', '2026-11-02', ['corte-adulto'], 50),
        appt('b', 'leonardo', '2026-11-03', ['barba-premium']),
        appt('c', 'leonardo', '2026-11-03', ['corte-adulto'], 0, 'no_show'),
        appt('d', 'leonardo', '2026-11-09', ['corte-adulto']),
        appt('e', 'isaac', '2026-11-04', ['corte-adulto']),
      ],
      services: seed.services,
      staff: seed.staff,
      commissions,
      advances: [{ id: 'x', staffId: 'leonardo', date: '2026-11-04', amount: 100, note: '' }],
      from: '2026-11-02',
      to: '2026-11-08',
      timeZone: TZ,
    })
    const leo = rows.find((r) => r.staffId === 'leonardo')!
    // Corte $280 × 40% = $112; barba premium $530 × 50% = $265.
    expect(leo).toMatchObject({ services: 2, commission: 377, tips: 50, advances: 100, pay: 327, missing: 0 })
    expect(rows.find((r) => r.staffId === 'isaac')).toMatchObject({ services: 1, commission: 0, missing: 1 })
  })

  it('totals sales per day', () => {
    const days = dailySales([appt('a', 'isaac', '2026-11-02', ['corte-adulto'])], '2026-11-02', '2026-11-04', TZ)
    expect(days.map((d) => [d.date, d.sales, d.count])).toEqual([
      ['2026-11-02', 280, 1],
      ['2026-11-03', 0, 0],
      ['2026-11-04', 0, 0],
    ])
  })

  it('starts the week on the configured day', () => {
    expect(weekStart('2026-11-05', 0)).toBe('2026-11-01')
    expect(weekStart('2026-11-05', 4)).toBe('2026-11-05')
    expect(weekStart('2026-11-04', 4)).toBe('2026-10-29')
  })

  it('adds fixed bonuses (marked or reached) and never pays commission on the free cut', () => {
    const bonusRules = defaultFinanceSettings().bonuses.map((b) => ({
      ...b,
      amount: 100,
      threshold: b.kind === 'services' ? 2 : 5,
    }))
    const free = appt('f', 'leonardo', '2026-11-04', ['corte-adulto'])
    free.payment = { ...free.payment!, amount: 0, rewardServiceId: 'corte-adulto' }
    const [leo] = earnings({
      appointments: [appt('a', 'leonardo', '2026-11-02', ['corte-adulto']), free],
      services: seed.services,
      staff: seed.staff.filter((s) => s.id === 'leonardo'),
      commissions: [{ staffId: 'leonardo', mode: 'percent', value: 40, overrides: {} }],
      bonusRules,
      bonusAwards: [{ weekStart: '2026-11-02', staffId: 'leonardo', bonusId: 'puntualidad' }],
      from: '2026-11-02',
      to: '2026-11-08',
      timeZone: TZ,
    })
    expect(leo!.commission).toBe(112)
    expect(leo!.lines[1]!.services[0]).toMatchObject({ price: 0, commission: 0 })
    expect(leo!.bonuses.map((b) => b.id)).toEqual(['puntualidad', 'meta-servicios'])
    expect(leo!.pay).toBe(112 + 200)
  })

  it('validates finance settings and computes the card fee', () => {
    expect(financeSettingsError(defaultFinanceSettings())).toBeNull()
    expect(financeSettingsError({ ...defaultFinanceSettings(), cardFeePercent: 12 })).toMatch(/0 a 10/)
    const dup = defaultFinanceSettings()
    dup.bonuses[1]!.name = 'puntualidad'
    expect(financeSettingsError(dup)).toMatch(/dos bonos/)
    expect(cardFee(1000, 3.5)).toBe(35)
    expect(cardFee(1000, null)).toBe(0)
  })
})
