import { describe, expect, it } from 'vitest'
import { MockBookingRepository } from '@/data/mock/MockBookingRepository'
import { addDays, localDate, weekdayOf } from '@/lib/time'
import { DEMO_PASSWORD, MockAdminRepository } from './MockAdminRepository'

const nextMonday = () => {
  let d = addDays(localDate(new Date(), 'America/Mexico_City'), 2)
  while (weekdayOf(d) !== 1) d = addDays(d, 1)
  return d
}

describe('shop hours (Ajustes › Horario)', () => {
  it('one source: the site, the booking and the agenda follow the saved hours', async () => {
    const booking = new MockBookingRepository({ latencyMs: 0, storage: null })
    const admin = new MockAdminRepository({ storage: null, booking })
    await admin.signIn('dueno@havana.test', DEMO_PASSWORD)

    const weekly = (await booking.getBusinessHours()).weekly.map((d) => [...d])
    weekly[1] = [{ start: '12:00', end: '16:00' }] // Monday: noon to 4 p. m.
    const r = await admin.saveBusinessHours(weekly)

    expect((await booking.getBusinessHours()).weekly[1]).toEqual([{ start: '12:00', end: '16:00' }])
    // Barbers keep their shifts, but only the overlap is bookable; they are flagged to adjust.
    expect(r.staffOutside.length).toBeGreaterThan(0)
    expect(r.staffOutside[0]!.days).toContain(1)

    const monday = nextMonday()
    const slots = await booking.getAvailableSlots({ serviceIds: ['corte-adulto'], staffId: 'any', date: monday })
    // The grid covers only the new opening hours (a 45-minute cut can start until 3:15 p. m.).
    const times = slots.map((s) => s.time)
    expect(times[0]).toBe('12:00')
    expect(times.at(-1)).toBe('15:15')
    expect((await admin.getAgendaDay(monday)).hours).toEqual([{ start: '12:00', end: '16:00' }])
  })

  it('refuses hours that never open or overlap, and roles without access', async () => {
    const booking = new MockBookingRepository({ latencyMs: 0, storage: null })
    const admin = new MockAdminRepository({ storage: null, booking })
    await admin.signIn('dueno@havana.test', DEMO_PASSWORD)
    await expect(admin.saveBusinessHours(Array.from({ length: 7 }, () => []))).rejects.toThrow('al menos un día')
    const overlap = Array.from({ length: 7 }, () => [
      { start: '10:00', end: '14:00' },
      { start: '13:00', end: '18:00' },
    ])
    await expect(admin.saveBusinessHours(overlap)).rejects.toThrow('se enciman')

    const desk = new MockAdminRepository({ storage: null, booking })
    await desk.signIn('recepcion@havana.test', DEMO_PASSWORD)
    await expect(desk.saveBusinessHours((await booking.getBusinessHours()).weekly)).rejects.toThrow('no permite')
  })
})
