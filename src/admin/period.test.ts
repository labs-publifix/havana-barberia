import { describe, expect, it } from 'vitest'
import {
  comparisonLabel,
  customRange,
  periodAt,
  periodFromParams,
  periodLabel,
  periodToParams,
  previousPeriod,
  shiftPeriod,
} from './period'

const TODAY = '2026-11-11' // Wednesday

describe('periods', () => {
  it('day, payroll week and month containing a date', () => {
    expect(periodAt('day', TODAY, 1)).toEqual({ unit: 'day', from: TODAY, to: TODAY })
    expect(periodAt('week', TODAY, 1)).toEqual({ unit: 'week', from: '2026-11-09', to: '2026-11-15' })
    expect(periodAt('week', TODAY, 3)).toEqual({ unit: 'week', from: '2026-11-11', to: '2026-11-17' })
    expect(periodAt('month', TODAY, 1)).toEqual({ unit: 'month', from: '2026-11-01', to: '2026-11-30' })
    expect(periodAt('month', '2026-02-10', 1).to).toBe('2026-02-28')
  })

  it('arrows move by the unit; a custom range by its length', () => {
    expect(shiftPeriod(periodAt('week', TODAY, 1), -1, 1)).toMatchObject({ from: '2026-11-02', to: '2026-11-08' })
    expect(shiftPeriod(periodAt('month', TODAY, 1), -1, 1)).toMatchObject({ from: '2026-10-01', to: '2026-10-31' })
    expect(shiftPeriod(periodAt('month', '2026-12-05', 1), 1, 1)).toMatchObject({ from: '2027-01-01' })
    expect(shiftPeriod({ unit: 'range', from: '2026-11-01', to: '2026-11-10' }, -1, 1)).toEqual({
      unit: 'range',
      from: '2026-10-22',
      to: '2026-10-31',
    })
  })

  it('compares a running period with the same days of the one before', () => {
    const month = periodAt('month', TODAY, 1)
    expect(previousPeriod(month, TODAY, 1)).toMatchObject({ from: '2026-10-01', to: '2026-10-11' })
    expect(comparisonLabel(month, previousPeriod(month, TODAY, 1), TODAY)).toBe('octubre (mismos días)')
    const past = periodAt('month', '2026-10-15', 1)
    expect(previousPeriod(past, TODAY, 1)).toMatchObject({ from: '2026-09-01', to: '2026-09-30' })
    const range = { unit: 'range' as const, from: '2026-11-01', to: '2026-11-10' }
    expect(comparisonLabel(range, previousPeriod(range, TODAY, 1), TODAY)).toBe('los 10 días anteriores')
  })

  it('a custom range stays valid', () => {
    expect(customRange('2026-11-20', '2026-11-25', TODAY, 'from')).toMatchObject({ from: TODAY, to: TODAY })
    expect(customRange('2026-11-10', '2026-11-05', TODAY, 'from')).toMatchObject({
      from: '2026-11-10',
      to: '2026-11-10',
    })
    expect(customRange('2026-11-10', '2026-11-05', TODAY, 'to')).toMatchObject({ from: '2026-11-05', to: '2026-11-05' })
    expect(customRange('2024-01-01', TODAY, TODAY, 'to').from).toBe('2025-11-11')
  })

  it('labels', () => {
    expect(periodLabel(periodAt('day', TODAY, 1))).toBe('Miércoles 11 de noviembre')
    expect(periodLabel(periodAt('week', TODAY, 1))).toBe('9 – 15 de noviembre')
    expect(periodLabel(periodAt('month', TODAY, 1))).toBe('Noviembre de 2026')
    expect(periodLabel({ unit: 'range', from: '2026-10-03', to: TODAY })).toBe('3 de oct – 11 de nov 2026')
  })

  it('round-trips through the address', () => {
    const range = { unit: 'range' as const, from: '2026-10-03', to: TODAY }
    const params = periodToParams(range, new URLSearchParams('vista=caja'))
    expect(params.get('vista')).toBe('caja')
    expect(periodFromParams(params, TODAY, 1)).toEqual(range)
    expect(periodFromParams(new URLSearchParams('periodo=semana&desde=2026-11-04'), TODAY, 1)).toMatchObject({
      from: '2026-11-02',
    })
    expect(periodFromParams(new URLSearchParams('periodo=x'), TODAY, 1)).toBeNull()
  })
})
