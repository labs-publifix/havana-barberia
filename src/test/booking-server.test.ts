import {
  changeAllowed,
  cleanRequest,
  pickSlot,
  type Busy,
  type Catalog,
} from '../../supabase/functions/_shared/booking'

const day = [{ start: '10:00', end: '20:30' }]
const week = [[{ start: '10:00', end: '15:00' }], day, day, day, day, day, [{ start: '10:00', end: '18:00' }]]
const catalog: Catalog = {
  settings: {
    business_hours: week,
    time_zone: 'America/Mexico_City',
    slot_step_min: 15,
    min_notice_min: 60,
    max_advance_days: 30,
    max_active_per_customer: 2,
    buffer_min: 0,
    change_cutoff_min: 240,
    tolerance_min: 10,
    loyalty_goal: 10,
    reward_validity_days: 90,
  },
  staff: [
    {
      id: 'leonardo',
      name: 'Leonardo',
      title: '',
      photo_url: null,
      active: true,
      sort: 1,
      all_services: true,
      schedule: week,
    },
    {
      id: 'isaac',
      name: 'Isaac',
      title: '',
      photo_url: null,
      active: true,
      sort: 2,
      all_services: true,
      schedule: week,
    },
  ],
  links: [],
  services: [
    {
      id: 'corte',
      category_id: 'cortes',
      name: 'Corte',
      description: '',
      duration_min: 45,
      price: 280,
      active: true,
      loyalty_eligible: true,
      sort: 1,
    },
    {
      id: 'viejo',
      category_id: 'cortes',
      name: 'Viejo',
      description: '',
      duration_min: 30,
      price: 100,
      active: false,
      loyalty_eligible: false,
      sort: 2,
    },
  ],
}
// Monday 2026-11-16, 9:00 in Querétaro; 4:00 p. m. is 22:00 UTC.
const now = new Date('2026-11-16T15:00:00Z')
const at4pm = '2026-11-16T22:00:00.000Z'
const request = {
  action: 'create',
  serviceIds: ['corte'],
  staffId: 'any',
  startsAt: at4pm,
  customer: { name: '  Ana   Ríos ', phone: '442 111 2233', email: 'Ana@Cliente.test ' },
  notes: '',
  privacyAccepted: true,
}

describe('online booking on the server', () => {
  it('normalizes what the site sends', () => {
    expect(cleanRequest(request)).toMatchObject({
      customer: { name: 'Ana Ríos', phone: '4421112233', email: 'ana@cliente.test' },
      staffId: 'any',
    })
    expect(cleanRequest({ ...request, privacyAccepted: false })).toMatchObject({ code: 'invalid_request' })
    expect(cleanRequest({ ...request, customer: { ...request.customer, phone: '123' } })).toMatchObject({
      code: 'invalid_request',
    })
  })

  it('accepts a time the site offers and picks a barber', () => {
    const clean = cleanRequest(request)
    if ('code' in clean) throw new Error(clean.message)
    expect(pickSlot(catalog, [], clean, now)).toMatchObject({ startsAt: at4pm, available: true, staffId: 'leonardo' })
  })

  it('refuses a busy time and offers the nearest ones', () => {
    const clean = cleanRequest({ ...request, staffId: 'isaac' })
    if ('code' in clean) throw new Error(clean.message)
    const busy: Busy[] = [
      {
        id: 'a1',
        staff_id: 'isaac',
        starts_at: '2026-11-16T21:45:00Z',
        ends_at: '2026-11-16T22:30:00Z',
        is_block: false,
      },
    ]
    const r = pickSlot(catalog, busy, clean, now)
    expect(r).toMatchObject({ code: 'slot_unavailable' })
    expect('alternatives' in r && r.alternatives.length).toBeGreaterThan(0)
  })

  it('refuses times off the grid, too soon, or with an inactive service', () => {
    const off = cleanRequest({ ...request, startsAt: '2026-11-16T22:05:00Z' })
    const soon = cleanRequest({ ...request, startsAt: '2026-11-16T15:30:00Z' })
    const inactive = cleanRequest({ ...request, serviceIds: ['viejo'] })
    for (const c of [off, soon]) {
      if ('code' in c) throw new Error(c.message)
      expect(pickSlot(catalog, [], c, now)).toMatchObject({ code: 'slot_unavailable' })
    }
    if ('code' in inactive) throw new Error(inactive.message)
    expect(pickSlot(catalog, [], inactive, now)).toMatchObject({ code: 'invalid_request' })
  })

  it('a whole-shop block closes the time for everyone', () => {
    const clean = cleanRequest(request)
    if ('code' in clean) throw new Error(clean.message)
    const holiday: Busy[] = [
      { id: 'b1', staff_id: null, starts_at: '2026-11-16T16:00:00Z', ends_at: '2026-11-17T03:00:00Z', is_block: true },
    ]
    expect(pickSlot(catalog, holiday, clean, now)).toMatchObject({ code: 'slot_unavailable' })
  })

  it('changes close a few hours before', () => {
    expect(changeAllowed({ status: 'confirmed', starts_at: '2026-11-16T22:00:00Z' }, catalog.settings, now)).toBeNull()
    expect(
      changeAllowed({ status: 'confirmed', starts_at: '2026-11-16T18:00:00Z' }, catalog.settings, now),
    ).toMatchObject({ code: 'change_window_closed', cutoffHours: 4 })
    expect(
      changeAllowed({ status: 'completed', starts_at: '2026-11-20T18:00:00Z' }, catalog.settings, now),
    ).toMatchObject({
      code: 'invalid_request',
    })
  })
})
