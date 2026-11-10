import type { ID, LoyaltyCard, Service } from '@/domain/types'

/** The card is full and its free cut has not expired. */
export const rewardAvailable = (card: LoyaltyCard | null | undefined, now: Date) =>
  !!card && card.stamps >= card.goal && !!card.rewardExpiresAt && Date.parse(card.rewardExpiresAt) >= now.getTime()

/**
 * What the free cut covers in an appointment. With 10 stamps the reward is a
 * haircut: on a haircut (category "cortes") it covers that service; on any
 * other service (a combo, a beard…) it discounts the price of a haircut and the
 * difference is charged. Null when the appointment has no service.
 */
export function rewardFor(serviceIds: ID[], services: Service[]): { service: Service; amount: number } | null {
  const mine = services.filter((s) => serviceIds.includes(s.id))
  const cuts = mine.filter((s) => s.categoryId === 'cortes').sort((a, b) => b.price - a.price)
  if (cuts[0]) return { service: cuts[0], amount: cuts[0].price }
  const haircut = services.filter((s) => s.categoryId === 'cortes').reduce((max, s) => Math.max(max, s.price), 0)
  const target = [...mine].sort((a, b) => b.price - a.price)[0]
  if (!target || !haircut) return null
  return { service: target, amount: Math.min(haircut, target.price) }
}
