import type { BookingRepository } from './BookingRepository'

/**
 * Loads the real repository (Supabase client and all) in its own chunk, so the
 * public pages render without waiting for it. The download starts right away;
 * each call waits for it once.
 */
export class LazyBookingRepository implements BookingRepository {
  private readonly repo: Promise<BookingRepository>

  constructor(load: () => Promise<BookingRepository>) {
    this.repo = load()
  }

  private async call<K extends keyof BookingRepository>(
    key: K,
    ...args: Parameters<BookingRepository[K]>
  ): Promise<Awaited<ReturnType<BookingRepository[K]>>> {
    const r = await this.repo
    return (r[key] as (...a: unknown[]) => Promise<Awaited<ReturnType<BookingRepository[K]>>>).apply(r, args)
  }

  listServices: BookingRepository['listServices'] = (...a) => this.call('listServices', ...a)
  listStaff: BookingRepository['listStaff'] = (...a) => this.call('listStaff', ...a)
  getAvailableSlots: BookingRepository['getAvailableSlots'] = (...a) => this.call('getAvailableSlots', ...a)
  createAppointment: BookingRepository['createAppointment'] = (...a) => this.call('createAppointment', ...a)
  getAppointmentByToken: BookingRepository['getAppointmentByToken'] = (...a) => this.call('getAppointmentByToken', ...a)
  cancelAppointment: BookingRepository['cancelAppointment'] = (...a) => this.call('cancelAppointment', ...a)
  rescheduleAppointment: BookingRepository['rescheduleAppointment'] = (...a) => this.call('rescheduleAppointment', ...a)
  getLoyaltyCardByToken: BookingRepository['getLoyaltyCardByToken'] = (...a) => this.call('getLoyaltyCardByToken', ...a)
  getPolicy: BookingRepository['getPolicy'] = (...a) => this.call('getPolicy', ...a)
  getBusinessHours: BookingRepository['getBusinessHours'] = (...a) => this.call('getBusinessHours', ...a)
  unsubscribe: BookingRepository['unsubscribe'] = (...a) => this.call('unsubscribe', ...a)
}
