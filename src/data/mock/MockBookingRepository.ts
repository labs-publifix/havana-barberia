import type { Appointment, Customer, LoyaltyCard, NewAppointment, Slot, Staff } from '@/domain/types'
import { bookingPolicy, businessHours } from '@/config/business'
import { computeSlots, isActiveStatus, nearestAvailable, staffForServices, totalDuration } from '@/lib/availability'
import { localDate } from '@/lib/time'
import { normalizeMxPhone } from '@/lib/phone'
import type { BookingRepository, ServiceCatalog, SlotQuery } from '../BookingRepository'
import {
  BookingLimitError,
  ChangeWindowClosedError,
  InvalidRequestError,
  NotFoundError,
  SlotUnavailableError,
} from '../errors'
import { createSeed, MOCK_DB_VERSION, type MockDb } from './seed'

const STORAGE_KEY = 'havana:mock-db'

export interface MockOptions {
  /** Where to persist; null keeps everything in memory. */
  storage?: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> | null
  /** Simulated network latency so loading states are visible. */
  latencyMs?: number
  now?: () => Date
  /** Start from this data instead of the stored/seeded one. */
  initial?: MockDb
}

const clone = <T>(x: T): T => structuredClone(x)

function randomToken() {
  const bytes = new Uint8Array(12)
  crypto.getRandomValues(bytes)
  return Array.from(bytes, (b) => b.toString(36).padStart(2, '0'))
    .join('')
    .slice(0, 16)
}

/**
 * In-memory repository persisted to localStorage. Writes run one at a time
 * (a promise queue) and re-check availability right before saving, so two
 * simultaneous bookings can never take the same slot.
 */
export class MockBookingRepository implements BookingRepository {
  private db: MockDb
  private readonly storage: MockOptions['storage']
  private readonly latencyMs: number
  private readonly now: () => Date
  private queue: Promise<unknown> = Promise.resolve()

  constructor(opts: MockOptions = {}) {
    this.storage = opts.storage === undefined ? safeLocalStorage() : opts.storage
    this.latencyMs = opts.latencyMs ?? 0
    this.now = opts.now ?? (() => new Date())
    this.db = opts.initial ? clone(opts.initial) : (this.load() ?? createSeed(this.now()))
    this.save()
  }

  /** Clear stored demo data and reseed (used by the /__ui gallery). */
  reset() {
    this.db = createSeed(this.now())
    this.save()
  }

  private load(): MockDb | null {
    try {
      const raw = this.storage?.getItem(STORAGE_KEY)
      if (!raw) return null
      const data = JSON.parse(raw) as MockDb
      return data.version === MOCK_DB_VERSION ? data : null
    } catch {
      return null
    }
  }

  private save() {
    try {
      this.storage?.setItem(STORAGE_KEY, JSON.stringify(this.db))
    } catch {
      /* storage full or blocked: keep working in memory */
    }
  }

  private delay() {
    return this.latencyMs > 0 ? new Promise((r) => setTimeout(r, this.latencyMs)) : Promise.resolve()
  }

  /** Run `fn` after every previously queued write has finished. */
  private exclusive<T>(fn: () => T): Promise<T> {
    const run = this.queue.then(fn)
    this.queue = run.catch(() => undefined)
    return run
  }

  private slotsFor(q: SlotQuery): Slot[] {
    const services = this.db.services.filter((s) => s.active && q.serviceIds.includes(s.id))
    if (services.length !== q.serviceIds.length || services.length === 0) return []
    const candidates = staffForServices(this.db.staff, q.serviceIds)
    const staff: Staff[] = q.staffId === 'any' ? candidates : candidates.filter((s) => s.id === q.staffId)
    return computeSlots({
      date: q.date,
      durationMin: totalDuration(services),
      staff,
      hours: businessHours,
      policy: bookingPolicy,
      appointments: this.db.appointments,
      blocks: this.db.blocks,
      now: this.now(),
      excludeAppointmentId: q.excludeAppointmentId,
    })
  }

  private assertChangeAllowed(a: Appointment) {
    if (!isActiveStatus(a.status) || a.status === 'completed')
      throw new InvalidRequestError('Esta cita ya no se puede modificar.')
    if (Date.parse(a.startsAt) - this.now().getTime() < bookingPolicy.changeCutoffMin * 60000) {
      throw new ChangeWindowClosedError(bookingPolicy.changeCutoffMin / 60)
    }
  }

  async listServices(): Promise<ServiceCatalog> {
    await this.delay()
    return {
      categories: clone(this.db.categories).sort((a, b) => a.order - b.order),
      services: clone(this.db.services.filter((s) => s.active)).sort((a, b) => a.order - b.order),
    }
  }

  async listStaff(): Promise<Staff[]> {
    await this.delay()
    return clone(this.db.staff.filter((s) => s.active)).sort((a, b) => a.order - b.order)
  }

  async getAvailableSlots(q: SlotQuery): Promise<Slot[]> {
    await this.delay()
    return this.slotsFor(q)
  }

  async createAppointment(input: NewAppointment): Promise<Appointment> {
    await this.delay()
    return this.exclusive(() => {
      const phone = normalizeMxPhone(input.customer.phone)
      const email = input.customer.email.trim().toLowerCase()
      const name = input.customer.name.trim()
      if (!input.privacyAccepted) throw new InvalidRequestError('Acepta el aviso de privacidad para continuar.')
      if (!phone || !email || !name) throw new InvalidRequestError('Revisa tu nombre, teléfono y correo.')

      const services = this.db.services.filter((s) => s.active && input.serviceIds.includes(s.id))
      if (services.length === 0 || services.length !== input.serviceIds.length)
        throw new InvalidRequestError('Alguno de los servicios ya no está disponible.')

      const date = localDate(input.startsAt, businessHours.timeZone)
      const slots = this.slotsFor({ serviceIds: input.serviceIds, staffId: input.staffId, date })
      const slot = slots.find((s) => s.startsAt === input.startsAt)
      if (!slot?.available || !slot.staffId) throw new SlotUnavailableError(nearestAvailable(slots, input.startsAt))

      let customer = this.db.customers.find((c) => c.phone === phone || c.email === email)
      if (!customer) {
        customer = { id: `cust-${randomToken()}`, name, phone, email, createdAt: this.now().toISOString() }
        this.db.customers.push(customer)
      }
      const nowMs = this.now().getTime()
      const upcoming = this.db.appointments.filter(
        (a) =>
          a.customerId === customer.id &&
          (a.status === 'booked' || a.status === 'confirmed') &&
          Date.parse(a.startsAt) > nowMs,
      )
      if (upcoming.length >= bookingPolicy.maxActiveAppointmentsPerCustomer)
        throw new BookingLimitError(bookingPolicy.maxActiveAppointmentsPerCustomer)

      const card = this.cardFor(customer)
      const appt: Appointment = {
        id: `appt-${randomToken()}`,
        token: randomToken(),
        customerId: customer.id,
        customer: { name, phone, email },
        staffId: slot.staffId,
        serviceIds: services.map((s) => s.id),
        startsAt: slot.startsAt,
        endsAt: slot.endsAt,
        durationMin: totalDuration(services),
        totalPrice: services.reduce((t, s) => t + s.price, 0),
        status: 'booked',
        notes: input.notes.trim(),
        createdAt: this.now().toISOString(),
        loyaltyToken: card.token,
      }
      this.db.appointments.push(appt)
      this.save()
      return clone(appt)
    })
  }

  private cardFor(customer: Customer): LoyaltyCard {
    let card = this.db.loyalty.find((c) => c.customerId === customer.id)
    if (!card) {
      card = {
        token: randomToken(),
        customerId: customer.id,
        customerFirstName: customer.name.split(/\s+/)[0] ?? customer.name,
        stamps: 0,
        goal: bookingPolicy.loyaltyGoal,
        rewardExpiresAt: null,
      }
      this.db.loyalty.push(card)
    }
    return card
  }

  async getAppointmentByToken(token: string): Promise<Appointment | null> {
    await this.delay()
    const a = this.db.appointments.find((x) => x.token === token)
    return a ? clone(a) : null
  }

  async cancelAppointment(token: string): Promise<void> {
    await this.delay()
    return this.exclusive(() => {
      const a = this.db.appointments.find((x) => x.token === token)
      if (!a) throw new NotFoundError('esa cita')
      this.assertChangeAllowed(a)
      a.status = 'cancelled'
      this.save()
    })
  }

  async rescheduleAppointment(token: string, slot: Pick<Slot, 'startsAt'>): Promise<Appointment> {
    await this.delay()
    return this.exclusive(() => {
      const a = this.db.appointments.find((x) => x.token === token)
      if (!a) throw new NotFoundError('esa cita')
      this.assertChangeAllowed(a)
      const date = localDate(slot.startsAt, businessHours.timeZone)
      const slots = this.slotsFor({ serviceIds: a.serviceIds, staffId: a.staffId, date, excludeAppointmentId: a.id })
      const target = slots.find((s) => s.startsAt === slot.startsAt)
      if (!target?.available) throw new SlotUnavailableError(nearestAvailable(slots, slot.startsAt))
      a.startsAt = target.startsAt
      a.endsAt = target.endsAt
      a.status = 'booked'
      this.save()
      return clone(a)
    })
  }

  async getLoyaltyCardByToken(token: string): Promise<LoyaltyCard | null> {
    await this.delay()
    const c = this.db.loyalty.find((x) => x.token === token)
    return c ? clone(c) : null
  }
}

function safeLocalStorage(): Storage | null {
  try {
    return typeof window !== 'undefined' ? window.localStorage : null
  } catch {
    return null
  }
}
