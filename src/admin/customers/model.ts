import type { Appointment, Customer, Instant, LoyaltyCard } from '@/domain/types'

/**
 * Pure customer numbers for the Clientes section (no React, no clock of its
 * own). The mock repository uses them today; with Supabase the same shape can
 * come from a database view.
 */

export interface CustomerSummary {
  customer: Customer
  /** Completed appointments. */
  visits: number
  noShows: number
  /** No-shows inside the policy window (90 days). */
  recentNoShows: number
  cancellations: number
  lastVisit: Instant | null
  nextAppointment: Appointment | null
  /** Sum of completed appointments (MXN). */
  totalSpent: number
  loyalty: LoyaltyCard | null
  /** Barber of most completed visits (ties: the most recent); null without visits. */
  favoriteStaffId: string | null
}

/** Most frequent barber among completed visits; on a tie, the latest one wins. */
function favorite(done: Appointment[]): string | null {
  const count = new Map<string, { n: number; last: string }>()
  for (const a of done) {
    const c = count.get(a.staffId) ?? { n: 0, last: '' }
    count.set(a.staffId, { n: c.n + 1, last: a.startsAt > c.last ? a.startsAt : c.last })
  }
  let best: string | null = null
  let top = { n: 0, last: '' }
  for (const [id, c] of count)
    if (c.n > top.n || (c.n === top.n && c.last > top.last)) {
      best = id
      top = c
    }
  return best
}

export const NO_SHOW_WINDOW_DAYS = 90
export const NO_SHOW_LIMIT = 3
/** From this many visits a customer counts as a regular. */
export const REGULAR_VISITS = 3

export function summarizeCustomers(
  customers: Customer[],
  appointments: Appointment[],
  loyalty: LoyaltyCard[],
  now: Date,
): CustomerSummary[] {
  const t = now.getTime()
  const windowStart = t - NO_SHOW_WINDOW_DAYS * 86400000
  const byCustomer = new Map<string, Appointment[]>()
  for (const a of appointments) {
    const list = byCustomer.get(a.customerId)
    if (list) list.push(a)
    else byCustomer.set(a.customerId, [a])
  }
  return customers.map((customer) => {
    const own = byCustomer.get(customer.id) ?? []
    const done = own.filter((a) => a.status === 'completed')
    const noShows = own.filter((a) => a.status === 'no_show')
    const upcoming = own
      .filter((a) => (a.status === 'booked' || a.status === 'confirmed') && Date.parse(a.endsAt) > t)
      .sort((a, b) => a.startsAt.localeCompare(b.startsAt))
    const last =
      done
        .map((a) => a.startsAt)
        .sort()
        .at(-1) ?? null
    return {
      customer,
      visits: done.length,
      noShows: noShows.length,
      recentNoShows: noShows.filter((a) => Date.parse(a.startsAt) >= windowStart).length,
      cancellations: own.filter((a) => a.status === 'cancelled').length,
      lastVisit: last,
      nextAppointment: upcoming[0] ?? null,
      totalSpent: done.reduce((m, a) => m + a.totalPrice, 0),
      loyalty: loyalty.find((c) => c.customerId === customer.id) ?? null,
      favoriteStaffId: favorite(done),
    }
  })
}

/** Online booking asks these customers to contact the shop (fundamentals §6). */
export const isRestricted = (s: CustomerSummary) => s.recentNoShows >= NO_SHOW_LIMIT
export const hasReward = (s: CustomerSummary) =>
  !!s.loyalty && s.loyalty.stamps >= s.loyalty.goal && !!s.loyalty.rewardExpiresAt

export type CustomerFilter = 'all' | 'upcoming' | 'regulars' | 'no_shows' | 'reward'

export const filterPredicates: Record<CustomerFilter, (s: CustomerSummary) => boolean> = {
  all: () => true,
  upcoming: (s) => !!s.nextAppointment,
  regulars: (s) => s.visits >= REGULAR_VISITS,
  no_shows: (s) => s.noShows > 0,
  reward: hasReward,
}

/** Accent-insensitive lowercase ("Gómez" → "gomez"). */
export const fold = (s: string) =>
  s
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()

/** Search by name or email (accents optional) or by phone digits (3+). */
export function matchesQuery(s: CustomerSummary, query: string) {
  const q = fold(query.trim())
  if (!q) return true
  const digits = query.replace(/\D/g, '')
  if (digits.length >= 3 && s.customer.phone.includes(digits)) return true
  return fold(`${s.customer.name} ${s.customer.email}`).includes(q)
}
