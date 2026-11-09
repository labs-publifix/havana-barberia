import { createClient, type SupabaseClient } from '@supabase/supabase-js'

/**
 * One Supabase client for the site and the panel. Only the public
 * (publishable/anon) key reaches the browser; what each person can read or
 * change is decided by row-level security in the database.
 */
let client: SupabaseClient | null = null

export function supabase(): SupabaseClient {
  if (client) return client
  const url = import.meta.env.VITE_SUPABASE_URL
  const key = import.meta.env.VITE_SUPABASE_ANON_KEY
  if (!url || !key) throw new Error('Faltan VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY.')
  client = createClient(url, key, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, storageKey: 'havana:auth' },
  })
  return client
}

/** Rows come back snake_case and nullable; throw the database message when a call fails. */
export function must<T>(res: { data: T | null; error: { message: string; code?: string } | null }): T {
  if (res.error) throw Object.assign(new Error(res.error.message), { code: res.error.code })
  return res.data as T
}
