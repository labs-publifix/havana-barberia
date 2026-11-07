import { describe, expect, it } from 'vitest'
import { createSeed } from '@/data/mock/seed'
import type { Appointment } from '@/domain/types'
import { zonedInstant } from '@/lib/time'
import {
  changePct,
  customersServed,
  demandGrid,
  niceTicks,
  occupancy,
  salesByBarber,
  salesByDay,
  topServices,
} from './metrics'

const TZ = 'America/Mexico_City'
const seed = createSeed(zonedInstant('2026-11-01', '09:00', TZ))
const appt = (
  id: string,
  staffId: string,
  date: string,
  time: string,
  status = 'completed',
  customerId = 'c1',
): Appointment =>
  ({
    id,
    customerId,
    staffId,
    serviceIds: ['corte-adulto'],
    startsAt: zonedInstant(date, time, TZ).toISOString(),
    durationMin: 60,
    totalPrice: 280,
    status,
    payment:
      status === 'completed'
        ? {
            method: 'cash',
            amount: 280,
            tip: 20,
            tipMethod: 'cash',
            paidAt: '',
            products: [{ productId: 'p', name: 'Cera', qty: 1, price: 150, commission: null }],
          }
        : undefined,
  }) as unknown as Appointment

describe('report metrics', () => {
  it('adds sales per day (products and counter sales, no tips)', () => {
    const days = salesByDay(
      [appt('a', 'isaac', '2026-11-02', '10:00')],
      [{ at: zonedInstant('2026-11-03', '12:00', TZ).toISOString(), total: 100 }],
      '2026-11-02',
      '2026-11-03',
      TZ,
    )
    expect(days.map((d) => [d.sales, d.done])).toEqual([
      [430, 1],
      [100, 0],
    ])
  })

  it('works out occupancy against the scheduled hours', () => {
    // Monday 2 Nov: Isaac works 10–14 and 15–20:30 (570 min); Leonardo rests.
    const o = occupancy(
      [appt('a', 'isaac', '2026-11-02', '10:00'), appt('b', 'isaac', '2026-11-02', '11:00', 'cancelled')],
      seed.staff,
      '2026-11-02',
      '2026-11-02',
      TZ,
    )
    expect(o.byStaff.get('isaac')).toBe(Math.round((60 / 570) * 100))
  })

  it('maps demand by weekday and hour, ranks barbers and services, counts returning customers', () => {
    const grid = demandGrid([appt('a', 'isaac', '2026-11-02', '10:30')], TZ, [10, 11])
    expect(grid[0]).toEqual([1, 0])
    const rows = salesByBarber(
      [appt('a', 'isaac', '2026-11-02', '10:00')],
      [appt('p', 'isaac', '2026-10-26', '10:00')],
      seed.staff,
    )
    expect(rows).toEqual([{ id: 'isaac', name: 'Isaac Fuentes', sales: 430, done: 1, avg: 430, prevSales: 430 }])
    expect(topServices([appt('a', 'isaac', '2026-11-02', '10:00')], seed.services)[0]).toMatchObject({
      id: 'corte-adulto',
      n: 1,
      revenue: 280,
    })
    expect(
      customersServed(
        [
          appt('a', 'isaac', '2026-11-02', '10:00', 'completed', 'c1'),
          appt('b', 'isaac', '2026-11-02', '12:00', 'completed', 'c2'),
        ],
        [appt('p', 'isaac', '2026-10-26', '10:00', 'completed', 'c1')],
      ),
    ).toEqual({ served: 2, returning: 1 })
  })

  it('compares and picks clean ticks', () => {
    expect(changePct(120, 100)).toBe(20)
    expect(changePct(5, 0)).toBeNull()
    expect(niceTicks(3700)).toEqual([0, 1000, 2000, 3000, 4000])
    expect(niceTicks(0)).toEqual([0])
  })
})
