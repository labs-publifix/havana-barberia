import type { BookingRepository } from './BookingRepository'
import { MockBookingRepository } from './mock/MockBookingRepository'

export type { BookingRepository, ServiceCatalog, SlotQuery } from './BookingRepository'
export * from './errors'

/**
 * Picks the data source from VITE_DATA_SOURCE. Adding Supabase means adding a
 * `case 'supabase'` that returns a SupabaseBookingRepository; nothing else changes.
 */
export function createBookingRepository(source = import.meta.env.VITE_DATA_SOURCE ?? 'mock'): BookingRepository {
  switch (source) {
    case 'mock':
      return new MockBookingRepository({ latencyMs: import.meta.env.MODE === 'test' ? 0 : 350 })
    default:
      throw new Error(`Unknown VITE_DATA_SOURCE "${source}"`)
  }
}
