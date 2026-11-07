import type { ID, LoyaltyCard, Service } from '@/domain/types'

/** The card is full and its free cut has not expired. */
export const rewardAvailable = (card: LoyaltyCard | null | undefined, now: Date) =>
  !!card && card.stamps >= card.goal && !!card.rewardExpiresAt && Date.parse(card.rewardExpiresAt) >= now.getTime()

/**
 * Service the free cut covers in an appointment: its haircut (category
 * "cortes"); with more than one, the most expensive. Null when there is none.
 */
export function rewardServiceFor(serviceIds: ID[], services: Service[]): Service | null {
  const cuts = services.filter((s) => serviceIds.includes(s.id) && s.categoryId === 'cortes')
  return cuts.sort((a, b) => b.price - a.price)[0] ?? null
}
