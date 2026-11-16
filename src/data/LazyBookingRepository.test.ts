import { LazyBookingRepository } from './LazyBookingRepository'
import { SlotUnavailableError } from './errors'
import type { BookingRepository } from './BookingRepository'

describe('LazyBookingRepository', () => {
  it('starts loading right away and delegates calls with their arguments', async () => {
    const getAppointmentByToken = vi.fn(async (_t: string) => null)
    const load = vi.fn(async () => ({ getAppointmentByToken }) as unknown as BookingRepository)
    const repo = new LazyBookingRepository(load)
    expect(load).toHaveBeenCalledTimes(1)
    await expect(repo.getAppointmentByToken('x')).resolves.toBeNull()
    await repo.getAppointmentByToken('y')
    expect(getAppointmentByToken).toHaveBeenCalledWith('y')
    expect(load).toHaveBeenCalledTimes(1)
  })

  it('keeps the errors the real repository throws', async () => {
    const repo = new LazyBookingRepository(
      async () =>
        ({
          createAppointment: async () => {
            throw new SlotUnavailableError([])
          },
        }) as unknown as BookingRepository,
    )
    await expect(repo.createAppointment({} as never)).rejects.toBeInstanceOf(SlotUnavailableError)
  })
})
