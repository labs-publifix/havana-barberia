import type { BookingRepository } from './BookingRepository'
import { MockBookingRepository } from './mock/MockBookingRepository'
import { SupabaseBookingRepository } from './supabase/SupabaseBookingRepository'

export type { BookingRepository, ServiceCatalog, SlotQuery } from './BookingRepository'
export * from './errors'

/**
 * Picks the data source from VITE_DATA_SOURCE: the demo (mock) or Supabase.
 */
export function createBookingRepository(source = import.meta.env.VITE_DATA_SOURCE ?? 'mock'): BookingRepository {
  switch (source) {
    case 'mock':
      return new MockBookingRepository({ latencyMs: import.meta.env.MODE === 'test' ? 0 : 350 })
    case 'supabase':
      return new SupabaseBookingRepository()
    default:
      throw new Error(`Unknown VITE_DATA_SOURCE "${source}"`)
  }
}
