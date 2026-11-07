import { describe, expect, it } from 'vitest'
import { parseMoney, productMargin } from './products'

describe('product numbers', () => {
  it('margin is price minus cost minus commission', () => {
    expect(productMargin({ price: 240, cost: 90, commission: 30 })).toEqual({ amount: 120, pct: 50, complete: true })
  })

  it('missing cost or commission count as 0 and mark the margin as incomplete', () => {
    expect(productMargin({ price: 200, cost: null, commission: 20 })).toEqual({ amount: 180, pct: 90, complete: false })
    expect(productMargin({ price: 0, cost: null, commission: null })).toEqual({ amount: 0, pct: null, complete: false })
  })

  it('can be negative (selling below cost)', () => {
    expect(productMargin({ price: 100, cost: 90, commission: 20 })).toMatchObject({ amount: -10, pct: -10 })
  })

  it('reads amounts as typed; empty means not captured', () => {
    expect(parseMoney('$1,250')).toBe(1250)
    expect(parseMoney(' 240 ')).toBe(240)
    expect(parseMoney('')).toBeNull()
    expect(parseMoney('12.50')).toBeNaN()
    expect(parseMoney('-5')).toBeNaN()
  })
})
