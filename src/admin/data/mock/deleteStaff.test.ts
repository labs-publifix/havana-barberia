import { describe, expect, it } from 'vitest'
import { MockBookingRepository } from '@/data/mock/MockBookingRepository'
import { DEMO_PASSWORD, MockAdminRepository } from './MockAdminRepository'

let n = 0
async function setup(email = 'dueno@havana.test') {
  const booking = new MockBookingRepository({ latencyMs: 0, storage: null })
  const admin = new MockAdminRepository({ storage: null, booking })
  await admin.signIn(email, DEMO_PASSWORD)
  const { staff } = await admin.saveStaff({
    name: `Barbero de Prueba ${++n}`,
    title: '',
    bio: '',
    photoUrl: null,
    active: true,
    schedule: (await booking.getBusinessHours()).weekly,
    serviceIds: ['corte-adulto'],
  })
  return { booking, admin, staff }
}

describe('deleting a barber', () => {
  it('without history: gone from Equipo, the site and the booking', async () => {
    const { booking, admin, staff } = await setup()
    expect(await admin.deleteStaff(staff.id)).toBe('deleted')
    expect((await admin.getTeam()).staff.some((s) => s.id === staff.id)).toBe(false)
    expect((await booking.listStaff()).some((s) => s.id === staff.id)).toBe(false)
  })

  it('with upcoming appointments: asks to move them first', async () => {
    const { admin } = await setup()
    const busy = (await admin.getTeam()).staff.find((s) => s.id === 'leonardo')!
    await expect(admin.deleteStaff(busy.id)).rejects.toThrow('cita(s) próxima(s)')
  })

  it('reception cannot delete barbers', async () => {
    const { booking, staff } = await setup()
    const desk = new MockAdminRepository({ storage: null, booking })
    await desk.signIn('recepcion@havana.test', DEMO_PASSWORD)
    await expect(desk.deleteStaff(staff.id)).rejects.toThrow('no permite')
  })
})
