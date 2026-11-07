import type { AdminRepository } from './AdminRepository'
import type { BookingRepository } from '@/data'
import { MockBookingRepository } from '@/data/mock/MockBookingRepository'
import { MockAdminRepository } from './mock/MockAdminRepository'

export type { AdminRepository } from './AdminRepository'
export * from './AdminRepository'

/** Same switch as the booking repository; Supabase arrives in hito 1C. */
export function createAdminRepository(
  booking: BookingRepository,
  source = import.meta.env.VITE_DATA_SOURCE ?? 'mock',
): AdminRepository {
  switch (source) {
    case 'mock':
      return new MockAdminRepository({
        latencyMs: import.meta.env.MODE === 'test' ? 0 : 300,
        booking: booking instanceof MockBookingRepository ? booking : undefined,
      })
    default:
      throw new Error(`Unknown VITE_DATA_SOURCE "${source}"`)
  }
}
