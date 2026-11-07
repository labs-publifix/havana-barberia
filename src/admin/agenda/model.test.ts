import { describe, expect, it } from 'vitest'
import type { Appointment, Staff } from '@/domain/types'
import { zonedInstant } from '@/lib/time'
import type { AgendaDay } from '../domain'
import { canComplete, canMarkNoShow, gridBounds, minuteAt, shiftDate, timeOptions, weekOf } from './model'

const TZ = 'America/Mexico_City'

describe('agenda model', () => {
  it('weeks start on Monday', () => {
    expect(weekOf('2026-11-05')).toEqual([
      '2026-11-02',
      '2026-11-03',
      '2026-11-04',
      '2026-11-05',
      '2026-11-06',
      '2026-11-07',
      '2026-11-08',
    ])
    expect(weekOf('2026-11-08')[0]).toBe('2026-11-02') // Sunday belongs to the week that started Monday
    expect(weekOf('2026-11-02')[0]).toBe('2026-11-02')
  })

  it('moves by a day or a week', () => {
    expect(shiftDate('2026-11-30', 'dia', 1)).toBe('2026-12-01')
    expect(shiftDate('2026-11-05', 'semana', -1)).toBe('2026-10-29')
  })

  const staff = (id: string, ranges: { start: string; end: string }[]): Staff => ({
    id,
    name: id,
    role: 'barber',
    photoUrl: null,
    active: true,
    order: 1,
    serviceIds: 'all',
    schedule: [ranges, ranges, ranges, ranges, ranges, ranges, ranges],
  })
  const day = (extra: Partial<AgendaDay> = {}): AgendaDay => ({
    date: '2026-11-05',
    timeZone: TZ,
    hours: [{ start: '10:00', end: '20:30' }],
    staff: [staff('a', [{ start: '09:30', end: '14:00' }]), staff('b', [{ start: '12:00', end: '21:15' }])],
    services: [],
    appointments: [],
    blocks: [],
    ...extra,
  })

  it('grid spans shop hours and the visible schedules, in whole hours', () => {
    expect(gridBounds([day()], null)).toEqual([9 * 60, 22 * 60])
    expect(gridBounds([day()], ['a'])).toEqual([9 * 60, 21 * 60])
    expect(gridBounds([], null)).toEqual([10 * 60, 20 * 60])
  })

  it('grid grows to show an appointment outside hours', () => {
    const late = zonedInstant('2026-11-05', '21:40', TZ)
    const appt = {
      staffId: 'a',
      startsAt: late.toISOString(),
      endsAt: new Date(late.getTime() + 30 * 60000).toISOString(),
    } as Appointment
    expect(gridBounds([day({ appointments: [appt] })], ['a'])).toEqual([9 * 60, 23 * 60])
  })

  it('complete once started; no-show after the tolerance; closed ones never', () => {
    const start = zonedInstant('2026-11-05', '12:00', TZ)
    const a = { status: 'confirmed', startsAt: start.toISOString() } as Appointment
    const at = (min: number) => new Date(start.getTime() + min * 60000)
    expect(canComplete(a, at(-1))).toBe(false)
    expect(canComplete(a, at(0))).toBe(true)
    expect(canMarkNoShow(a, at(9), 10)).toBe(false)
    expect(canMarkNoShow(a, at(10), 10)).toBe(true)
    expect(canComplete({ ...a, status: 'cancelled' }, at(30))).toBe(false)
  })

  it('time options and click-to-minute snap to the 15-minute grid', () => {
    expect(timeOptions(600, 660)).toEqual(['10:00', '10:15', '10:30', '10:45', '11:00'])
    expect(minuteAt(0, 600, 1.4)).toBe(600)
    expect(minuteAt(1.4 * 29, 600, 1.4)).toBe(615)
    expect(minuteAt(-5, 600, 1.4)).toBe(600)
  })
})
