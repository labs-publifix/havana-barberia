import { describe, expect, it } from 'vitest'
import { zonedInstant } from '@/lib/time'
import { BookingLimitError, ChangeWindowClosedError, SlotUnavailableError } from '../errors'
import { MockBookingRepository } from './MockBookingRepository'
import { createSeed, DEMO_APPOINTMENT_TOKEN, DEMO_LOYALTY_TOKEN, MOCK_DB_VERSION, type MockDb } from './seed'

const TZ = 'America/Mexico_City'
const NOW = zonedInstant('2026-11-01', '09:00', TZ) // Sunday morning
const MONDAY = '2026-11-02' // Leonardo is off on Mondays in the seed; Isaac works
const iso = (date: string, time: string) => zonedInstant(date, time, TZ).toISOString()

/** Seed without random appointments, so tests control the agenda. */
function emptyDb(): MockDb {
  const db = createSeed(NOW)
  return { ...db, appointments: [], blocks: [] }
}

const repo = (initial = emptyDb(), now = () => NOW) => new MockBookingRepository({ storage: null, initial, now })

const contact = (n = 1) => ({
  name: `Ana ${n}`,
  phone: `44211122${String(n).padStart(2, '0')}`,
  email: `ana${n}@ejemplo.com`,
})
const booking = (startsAt: string, n = 1, staffId = 'isaac', serviceIds = ['corte-adulto']) => ({
  serviceIds,
  staffId,
  startsAt,
  customer: contact(n),
  notes: '',
  privacyAccepted: true as const,
})

describe('MockBookingRepository', () => {
  it('lists the catalog by category and the active team', async () => {
    const r = repo()
    const { categories, services } = await r.listServices()
    expect(categories.map((c) => c.name)).toEqual(['Cortes', 'Barba', 'Combos', 'Facial y cuidado', 'Color'])
    expect(services).toHaveLength(14)
    expect(services.find((s) => s.id === 'corte-barba')).toMatchObject({
      durationMin: 60,
      price: 500,
      description: 'Servicio de corte + barba clásico.',
    })
    expect((await r.listStaff()).map((s) => s.name)).toEqual(['Leonardo Gómez', 'Isaac Fuentes'])
  })

  it('never lets two simultaneous bookings take the same slot', async () => {
    const r = repo()
    const start = iso(MONDAY, '11:00')
    const results = await Promise.allSettled([
      r.createAppointment(booking(start, 1)),
      r.createAppointment(booking(start, 2)),
    ])
    expect(results.filter((x) => x.status === 'fulfilled')).toHaveLength(1)
    const rejected = results.find((x) => x.status === 'rejected') as PromiseRejectedResult
    expect(rejected.reason).toBeInstanceOf(SlotUnavailableError)
    expect((rejected.reason as SlotUnavailableError).alternatives.length).toBeGreaterThan(0)
  })

  it('books several services as one appointment with summed duration and price', async () => {
    const r = repo()
    const a = await r.createAppointment(booking(iso(MONDAY, '10:00'), 1, 'isaac', ['corte-adulto', 'bigote']))
    expect(a.durationMin).toBe(60)
    expect(a.totalPrice).toBe(430)
    expect(a.endsAt).toBe(iso(MONDAY, '11:00'))
    expect(a.status).toBe('booked')
  })

  it('assigns a barber for "first available"', async () => {
    const r = repo()
    const a = await r.createAppointment(booking(iso('2026-11-03', '10:00'), 1, 'any'))
    expect(['isaac', 'leonardo']).toContain(a.staffId)
  })

  it('normalizes the phone and reuses the customer and loyalty card', async () => {
    const r = repo()
    const a = await r.createAppointment({
      ...booking(iso(MONDAY, '10:00')),
      customer: { ...contact(1), phone: '+52 (442) 111-2201' },
    })
    expect(a.customer.phone).toBe('4421112201')
    const b = await r.createAppointment(booking(iso(MONDAY, '12:00')))
    expect(b.customerId).toBe(a.customerId)
    expect(b.loyaltyToken).toBe(a.loyaltyToken)
    expect(await r.getLoyaltyCardByToken(a.loyaltyToken!)).toMatchObject({ stamps: 0, goal: 10 })
  })

  it('limits each customer to 2 upcoming appointments', async () => {
    const r = repo()
    await r.createAppointment(booking(iso(MONDAY, '10:00')))
    await r.createAppointment(booking(iso(MONDAY, '11:00')))
    await expect(r.createAppointment(booking(iso(MONDAY, '12:00')))).rejects.toBeInstanceOf(BookingLimitError)
  })

  it('cancels up to 4 hours before and refuses after', async () => {
    let now = NOW
    const r = repo(emptyDb(), () => now)
    const a = await r.createAppointment(booking(iso(MONDAY, '15:00')))
    now = zonedInstant(MONDAY, '11:30', TZ) // 3.5 h before
    await expect(r.cancelAppointment(a.token)).rejects.toBeInstanceOf(ChangeWindowClosedError)
    now = zonedInstant(MONDAY, '10:59', TZ) // 4 h 1 min before
    await r.cancelAppointment(a.token)
    expect((await r.getAppointmentByToken(a.token))!.status).toBe('cancelled')
  })

  it('reschedules to a free slot and frees the old one', async () => {
    const r = repo()
    const a = await r.createAppointment(booking(iso(MONDAY, '10:00')))
    const moved = await r.rescheduleAppointment(a.token, { startsAt: iso(MONDAY, '10:15') }) // overlaps its own old time
    expect(moved.startsAt).toBe(iso(MONDAY, '10:15'))
    const slots = await r.getAvailableSlots({ serviceIds: ['corte-adulto'], staffId: 'isaac', date: MONDAY })
    expect(slots.find((s) => s.time === '11:00')!.available).toBe(true) // 10:15 + 45 = 11:00
    expect(slots.find((s) => s.time === '10:30')!.available).toBe(false)
  })

  it('refuses to reschedule into a taken slot and suggests alternatives', async () => {
    const r = repo()
    const a = await r.createAppointment(booking(iso(MONDAY, '10:00'), 1))
    await r.createAppointment(booking(iso(MONDAY, '12:00'), 2))
    const err = await r.rescheduleAppointment(a.token, { startsAt: iso(MONDAY, '12:00') }).catch((e) => e)
    expect(err).toBeInstanceOf(SlotUnavailableError)
  })

  it('ships demo data: 10 days of appointments, a demo appointment and a 6/10 loyalty card', () => {
    const db = createSeed(NOW)
    const days = new Set(db.appointments.map((a) => a.startsAt.slice(0, 10)))
    expect(days.size).toBeGreaterThanOrEqual(8)
    expect(db.appointments.find((a) => a.token === DEMO_APPOINTMENT_TOKEN)).toBeTruthy()
    expect(db.loyalty.find((c) => c.token === DEMO_LOYALTY_TOKEN)).toMatchObject({ stamps: 6, goal: 10 })
    // Seeded appointments never overlap for the same barber.
    for (const a of db.appointments)
      for (const b of db.appointments)
        if (a !== b && a.staffId === b.staffId) expect(a.startsAt < b.endsAt && b.startsAt < a.endsAt).toBe(false)
  })

  it('persists to storage and survives a broken storage', async () => {
    const store = new Map<string, string>()
    const storage = {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
      removeItem: (k: string) => void store.delete(k),
    }
    const r1 = new MockBookingRepository({ storage, initial: emptyDb(), now: () => NOW })
    const a = await r1.createAppointment(booking(iso(MONDAY, '10:00')))
    const r2 = new MockBookingRepository({ storage, now: () => NOW })
    expect(await r2.getAppointmentByToken(a.token)).toBeTruthy()

    const broken = {
      getItem: () => {
        throw new Error('blocked')
      },
      setItem: () => {
        throw new Error('full')
      },
      removeItem: () => {},
    }
    const r3 = new MockBookingRepository({ storage: broken, now: () => NOW })
    expect((await r3.listStaff()).length).toBe(2)
  })

  it('on a new day reseeds the sample agenda and keeps real demo bookings', async () => {
    const yesterday = new Date(NOW.getTime() - 24 * 3600 * 1000)
    const store = new Map<string, string>()
    const storage = {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
      removeItem: (k: string) => void store.delete(k),
    }
    const r1 = new MockBookingRepository({
      storage,
      initial: { ...createSeed(yesterday), appointments: [] },
      now: () => yesterday,
    })
    const mine = await r1.createAppointment(booking(iso(MONDAY, '10:00')))

    const r2 = new MockBookingRepository({ storage, now: () => NOW })
    const db = r2.snapshot()
    expect(db.seededOn).toBe(createSeed(NOW).seededOn)
    expect(db.appointments.find((a) => a.token === mine.token)?.customer.name).toBe(mine.customer.name)
    expect(db.customers.some((c) => c.id === mine.customerId)).toBe(true)
    // No sample appointment was left overlapping the kept booking.
    const clash = db.appointments.filter(
      (a) => a.staffId === mine.staffId && a.startsAt < mine.endsAt && mine.startsAt < a.endsAt,
    )
    expect(clash.map((a) => a.token)).toEqual([mine.token])
  })

  it('upgrades a demo stored by an older version, keeping real bookings', async () => {
    const store = new Map<string, string>()
    const storage = {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
      removeItem: (k: string) => void store.delete(k),
    }
    const r1 = new MockBookingRepository({ storage, initial: emptyDb(), now: () => NOW })
    const mine = await r1.createAppointment(booking(iso(MONDAY, '10:00')))
    const old = JSON.parse(store.get('havana:mock-db')!) as MockDb
    store.set('havana:mock-db', JSON.stringify({ ...old, version: 1 }))

    const db = new MockBookingRepository({ storage, now: () => NOW }).snapshot()
    expect(db.version).toBe(MOCK_DB_VERSION)
    expect(db.appointments.some((a) => a.token === mine.token)).toBe(true)
    // A version from the future is not trusted: start over.
    store.set('havana:mock-db', JSON.stringify({ ...old, version: MOCK_DB_VERSION + 1 }))
    expect(
      new MockBookingRepository({ storage, now: () => NOW })
        .snapshot()
        .appointments.some((a) => a.token === mine.token),
    ).toBe(false)
  })

  it('refreshes the catalog from the seed but keeps stored bookings', async () => {
    const stale = emptyDb()
    stale.staff = stale.staff.map((s) => ({ ...s, photoUrl: '/old-hash.webp', order: 9 - s.order }))
    const r1 = new MockBookingRepository({ storage: null, initial: stale, now: () => NOW })
    const a = await r1.createAppointment(booking(iso(MONDAY, '10:00')))
    const store = new Map<string, string>([['havana:mock-db', JSON.stringify({ ...stale, appointments: [a] })]])
    const storage = {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
      removeItem: (k: string) => void store.delete(k),
    }
    const r2 = new MockBookingRepository({ storage, now: () => NOW })
    const staff = await r2.listStaff()
    expect(staff.map((s) => s.name)).toEqual(['Leonardo Gómez', 'Isaac Fuentes'])
    expect(staff.every((s) => s.photoUrl !== '/old-hash.webp')).toBe(true)
    expect(await r2.getAppointmentByToken(a.token)).toBeTruthy()
  })
})

describe('MockBookingRepository · staff actions', () => {
  // Monday 2 Nov: Isaac works 10–14 and 15–20:30.
  const at = (time: string) => zonedInstant(MONDAY, time, TZ)
  const repoAt = (time: string, db = emptyDb()) => {
    let now = at(time)
    const r = new MockBookingRepository({ storage: null, initial: db, now: () => now })
    // "HH:mm" on Monday, or a full ISO instant.
    return { r, setNow: (t: string) => (now = t.includes('T') ? new Date(t) : at(t)) }
  }
  const ana = { name: 'Ana Ríos', phone: '442 111 2233', email: '' }

  it('books from the panel on short notice, confirmed and marked as a panel booking', async () => {
    const { r } = repoAt('09:50')
    const a = await r.adminCreateAppointment({
      serviceIds: ['corte-adulto'],
      staffId: 'isaac',
      startsAt: iso(MONDAY, '10:00'),
      customer: ana,
      notes: ' Llamó por teléfono ',
      source: 'panel',
    })
    expect(a).toMatchObject({ status: 'confirmed', source: 'panel', notes: 'Llamó por teléfono', staffId: 'isaac' })
    expect(a.customer.phone).toBe('4421112233')
    // Customers would need 1 h of notice; staff do not, but never double-book.
    await expect(
      r.adminCreateAppointment({
        serviceIds: ['corte-adulto'],
        staffId: 'isaac',
        startsAt: iso(MONDAY, '10:15'),
        customer: { name: 'Otro', phone: '4429990000', email: '' },
        notes: '',
        source: 'panel',
      }),
    ).rejects.toBeInstanceOf(SlotUnavailableError)
  })

  it('requires a phone for bookings but not for walk-ins, and reuses known customers', async () => {
    const { r } = repoAt('11:07')
    await expect(
      r.adminCreateAppointment({
        serviceIds: ['bigote'],
        staffId: 'isaac',
        startsAt: iso(MONDAY, '12:00'),
        customer: { name: 'Sin tel', phone: '', email: '' },
        notes: '',
        source: 'panel',
      }),
    ).rejects.toThrow('El teléfono es obligatorio')

    // Walk-in right now, off the 15-minute grid, name only.
    const w = await r.adminCreateAppointment({
      serviceIds: ['bigote'],
      staffId: 'any',
      startsAt: at('11:07').toISOString(),
      customer: { name: 'Señor de la gorra', phone: '', email: '' },
      notes: '',
      source: 'walk_in',
    })
    expect(w).toMatchObject({ source: 'walk_in', staffId: 'isaac', durationMin: 15 })

    const first = await r.adminCreateAppointment({
      serviceIds: ['corte-adulto'],
      staffId: 'isaac',
      startsAt: iso(MONDAY, '15:00'),
      customer: ana,
      notes: '',
      source: 'panel',
    })
    const again = await r.adminCreateAppointment({
      serviceIds: ['corte-adulto'],
      staffId: 'isaac',
      startsAt: iso(MONDAY, '16:00'),
      customer: { id: first.customerId },
      notes: '',
      source: 'panel',
    })
    expect(again.customerId).toBe(first.customerId)
    expect((await r.adminFindCustomers('ana rios')).map((c) => c.name)).toEqual(['Ana Ríos'])
    expect((await r.adminFindCustomers('2233')).map((c) => c.id)).toEqual([first.customerId])
  })

  it('completing adds a loyalty stamp; the tenth unlocks the reward with an expiry', async () => {
    const { r, setNow } = repoAt('09:00')
    const a = await r.adminCreateAppointment({
      serviceIds: ['corte-adulto'],
      staffId: 'isaac',
      startsAt: iso(MONDAY, '10:00'),
      customer: ana,
      notes: '',
      source: 'panel',
    })
    await expect(r.adminSetStatus(a.id, 'completed')).rejects.toThrow('cuando ya empezó')
    setNow('10:40')
    const res = await r.adminSetStatus(a.id, 'completed')
    expect(res).toMatchObject({ stampAdded: true, loyalty: { stamps: 1, goal: 10, rewardExpiresAt: null } })
    await expect(r.adminSetStatus(a.id, 'cancelled')).rejects.toThrow('ya está cerrada')

    // Nine more visits: the card fills up and the free cut expires 90 days later.
    let last = res
    const visits = ['11:00', '12:00', '13:00', '15:00', '16:00', '17:00', '18:00', '19:00'].map((t) => at(t))
    visits.push(zonedInstant('2026-11-03', '10:00', TZ)) // Tuesday
    for (const start of visits.map((d) => d.toISOString())) {
      setNow('09:00')
      const b = await r.adminCreateAppointment({
        serviceIds: ['corte-adulto'],
        staffId: 'isaac',
        startsAt: start,
        customer: { id: a.customerId },
        notes: '',
        source: 'panel',
      })
      setNow(start)
      last = await r.adminSetStatus(b.id, 'completed')
    }
    expect(last.loyalty).toMatchObject({ stamps: 10 })
    // Completed on Tuesday 3 Nov: the free cut is valid for 90 days.
    expect(last.loyalty!.rewardExpiresAt).toBe(zonedInstant('2027-02-01', '23:59', TZ).toISOString())
  })

  it('services that do not count give no stamp', async () => {
    const { r, setNow } = repoAt('09:00')
    const a = await r.adminCreateAppointment({
      serviceIds: ['bigote'],
      staffId: 'isaac',
      startsAt: iso(MONDAY, '10:00'),
      customer: ana,
      notes: '',
      source: 'panel',
    })
    setNow('10:20')
    expect(await r.adminSetStatus(a.id, 'completed')).toMatchObject({ stampAdded: false, loyalty: null })
  })

  it('no-show only after the tolerance; confirm and cancel before', async () => {
    const { r, setNow } = repoAt('09:00')
    const a = await r.adminCreateAppointment({
      serviceIds: ['corte-adulto'],
      staffId: 'isaac',
      startsAt: iso(MONDAY, '10:00'),
      customer: ana,
      notes: '',
      source: 'panel',
    })
    await expect(r.adminSetStatus(a.id, 'confirmed')).rejects.toThrow('ya está confirmada')
    setNow('10:05')
    await expect(r.adminSetStatus(a.id, 'no_show')).rejects.toThrow('10 minutos de tolerancia')
    setNow('10:11')
    expect((await r.adminSetStatus(a.id, 'no_show')).appointment.status).toBe('no_show')
  })

  it('reschedules to another barber and time, never onto a busy slot', async () => {
    const db = emptyDb()
    const { r } = repoAt('09:00', db)
    const a = await r.adminCreateAppointment({
      serviceIds: ['corte-adulto'],
      staffId: 'isaac',
      startsAt: iso(MONDAY, '10:00'),
      customer: ana,
      notes: '',
      source: 'panel',
    })
    const b = await r.adminCreateAppointment({
      serviceIds: ['corte-adulto'],
      staffId: 'isaac',
      startsAt: iso(MONDAY, '11:00'),
      customer: { name: 'Beto', phone: '4420001111', email: '' },
      notes: '',
      source: 'panel',
    })
    await expect(r.adminReschedule(a.id, { startsAt: b.startsAt, staffId: 'isaac' })).rejects.toBeInstanceOf(
      SlotUnavailableError,
    )
    // Moving within its own time range is fine (it does not collide with itself).
    const moved = await r.adminReschedule(a.id, { startsAt: iso(MONDAY, '10:15'), staffId: 'isaac' })
    expect(moved.startsAt).toBe(iso(MONDAY, '10:15'))
    // Tuesday with Leonardo.
    const tue = await r.adminReschedule(a.id, { startsAt: iso('2026-11-03', '12:00'), staffId: 'leonardo' })
    expect(tue).toMatchObject({ staffId: 'leonardo', startsAt: iso('2026-11-03', '12:00') })
  })

  it('blocks refuse to cover pending appointments, then free the time when removed', async () => {
    const { r } = repoAt('09:00')
    await r.adminCreateAppointment({
      serviceIds: ['corte-adulto'],
      staffId: 'isaac',
      startsAt: iso(MONDAY, '12:00'),
      customer: ana,
      notes: '',
      source: 'panel',
    })
    const block = { staffId: 'isaac', startsAt: iso(MONDAY, '11:30'), endsAt: iso(MONDAY, '13:00'), reason: 'Trámite' }
    await expect(r.adminCreateBlock(block)).rejects.toThrow('Hay 1 cita en ese horario')
    await expect(r.adminCreateBlock({ ...block, reason: '  ' })).rejects.toThrow('motivo')

    const lunch = await r.adminCreateBlock({ ...block, startsAt: iso(MONDAY, '16:00'), endsAt: iso(MONDAY, '17:00') })
    const slot = (t: string) =>
      r.adminSlots({ serviceIds: ['corte-adulto'], staffId: 'isaac', date: MONDAY }).find((s) => s.time === t)
    expect(slot('16:00')?.available).toBe(false)
    await r.adminDeleteBlock(lunch.id)
    expect(slot('16:00')?.available).toBe(true)
  })
})

describe('MockBookingRepository · customers', () => {
  it('edits contact details and notes, refusing a phone that belongs to someone else', async () => {
    const r = repo()
    const a = await r.createAppointment(booking(iso(MONDAY, '10:00'), 1))
    const b = await r.createAppointment(booking(iso(MONDAY, '11:00'), 2))
    const updated = await r.adminUpdateCustomer(a.customerId, {
      name: ' Ana Ríos Peña ',
      phone: '442 333 4455',
      email: 'ANA.R@EJEMPLO.COM',
      notes: ' Prefiere tijera ',
    })
    expect(updated).toMatchObject({
      name: 'Ana Ríos Peña',
      phone: '4423334455',
      email: 'ana.r@ejemplo.com',
      notes: 'Prefiere tijera',
    })
    // Her appointments show the new details too.
    expect(r.snapshot().appointments.find((x) => x.id === a.id)?.customer.name).toBe('Ana Ríos Peña')

    await expect(
      r.adminUpdateCustomer(a.customerId, { name: 'Ana', phone: b.customer.phone, email: '', notes: '' }),
    ).rejects.toThrow('Ese teléfono ya es de otro cliente (Ana 2)')
    await expect(
      r.adminUpdateCustomer(a.customerId, { name: 'Ana', phone: '123', email: '', notes: '' }),
    ).rejects.toThrow('Revisa el teléfono')
    await expect(
      r.adminUpdateCustomer(a.customerId, { name: 'Ana', phone: '', email: 'no-es-correo', notes: '' }),
    ).rejects.toThrow('Revisa el correo')
  })
})

describe('MockBookingRepository · catalog', () => {
  const base = {
    categoryId: 'cortes',
    name: 'Corte clásico',
    description: ' Tijera y navaja ',
    durationMin: 45,
    price: 300,
    loyaltyEligible: true,
    active: true,
    staffIds: ['leonardo', 'isaac'],
  }

  it('creates a service at the end of its category; the public catalog and slots see it', async () => {
    const r = repo()
    const svc = await r.adminSaveService(base)
    expect(svc).toMatchObject({ id: 'corte-clasico', name: 'Corte clásico', description: 'Tijera y navaja', order: 4 })
    const { services } = await r.listServices()
    expect(services.find((s) => s.id === 'corte-clasico')?.price).toBe(300)
    const slots = await r.getAvailableSlots({ serviceIds: ['corte-clasico'], staffId: 'isaac', date: MONDAY })
    expect(slots.some((s) => s.available)).toBe(true)
  })

  it('validates name, duration, price and barbers', async () => {
    const r = repo()
    await expect(r.adminSaveService({ ...base, name: 'corte de CABELLO adulto' })).rejects.toThrow('Ya existe')
    await expect(r.adminSaveService({ ...base, durationMin: 50 })).rejects.toThrow('pasos de 15 min')
    await expect(r.adminSaveService({ ...base, price: 99.5 })).rejects.toThrow('sin centavos')
    await expect(r.adminSaveService({ ...base, staffIds: [] })).rejects.toThrow('al menos un barbero')
    // A hidden service may have nobody assigned yet.
    await expect(r.adminSaveService({ ...base, active: false, staffIds: [] })).resolves.toBeTruthy()
  })

  it('price changes never rewrite past appointments; hidden services leave the site', async () => {
    const r = repo()
    const a = await r.createAppointment(booking(iso(MONDAY, '10:00')))
    const cat = r.adminCatalog()
    const corte = cat.services.find((s) => s.id === 'corte-adulto')!
    await r.adminSaveService({ ...corte, price: 320, staffIds: cat.staffFor['corte-adulto']!, active: false })
    expect(r.snapshot().appointments.find((x) => x.id === a.id)?.totalPrice).toBe(280)
    expect((await r.listServices()).services.some((s) => s.id === 'corte-adulto')).toBe(false)
    expect(r.adminCatalog().services.find((s) => s.id === 'corte-adulto')).toMatchObject({ price: 320, active: false })
  })

  it('assigns barbers: a barber who did everything gets an explicit list without this service', async () => {
    const r = repo()
    const cat = r.adminCatalog()
    const tinte = cat.services.find((s) => s.id === 'tinte-cabello')!
    await r.adminSaveService({ ...tinte, staffIds: ['leonardo'] })
    const after = r.adminCatalog()
    expect(after.staffFor['tinte-cabello']).toEqual(['leonardo'])
    expect(after.staffFor['corte-adulto']).toEqual(['leonardo', 'isaac'])
    // Booking with Isaac for that service now offers nothing.
    const slots = await r.getAvailableSlots({ serviceIds: ['tinte-cabello'], staffId: 'isaac', date: MONDAY })
    expect(slots.every((s) => !s.available)).toBe(true)
  })

  it('reorders services and categories; deletes only unused services and empty categories', async () => {
    const r = repo()
    await r.adminMoveService('corte-nino', -1)
    expect(
      r
        .adminCatalog()
        .services.filter((s) => s.categoryId === 'cortes')
        .map((s) => s.id),
    ).toEqual(['corte-nino', 'corte-adulto', 'delineado-corte'])
    await r.adminMoveCategory('color', -1)
    expect(r.adminCatalog().categories.map((c) => c.id)).toEqual(['cortes', 'barba', 'combos', 'color', 'facial'])

    await r.createAppointment(booking(iso(MONDAY, '10:00')))
    await expect(r.adminDeleteService('corte-adulto')).rejects.toThrow('Ocúltalo en lugar de borrarlo')
    await r.adminDeleteService('mascarilla-negra')
    expect(r.adminCatalog().services.some((s) => s.id === 'mascarilla-negra')).toBe(false)

    await expect(r.adminDeleteCategory('facial')).rejects.toThrow('Tiene 1 servicio')
    const cat = await r.adminSaveCategory({ name: ' Paquetes  especiales ' })
    expect(cat).toMatchObject({ id: 'paquetes-especiales', name: 'Paquetes especiales', order: 6 })
    await expect(r.adminSaveCategory({ name: 'cortes' })).rejects.toThrow('Ya existe una categoría')
    await r.adminDeleteCategory(cat.id)
  })

  it('keeps an edited catalog after a reload and on a new day', async () => {
    const store = new Map<string, string>()
    const storage = {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
      removeItem: (k: string) => void store.delete(k),
    }
    const r1 = new MockBookingRepository({ storage, initial: emptyDb(), now: () => NOW })
    await r1.adminSaveService(base)
    expect(
      new MockBookingRepository({ storage, now: () => NOW })
        .adminCatalog()
        .services.some((s) => s.id === 'corte-clasico'),
    ).toBe(true)
    const nextDay = new Date(NOW.getTime() + 24 * 3600 * 1000)
    expect(
      new MockBookingRepository({ storage, now: () => nextDay })
        .adminCatalog()
        .services.some((s) => s.id === 'corte-clasico'),
    ).toBe(true)
  })
})

describe('MockBookingRepository · products', () => {
  const base = {
    name: 'Cera fuerte 100 g',
    brand: '',
    price: 250,
    cost: null,
    commission: null,
    imageUrl: null,
    active: true,
  }

  it('creates products with cost and commission optional, and validates amounts', async () => {
    const r = repo()
    const p = await r.adminSaveProduct(base)
    expect(p).toMatchObject({ id: 'cera-fuerte-100-g', price: 250, cost: null, commission: null })
    await expect(r.adminSaveProduct({ ...base, name: 'cera FUERTE 100 g' })).rejects.toThrow('Ya existe')
    await expect(r.adminSaveProduct({ ...base, name: 'Otro', price: 12.5 })).rejects.toThrow('precio público')
    await expect(r.adminSaveProduct({ ...base, name: 'Otro', cost: -1 })).rejects.toThrow('costo')
    const edited = await r.adminSaveProduct({ ...base, id: p.id, cost: 90, commission: 25, brand: ' Havana ' })
    expect(edited).toMatchObject({ cost: 90, commission: 25, brand: 'Havana' })
    await r.adminDeleteProduct(p.id)
    expect(r.adminProducts().some((x) => x.id === p.id)).toBe(false)
  })

  it('ships generic demo products without cost or commission', () => {
    const products = repo().adminProducts()
    expect(products.length).toBeGreaterThan(0)
    expect(products.every((p) => p.cost === null && p.commission === null)).toBe(true)
  })

  it('keeps products after a reload and on a new day', async () => {
    const store = new Map<string, string>()
    const storage = {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
      removeItem: (k: string) => void store.delete(k),
    }
    await new MockBookingRepository({ storage, initial: emptyDb(), now: () => NOW }).adminSaveProduct(base)
    const nextDay = new Date(NOW.getTime() + 24 * 3600 * 1000)
    const has = (now: Date) =>
      new MockBookingRepository({ storage, now: () => now }).adminProducts().some((p) => p.name === base.name)
    expect(has(NOW)).toBe(true)
    expect(has(nextDay)).toBe(true)
  })
})
