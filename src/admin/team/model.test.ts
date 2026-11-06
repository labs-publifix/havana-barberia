import { describe, expect, it } from 'vitest'
import type { StaffCommission } from '@/domain/types'
import { commissionLabel, commissionOn } from './model'

const corte = { id: 'corte', price: 280 }
const barba = { id: 'barba', price: 530 }

describe('barber commission', () => {
  it('percent of the service price, rounded to pesos', () => {
    const c: StaffCommission = { staffId: 'x', mode: 'percent', value: 40, overrides: {} }
    expect(commissionOn(corte, c)).toBe(112)
    expect(commissionOn(barba, c)).toBe(212)
    expect(commissionLabel(c)).toBe('40% por servicio')
  })

  it('fixed amount per service, with per-service overrides', () => {
    const c: StaffCommission = { staffId: 'x', mode: 'fixed', value: 100, overrides: { barba: 180 } }
    expect(commissionOn(corte, c)).toBe(100)
    expect(commissionOn(barba, c)).toBe(180)
    expect(commissionLabel(c)).toBe('$100 por servicio · 1 personalizado')
  })

  it('nothing captured yet', () => {
    const c: StaffCommission = { staffId: 'x', mode: 'percent', value: null, overrides: {} }
    expect(commissionOn(corte, c)).toBeNull()
    expect(commissionOn(corte, undefined)).toBeNull()
    expect(commissionLabel(c)).toBe('Sin capturar')
    // An override still applies even without a general rule.
    expect(commissionOn(barba, { ...c, overrides: { barba: 30 } })).toBe(159)
  })
})
