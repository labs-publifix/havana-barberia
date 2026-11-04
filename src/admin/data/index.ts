import type { AdminRepository } from './AdminRepository'
import { MockAdminRepository } from './mock/MockAdminRepository'

export type { AdminRepository } from './AdminRepository'
export * from './AdminRepository'

/** Same switch as the booking repository; Supabase arrives in hito 1C. */
export function createAdminRepository(source = import.meta.env.VITE_DATA_SOURCE ?? 'mock'): AdminRepository {
  switch (source) {
    case 'mock':
      return new MockAdminRepository({ latencyMs: import.meta.env.MODE === 'test' ? 0 : 300 })
    default:
      throw new Error(`Unknown VITE_DATA_SOURCE "${source}"`)
  }
}
