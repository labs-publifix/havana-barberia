import { describe, expect, it } from 'vitest'
import { zonedInstant } from '@/lib/time'
import { BookingLimitError, ChangeWindowClosedError, SlotUnavailableError } from '../errors'
import { MockBookingRepository } from './MockBookingRepository'
import { createSeed, DEMO_APPOINTMENT_TOKEN, DEMO_LOYALTY_TOKEN, type MockDb } from './seed'

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
    expect((await r.listStaff()).map((s) => s.name)).toEqual(['Isaac Fuentes', 'Leonardo Gómez'])
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
})
