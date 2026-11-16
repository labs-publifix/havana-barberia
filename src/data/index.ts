import type { BookingRepository } from './BookingRepository'
import { MockBookingRepository } from './mock/MockBookingRepository'
import { LazyBookingRepository } from './LazyBookingRepository'

export type { BookingRepository, ServiceCatalog, SlotQuery } from './BookingRepository'
export * from './errors'

/**
 * Picks the data source from VITE_DATA_SOURCE: the demo (mock) or Supabase.
 */
export function createBookingRepository(): BookingRepository {
  // Compared inline, so the build drops the branch it doesn't use (the real
  // build ships no demo data, the demo no Supabase).
  if (import.meta.env.VITE_DATA_SOURCE === 'supabase')
    // Own chunk: the home page paints before the Supabase client arrives.
    return new LazyBookingRepository(() =>
      import('./supabase/SupabaseBookingRepository').then((m) => new m.SupabaseBookingRepository()),
    )
  const source = import.meta.env.VITE_DATA_SOURCE || 'mock'
  if (source !== 'mock') throw new Error(`Unknown VITE_DATA_SOURCE "${source}"`)
  return new MockBookingRepository({ latencyMs: import.meta.env.MODE === 'test' ? 0 : 350 })
}
