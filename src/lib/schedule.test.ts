import { describe, expect, it } from 'vitest'
import type { Appointment, WeeklySchedule } from '@/domain/types'
import { outsideSchedule, rangesLabel, scheduleErrors, weeklyMinutes } from './schedule'
import { zonedInstant } from './time'

const TZ = 'America/Mexico_City'
const r = (start: string, end: string) => ({ start, end })
const shop: WeeklySchedule = [
  [r('10:00', '15:00')],
  [r('10:00', '20:30')],
  [r('10:00', '20:30')],
  [r('10:00', '20:30')],
  [r('10:00', '20:30')],
  [r('10:00', '20:30')],
  [r('10:00', '18:00')],
]

describe('schedule rules', () => {
  it('accepts split shifts inside shop hours', () => {
    const s: WeeklySchedule = [[], [r('10:00', '14:00'), r('15:00', '20:30')], [], [], [], [], [r('10:00', '18:00')]]
    expect(scheduleErrors(s, shop)).toEqual({})
    expect(weeklyMinutes(s)).toBe(240 + 330 + 480)
  })

  it('flags shifts outside hours, overlapping, inverted, off the grid or on a closed day', () => {
    const closedSunday: WeeklySchedule = [[], [], [], [], [], [], []]
    const s: WeeklySchedule = [
      [r('10:00', '12:00')],
      [r('09:00', '14:00')],
      [r('10:00', '14:00'), r('13:00', '16:00')],
      [r('14:00', '12:00')],
      [r('10:10', '14:00')],
      [],
      [],
    ]
    expect(scheduleErrors(s, [...closedSunday.slice(0, 1), ...shop.slice(1)])).toEqual({
      0: 'La barbería no abre ese día.',
      1: expect.stringContaining('dentro del horario de la barbería'),
      2: 'Los turnos se enciman.',
      3: 'Cada turno debe terminar después de empezar.',
      4: 'Usa horas en punto o cada 15 minutos.',
    })
  })

  it('labels a day', () => {
    expect(rangesLabel([r('10:00', '14:00'), r('15:00', '20:30')])).toBe(
      '10:00 a. m. – 2:00 p. m. · 3:00 p. m. – 8:30 p. m.',
    )
    expect(rangesLabel([])).toBe('Descansa')
  })

  it('finds upcoming appointments a new schedule leaves outside the shifts', () => {
    const now = zonedInstant('2026-11-02', '09:00', TZ) // Monday
    const appt = (date: string, time: string, status: Appointment['status'] = 'confirmed') => {
      const s = zonedInstant(date, time, TZ)
      return {
        id: `${date}-${time}`,
        staffId: 'leo',
        status,
        startsAt: s.toISOString(),
        endsAt: new Date(s.getTime() + 45 * 60000).toISOString(),
      } as Appointment
    }
    const list = [
      appt('2026-11-02', '10:00'), // Monday morning: inside
      appt('2026-11-02', '14:15'), // lunch gap
      appt('2026-11-03', '11:00'), // Tuesday: now a day off
      appt('2026-11-03', '12:00', 'cancelled'), // ignored
    ]
    const s: WeeklySchedule = [[], [r('10:00', '14:00'), r('15:00', '20:30')], [], [], [], [], []]
    expect(outsideSchedule(list, 'leo', s, TZ, now).map((a) => a.id)).toEqual(['2026-11-02-14:15', '2026-11-03-11:00'])
  })
})
