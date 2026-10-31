import { describe, expect, it } from 'vitest'
import type { BookingPolicy, BusinessHours, Staff, TimeBlock } from '@/domain/types'
import { computeSlots, nearestAvailable, staffForServices, totalDuration, type BusyAppointment } from '.'
import { zonedInstant } from '@/lib/time'

const TZ = 'America/Mexico_City'
const hours: BusinessHours = {
  timeZone: TZ,
  weekly: [
    [], // Sunday closed in these tests
    [{ start: '10:00', end: '20:30' }],
    [{ start: '10:00', end: '20:30' }],
    [{ start: '10:00', end: '20:30' }],
    [{ start: '10:00', end: '20:30' }],
    [{ start: '10:00', end: '20:30' }],
    [{ start: '10:00', end: '18:00' }],
  ],
}
const policy: BookingPolicy = {
  slotStepMin: 15,
  minNoticeMin: 60,
  maxAdvanceDays: 30,
  toleranceMin: 10,
  bufferMin: 0,
  changeCutoffMin: 240,
  maxActiveAppointmentsPerCustomer: 2,
  loyaltyGoal: 10,
  rewardValidityDays: 90,
}
const fullWeek = hours.weekly.map(() => [{ start: '10:00', end: '20:30' }])
const barber = (id: string, order: number, schedule = fullWeek): Staff => ({
  id,
  name: id,
  role: 'barber',
  photoUrl: null,
  active: true,
  order,
  serviceIds: 'all',
  schedule,
})
const isaac = barber('isaac', 1)
const leo = barber('leo', 2)

const MONDAY = '2026-11-02'
const at = (date: string, time: string) => zonedInstant(date, time, TZ)
const iso = (date: string, time: string) => at(date, time).toISOString()
const appt = (
  staffId: string,
  start: string,
  end: string,
  status: BusyAppointment['status'] = 'booked',
  id = `${staffId}-${start}`,
): BusyAppointment => ({
  id,
  staffId,
  startsAt: iso(MONDAY, start),
  endsAt: iso(MONDAY, end),
  status,
})
// "now" is the day before, so minimum notice never interferes unless a test sets it.
const NOW = at('2026-11-01', '12:00')

const run = (over: Partial<Parameters<typeof computeSlots>[0]> = {}) =>
  computeSlots({
    date: MONDAY,
    durationMin: 45,
    staff: [isaac],
    hours,
    policy,
    appointments: [],
    blocks: [],
    now: NOW,
    ...over,
  })
const free = (slots: ReturnType<typeof computeSlots>) => slots.filter((s) => s.available).map((s) => s.time)

describe('computeSlots', () => {
  it('builds a 15-minute grid in the business time zone', () => {
    const slots = run()
    expect(slots[0]!.time).toBe('10:00')
    expect(slots[1]!.time).toBe('10:15')
    // 10:00 in Mexico City (UTC-6, no DST) is 16:00 UTC, regardless of the device time zone.
    expect(slots[0]!.startsAt).toBe('2026-11-02T16:00:00.000Z')
  })

  it('never offers a slot that ends after closing', () => {
    const slots = run({ durationMin: 45 })
    expect(slots.at(-1)!.time).toBe('19:45') // 19:45 + 45 = 20:30
    expect(slots.some((s) => s.time === '20:00')).toBe(false)
  })

  it('respects Saturday closing at 18:00', () => {
    const slots = run({ date: '2026-11-07', durationMin: 60 })
    expect(slots.at(-1)!.time).toBe('17:00')
  })

  it('returns nothing on a day without business hours', () => {
    expect(run({ date: '2026-11-08' })).toEqual([]) // Sunday, closed in this config
  })

  it('returns nothing when the barber does not work that day', () => {
    const off = barber(
      'off',
      1,
      fullWeek.map((d, i) => (i === 1 ? [] : d)),
    )
    expect(free(run({ staff: [off] }))).toEqual([])
  })

  it('allows back-to-back appointments without overlap', () => {
    const slots = run({ durationMin: 30, appointments: [appt('isaac', '11:00', '11:45')] })
    const f = free(slots)
    expect(f).toContain('10:30') // ends exactly at 11:00
    expect(f).not.toContain('10:45') // would end 11:15
    expect(f).not.toContain('11:30')
    expect(f).toContain('11:45') // starts exactly when the other ends
  })

  it('marks taken times as unavailable instead of hiding them', () => {
    const slots = run({ durationMin: 30, appointments: [appt('isaac', '11:00', '11:45')] })
    const s = slots.find((x) => x.time === '11:15')!
    expect(s.available).toBe(false)
    expect(s.staffId).toBeNull()
  })

  it('ignores cancelled and no-show appointments', () => {
    const slots = run({
      appointments: [appt('isaac', '11:00', '11:45', 'cancelled'), appt('isaac', '12:00', '12:45', 'no_show')],
    })
    expect(free(slots)).toContain('11:00')
    expect(free(slots)).toContain('12:00')
  })

  it('uses the sum of several services as the duration', () => {
    const duration = totalDuration([{ durationMin: 45 }, { durationMin: 30 }, { durationMin: 15 }])
    expect(duration).toBe(90)
    const slots = run({ durationMin: duration, appointments: [appt('isaac', '13:00', '13:30')] })
    const f = free(slots)
    expect(f).toContain('11:30') // 11:30–13:00
    expect(f).not.toContain('11:45') // would run into 13:00
    expect(slots.at(-1)!.time).toBe('19:00') // 19:00 + 90 = 20:30
    expect(slots.find((s) => s.time === '11:30')!.endsAt).toBe(iso(MONDAY, '13:00'))
  })

  it('applies the optional buffer after each appointment', () => {
    const slots = run({
      durationMin: 30,
      policy: { ...policy, bufferMin: 5 },
      appointments: [appt('isaac', '11:00', '11:30')],
    })
    const f = free(slots)
    expect(f).not.toContain('11:30') // needs 5 minutes after the previous one
    expect(f).toContain('11:45')
    expect(f).not.toContain('10:30') // 10:30–11:00 + 5 min buffer overlaps 11:00
  })

  it('respects blocks for one barber and for the whole shop', () => {
    const blocks: TimeBlock[] = [
      { id: 'b1', staffId: 'isaac', startsAt: iso(MONDAY, '14:00'), endsAt: iso(MONDAY, '15:00'), reason: 'Comida' },
      { id: 'b2', staffId: null, startsAt: iso(MONDAY, '18:00'), endsAt: iso(MONDAY, '18:30'), reason: 'Junta' },
    ]
    const f = free(run({ durationMin: 30, blocks }))
    expect(f).not.toContain('14:00')
    expect(f).not.toContain('14:30')
    expect(f).toContain('15:00')
    expect(f).not.toContain('18:00')
  })

  it('respects the barber schedule inside business hours', () => {
    const split = barber(
      'split',
      1,
      fullWeek.map(() => [
        { start: '10:00', end: '14:00' },
        { start: '15:00', end: '20:30' },
      ]),
    )
    const f = free(run({ staff: [split], durationMin: 45 }))
    expect(f).toContain('13:15')
    expect(f).not.toContain('13:30') // would cross the 14:00 break
    expect(f).toContain('15:00')
  })

  it('enforces the minimum notice of one hour', () => {
    const now = at(MONDAY, '12:10')
    const slots = run({ durationMin: 30, now })
    expect(free(slots)[0]).toBe('13:15') // 12:10 + 60 min = 13:10 -> next grid time
    expect(slots.find((s) => s.time === '13:00')!.available).toBe(false)
  })

  it('returns nothing for past dates or beyond the 30-day window', () => {
    expect(run({ date: '2026-10-30' })).toEqual([])
    expect(run({ date: '2026-12-02' })).toEqual([]) // 31 days after Nov 1
    expect(run({ date: '2026-12-01' }).length).toBeGreaterThan(0) // day 30 is allowed
  })

  describe('"any" barber (first available)', () => {
    it('returns the union of free times across barbers', () => {
      const appointments = [appt('isaac', '10:00', '12:00'), appt('leo', '12:00', '14:00')]
      const f = free(run({ staff: [isaac, leo], durationMin: 60, appointments }))
      expect(f).toContain('10:00') // only Leo is free
      expect(f).toContain('12:00') // only Isaac is free
    })

    it('assigns the barber with fewer appointments that day', () => {
      const appointments = [appt('isaac', '16:00', '16:30'), appt('isaac', '17:00', '17:30')]
      const slot = run({ staff: [isaac, leo], durationMin: 30, appointments }).find((s) => s.time === '10:00')!
      expect(slot.staffId).toBe('leo')
    })

    it('breaks ties by staff order', () => {
      const slot = run({ staff: [isaac, leo], durationMin: 30 }).find((s) => s.time === '10:00')!
      expect(slot.staffId).toBe('isaac')
    })

    it('marks a time unavailable only when nobody is free', () => {
      const appointments = [appt('isaac', '11:00', '12:00'), appt('leo', '11:00', '12:00')]
      const slot = run({ staff: [isaac, leo], durationMin: 30, appointments }).find((s) => s.time === '11:00')!
      expect(slot.available).toBe(false)
    })
  })

  it('excludes the appointment being rescheduled', () => {
    const appointments = [appt('isaac', '11:00', '11:45', 'booked', 'mine')]
    expect(free(run({ appointments }))).not.toContain('11:00')
    expect(free(run({ appointments, excludeAppointmentId: 'mine' }))).toContain('11:00')
  })
})

describe('helpers', () => {
  it('nearestAvailable returns the closest free times in order', () => {
    const slots = run({ durationMin: 30, appointments: [appt('isaac', '12:00', '13:00')] })
    const near = nearestAvailable(slots, iso(MONDAY, '12:15'), 3).map((s) => s.time)
    expect(near).toEqual(['11:15', '11:30', '13:00'])
  })

  it('staffForServices keeps active barbers that do every service', () => {
    const partial = { ...barber('p', 3), serviceIds: ['corte'] }
    const inactive = { ...barber('x', 0), active: false }
    expect(staffForServices([leo, partial, isaac, inactive], ['corte']).map((s) => s.id)).toEqual(['isaac', 'leo', 'p'])
    expect(staffForServices([leo, partial, isaac], ['corte', 'barba']).map((s) => s.id)).toEqual(['isaac', 'leo'])
  })
})
