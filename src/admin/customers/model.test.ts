import { describe, expect, it } from 'vitest'
import type { Appointment, Customer, LoyaltyCard } from '@/domain/types'
import { filterPredicates, hasReward, isRestricted, matchesQuery, summarizeCustomers } from './model'

const NOW = new Date('2026-11-05T18:00:00.000Z')
const daysAgo = (d: number) => new Date(NOW.getTime() - d * 86400000).toISOString()

const customer = (id: string, name: string, phone = '4421112233', email = ''): Customer => ({
  id,
  name,
  phone,
  email,
  createdAt: daysAgo(400),
})
let n = 0
const appt = (customerId: string, startsAt: string, status: Appointment['status'], price = 280): Appointment => ({
  id: `a${++n}`,
  token: `t${n}`,
  customerId,
  customer: { name: '', phone: '', email: '' },
  staffId: 'leonardo',
  serviceIds: ['corte-adulto'],
  startsAt,
  endsAt: new Date(Date.parse(startsAt) + 45 * 60000).toISOString(),
  durationMin: 45,
  totalPrice: price,
  status,
  notes: '',
  createdAt: startsAt,
  loyaltyToken: null,
})

describe('customer summaries', () => {
  const ana = customer('ana', 'Ana Ríos', '4421112233', 'ana@ejemplo.com')
  const beto = customer('beto', 'Beto Gómez', '4429990000')
  const appts = [
    appt('ana', daysAgo(30), 'completed', 280),
    appt('ana', daysAgo(10), 'completed', 500),
    appt('ana', daysAgo(5), 'cancelled'),
    appt('ana', daysAgo(-2), 'confirmed'),
    appt('ana', daysAgo(-9), 'booked'),
    appt('beto', daysAgo(120), 'no_show'),
    appt('beto', daysAgo(60), 'no_show'),
    appt('beto', daysAgo(20), 'no_show'),
    appt('beto', daysAgo(3), 'no_show'),
  ]
  const card: LoyaltyCard = {
    token: 'c1',
    customerId: 'ana',
    customerFirstName: 'Ana',
    stamps: 10,
    goal: 10,
    rewardExpiresAt: daysAgo(-30),
  }
  const [a, b] = summarizeCustomers([ana, beto], appts, [card], NOW)

  it('counts visits, spend, last visit and the next appointment', () => {
    expect(a).toMatchObject({ visits: 2, totalSpent: 780, cancellations: 1, noShows: 0, lastVisit: daysAgo(10) })
    expect(a!.nextAppointment?.startsAt).toBe(daysAgo(-2))
    expect(a!.loyalty?.token).toBe('c1')
    expect(hasReward(a!)).toBe(true)
  })

  it('flags 3 no-shows within 90 days (older ones do not count)', () => {
    expect(b).toMatchObject({ noShows: 4, recentNoShows: 3, visits: 0, lastVisit: null, nextAppointment: null })
    expect(isRestricted(b!)).toBe(true)
    expect(isRestricted(a!)).toBe(false)
  })

  it('filters for upcoming, regulars, no-shows and rewards', () => {
    const list = [a!, b!]
    expect(list.filter(filterPredicates.upcoming).map((s) => s.customer.id)).toEqual(['ana'])
    expect(list.filter(filterPredicates.no_shows).map((s) => s.customer.id)).toEqual(['beto'])
    expect(list.filter(filterPredicates.regulars)).toEqual([]) // 3+ visits
    expect(list.filter(filterPredicates.reward).map((s) => s.customer.id)).toEqual(['ana'])
  })

  it('searches names and emails without accents, and phones by digits', () => {
    expect(matchesQuery(b!, 'gomez')).toBe(true)
    expect(matchesQuery(a!, 'ANA@ejem')).toBe(true)
    expect(matchesQuery(b!, '999 00')).toBe(true)
    expect(matchesQuery(a!, '99')).toBe(false) // fewer than 3 digits do not search phones
    expect(matchesQuery(a!, '')).toBe(true)
  })
})
