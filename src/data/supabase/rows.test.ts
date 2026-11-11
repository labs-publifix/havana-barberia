import { describe, expect, it } from 'vitest'
import { bookingPolicy } from '@/config/business'
import { fromPolicy, toPolicy, toService, toStaff, type SettingsRow } from './rows'

describe('Supabase rows', () => {
  it('maps services and staff (explicit services only when not "all")', () => {
    expect(
      toService({
        id: 'corte-adulto',
        category_id: 'cortes',
        name: 'Corte',
        description: '',
        duration_min: 45,
        price: 280,
        active: true,
        loyalty_eligible: true,
        sort: 1,
      }),
    ).toMatchObject({ categoryId: 'cortes', durationMin: 45, loyaltyEligible: true, order: 1 })
    const row = {
      id: 'isaac',
      name: 'Isaac',
      title: '',
      photo_url: null,
      active: true,
      sort: 2,
      schedule: [],
      all_services: false,
    }
    const links = [
      { staff_id: 'isaac', service_id: 'bigote' },
      { staff_id: 'leo', service_id: 'corte-adulto' },
    ]
    expect(toStaff(row, links)).toMatchObject({ serviceIds: ['bigote'], title: undefined, order: 2 })
    expect(toStaff({ ...row, all_services: true }, links).serviceIds).toBe('all')
  })

  it('round-trips the booking policy', () => {
    const row = fromPolicy(bookingPolicy) as unknown as SettingsRow
    expect(toPolicy(row)).toEqual(bookingPolicy)
  })
})
