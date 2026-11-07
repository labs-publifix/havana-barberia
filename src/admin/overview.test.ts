import { describe, expect, it } from 'vitest'
import type { Appointment, Staff, TimeBlock } from '@/domain/types'
import { zonedInstant } from '@/lib/time'
import type { AgendaDay } from './domain'
import { computeOverview, timelineBounds } from './overview'

const TZ = 'America/Mexico_City'
const DATE = '2026-11-04' // Wednesday
const at = (time: string) => zonedInstant(DATE, time, TZ)
const iso = (time: string) => at(time).toISOString()

const week = (ranges: { start: string; end: string }[]) => [[], ranges, ranges, ranges, ranges, ranges, []]
const barber = (id: string, ranges = [{ start: '10:00', end: '20:00' }]): Staff => ({
  id,
  name: id,
  role: 'barber',
  photoUrl: null,
  active: true,
  order: 1,
  serviceIds: 'all',
  schedule: week(ranges),
})

let n = 0
const appt = (staffId: string, start: string, durationMin: number, status: Appointment['status'], price = 300) => {
  const s = at(start)
  return {
    id: `a${++n}`,
    token: `t${n}`,
    customerId: `c${n}`,
    customer: { name: `Cliente ${n}`, phone: '4420000000', email: 'x@ejemplo.com' },
    staffId,
    serviceIds: ['corte'],
    startsAt: s.toISOString(),
    endsAt: new Date(s.getTime() + durationMin * 60000).toISOString(),
    durationMin,
    totalPrice: price,
    status,
    notes: '',
    createdAt: s.toISOString(),
    loyaltyToken: null,
  } satisfies Appointment
}

const day = (
  appointments: Appointment[],
  blocks: TimeBlock[] = [],
  staff = [barber('ana'), barber('beto')],
): AgendaDay => ({
  date: DATE,
  timeZone: TZ,
  hours: [{ start: '10:00', end: '20:30' }],
  staff,
  services: [],
  appointments,
  blocks,
})

const opts = {}

describe('computeOverview', () => {
  const list = [
    appt('ana', '10:00', 60, 'completed', 280),
    appt('ana', '11:00', 30, 'no_show', 200),
    appt('ana', '12:00', 60, 'confirmed', 500), // in progress at 12:30
    appt('ana', '13:30', 30, 'booked', 240), // unconfirmed, within 2 h
    appt('beto', '12:05', 30, 'booked', 220), // in progress at 12:30, unclosed by 13:10
    appt('beto', '17:00', 45, 'cancelled', 280),
    appt('beto', '18:00', 45, 'confirmed', 280),
  ]
  const ov = computeOverview(day(list), at('12:30'), opts)

  it('counts the day: cancellations are not scheduled, no-shows are', () => {
    expect(ov.totals).toEqual({ scheduled: 6, completed: 1, pending: 4, noShow: 1, cancelled: 1 })
  })

  it('finds what is happening now and what comes next', () => {
    expect(ov.inProgress.map((a) => a.startsAt)).toEqual([iso('12:00'), iso('12:05')])
    expect(ov.next?.startsAt).toBe(iso('13:30'))
    expect(ov.upcoming.map((a) => a.staffId)).toEqual(['ana', 'beto'])
  })

  it('values the day without cancellations or no-shows', () => {
    expect(ov.value).toBe(280 + 500 + 240 + 220 + 280)
  })

  it('computes occupancy from booked over working minutes', () => {
    const ana = ov.loads.find((l) => l.staff.id === 'ana')!
    expect(ana.workingMin).toBe(600)
    expect(ana.bookedMin).toBe(60 + 60 + 30) // the no-show does not count
    expect(ana.pct).toBe(25)
    expect(ov.occupancyPct).toBe(Math.round(((150 + 75) / 1200) * 100))
  })

  it('raises alerts: unconfirmed soon, no-shows and cancellations', () => {
    expect(ov.alerts.map((a) => [a.kind, a.appointment?.staffId ?? a.block?.staffId])).toEqual([
      ['unconfirmed', 'ana'],
      ['no_show', 'ana'],
      ['cancelled', 'beto'],
    ])
  })

  it('flags appointments whose time is over and nobody closed (in progress ones are fine)', () => {
    const later = computeOverview(day(list), at('13:10'), opts)
    expect(later.alerts.filter((a) => a.kind === 'unclosed').map((a) => a.appointment!.startsAt)).toEqual([
      iso('12:00'),
      iso('12:05'),
    ])
  })

  it('a barber only sees their own day', () => {
    const own = computeOverview(day(list), at('12:30'), { ...opts, staffId: 'beto' })
    expect(own.appointments.every((a) => a.staffId === 'beto')).toBe(true)
    expect(own.loads.map((l) => l.staff.id)).toEqual(['beto'])
    expect(own.next?.startsAt).toBe(iso('18:00'))
  })

  it('blocks reduce working time and show as alerts (shop-wide ones for everybody)', () => {
    const blocks: TimeBlock[] = [
      { id: 'b1', staffId: 'ana', startsAt: iso('14:00'), endsAt: iso('16:00'), reason: 'Comida larga' },
      { id: 'b2', staffId: null, startsAt: iso('19:00'), endsAt: iso('20:30'), reason: 'Junta' },
      // Overlapping blocks are not subtracted twice.
      { id: 'b3', staffId: 'ana', startsAt: iso('15:00'), endsAt: iso('17:00'), reason: 'Trámite' },
    ]
    const ov2 = computeOverview(day([], blocks), at('09:00'), opts)
    const ana = ov2.loads.find((l) => l.staff.id === 'ana')!
    expect(ana.workingMin).toBe(600 - 180 - 60)
    expect(ov2.loads.find((l) => l.staff.id === 'beto')!.workingMin).toBe(540)
    expect(ov2.alerts.filter((a) => a.kind === 'block')).toHaveLength(3)
    const beto = computeOverview(day([], blocks), at('09:00'), { ...opts, staffId: 'beto' })
    expect(beto.alerts.map((a) => a.block?.id)).toEqual(['b2'])
  })

  it('a day off has no working time and no occupancy', () => {
    const ov3 = computeOverview(
      { ...day([]), date: '2026-11-08' }, // Sunday: the test schedule is empty
      at('12:00'),
      opts,
    )
    expect(ov3.loads.every((l) => l.workingMin === 0 && l.pct === 0)).toBe(true)
    expect(ov3.occupancyPct).toBe(0)
  })
})

describe('timelineBounds', () => {
  it('spans shop hours and schedules, rounded to whole hours', () => {
    const d = day([], [], [barber('ana', [{ start: '09:30', end: '14:00' }])])
    const ov = computeOverview(d, at('09:00'), opts)
    expect(timelineBounds(d, ov.loads)).toEqual([9 * 60, 21 * 60])
  })

  it('is empty when nobody works and the shop is closed', () => {
    const d = { ...day([], [], [barber('ana', [])]), hours: [] }
    const ov = computeOverview(d, at('09:00'), opts)
    expect(timelineBounds(d, ov.loads)).toBeNull()
  })
})
