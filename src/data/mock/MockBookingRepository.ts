import type {
  Appointment,
  AppointmentSource,
  Customer,
  ID,
  LoyaltyCard,
  NewAppointment,
  Slot,
  Staff,
  StaffChoice,
  TimeBlock,
} from '@/domain/types'
import { bookingPolicy, businessHours } from '@/config/business'
import { computeSlots, isActiveStatus, nearestAvailable, staffForServices, totalDuration } from '@/lib/availability'
import { addDays, localDate, toMinutes, weekdayOf, zonedInstant } from '@/lib/time'
import { normalizeMxPhone } from '@/lib/phone'
import type { BookingRepository, ServiceCatalog, SlotQuery } from '../BookingRepository'
import {
  BookingLimitError,
  ChangeWindowClosedError,
  InvalidRequestError,
  NotFoundError,
  SlotUnavailableError,
} from '../errors'
import { createSeed, DEMO_APPOINTMENT_TOKEN, MOCK_DB_VERSION, type MockDb } from './seed'

const STORAGE_KEY = 'havana:mock-db'

/** Staff may book from now on (no 1 h minimum) and up to 90 days ahead. */
const STAFF_POLICY = { ...bookingPolicy, minNoticeMin: 0, maxAdvanceDays: 90 }

/** Accent-insensitive lowercase, for searching names. */
const fold = (s: string) =>
  s
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()

/** End of a business-local day as an instant (rewards expire at the end of the day). */
const zonedEndOfDay = (date: string) => zonedInstant(date, '23:59', businessHours.timeZone).toISOString()

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

  /** Read-only copy of everything, for the admin's mock repository (same demo data as the public site). */
  snapshot(): MockDb {
    return clone(this.db)
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
      // Unknown shapes start over; older versions of this demo are refreshed like a new day.
      if (typeof data.version !== 'number' || data.version > MOCK_DB_VERSION) return null
      // The catalog (categories, services, staff with photos and order) always comes from
      // the current seed: asset URLs are hashed per build, so stored ones go stale.
      // Only bookings, customers, loyalty and blocks are kept from storage.
      const fresh = createSeed(this.now())
      if (data.seededOn === fresh.seededOn && data.version === MOCK_DB_VERSION) {
        return { ...data, categories: fresh.categories, services: fresh.services, staff: fresh.staff }
      }
      return refreshDemo(data, fresh)
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

  private slotsFor(q: SlotQuery, policy = bookingPolicy): Slot[] {
    const services = this.db.services.filter((s) => s.active && q.serviceIds.includes(s.id))
    if (services.length !== q.serviceIds.length || services.length === 0) return []
    const candidates = staffForServices(this.db.staff, q.serviceIds)
    const staff: Staff[] = q.staffId === 'any' ? candidates : candidates.filter((s) => s.id === q.staffId)
    return computeSlots({
      date: q.date,
      durationMin: totalDuration(services),
      staff,
      hours: businessHours,
      policy,
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

  // ── Staff actions (admin panel) ────────────────────────────────────────────
  // Same rules the Supabase backend will enforce. Staff can book on short notice
  // and further ahead than customers, but never double-book a barber.

  adminSlots(q: SlotQuery): Slot[] {
    return this.slotsFor(q, STAFF_POLICY)
  }

  async adminSetStatus(
    id: ID,
    status: 'confirmed' | 'completed' | 'no_show' | 'cancelled',
  ): Promise<{ appointment: Appointment; loyalty: LoyaltyCard | null; stampAdded: boolean }> {
    await this.delay()
    return this.exclusive(() => {
      const a = this.db.appointments.find((x) => x.id === id)
      if (!a) throw new NotFoundError('esa cita')
      if (a.status !== 'booked' && a.status !== 'confirmed') throw new InvalidRequestError('Esta cita ya está cerrada.')
      const now = this.now().getTime()
      const start = Date.parse(a.startsAt)
      if (status === 'confirmed' && a.status === 'confirmed')
        throw new InvalidRequestError('La cita ya está confirmada.')
      if (status === 'completed' && now < start)
        throw new InvalidRequestError('Solo puedes completar una cita cuando ya empezó.')
      if (status === 'no_show' && now < start + bookingPolicy.toleranceMin * 60000)
        throw new InvalidRequestError(`Marca no-show después de ${bookingPolicy.toleranceMin} minutos de tolerancia.`)
      a.status = status

      // The stamp is earned when the appointment is completed, if a service counts.
      let stampAdded = false
      let card = this.db.loyalty.find((c) => c.customerId === a.customerId) ?? null
      const eligible = this.db.services.some((sv) => a.serviceIds.includes(sv.id) && sv.loyaltyEligible)
      if (status === 'completed' && eligible) {
        const customer = this.db.customers.find((c) => c.id === a.customerId)
        if (customer) {
          card = this.cardFor(customer)
          if (card.stamps < card.goal) {
            card.stamps += 1
            stampAdded = true
            if (card.stamps === card.goal) {
              const until = addDays(localDate(this.now(), businessHours.timeZone), bookingPolicy.rewardValidityDays)
              card.rewardExpiresAt = zonedEndOfDay(until)
            }
          }
          a.loyaltyToken = card.token
        }
      }
      this.save()
      return { appointment: clone(a), loyalty: card ? clone(card) : null, stampAdded }
    })
  }

  async adminCreateAppointment(input: {
    serviceIds: ID[]
    staffId: StaffChoice
    startsAt: string
    customer: { id: ID } | { name: string; phone: string; email: string }
    notes: string
    source: Exclude<AppointmentSource, 'online'>
  }): Promise<Appointment> {
    await this.delay()
    return this.exclusive(() => {
      const services = this.db.services.filter((s) => s.active && input.serviceIds.includes(s.id))
      if (services.length === 0 || services.length !== input.serviceIds.length)
        throw new InvalidRequestError('Elige al menos un servicio.')
      const durationMin = totalDuration(services)
      const startsAt = new Date(input.startsAt).toISOString()
      const endsAt = new Date(Date.parse(startsAt) + durationMin * 60000).toISOString()

      let staffId: ID | null
      if (input.source === 'walk_in') {
        // Walk-in: right now, with whoever is free (or the chosen barber), even off the 15-min grid.
        const candidates = staffForServices(this.db.staff, input.serviceIds).filter(
          (s) => input.staffId === 'any' || s.id === input.staffId,
        )
        staffId =
          candidates.find((s) => this.isWorking(s, startsAt, endsAt) && !this.conflicts(s.id, startsAt, endsAt))?.id ??
          null
        if (!staffId) throw new SlotUnavailableError([])
      } else {
        const date = localDate(startsAt, businessHours.timeZone)
        const slots = this.adminSlots({ serviceIds: input.serviceIds, staffId: input.staffId, date })
        const slot = slots.find((x) => x.startsAt === startsAt)
        if (!slot?.available || !slot.staffId) throw new SlotUnavailableError(nearestAvailable(slots, startsAt))
        staffId = slot.staffId
      }

      const customer = this.resolveCustomer(input.customer, input.source === 'walk_in')
      const card = this.db.loyalty.find((c) => c.customerId === customer.id)
      const appt: Appointment = {
        id: `appt-${randomToken()}`,
        token: randomToken(),
        customerId: customer.id,
        customer: { name: customer.name, phone: customer.phone, email: customer.email },
        staffId,
        serviceIds: services.map((x) => x.id),
        startsAt,
        endsAt,
        durationMin,
        totalPrice: services.reduce((t, x) => t + x.price, 0),
        status: 'confirmed',
        notes: input.notes.trim(),
        createdAt: this.now().toISOString(),
        loyaltyToken: card?.token ?? null,
        source: input.source,
      }
      this.db.appointments.push(appt)
      this.save()
      return clone(appt)
    })
  }

  async adminReschedule(id: ID, change: { startsAt: string; staffId: ID }): Promise<Appointment> {
    await this.delay()
    return this.exclusive(() => {
      const a = this.db.appointments.find((x) => x.id === id)
      if (!a) throw new NotFoundError('esa cita')
      if (a.status !== 'booked' && a.status !== 'confirmed') throw new InvalidRequestError('Esta cita ya está cerrada.')
      const date = localDate(change.startsAt, businessHours.timeZone)
      const slots = this.adminSlots({
        serviceIds: a.serviceIds,
        staffId: change.staffId,
        date,
        excludeAppointmentId: a.id,
      })
      const target = slots.find((x) => x.startsAt === change.startsAt)
      if (!target?.available || !target.staffId)
        throw new SlotUnavailableError(nearestAvailable(slots, change.startsAt))
      a.startsAt = target.startsAt
      a.endsAt = target.endsAt
      a.staffId = target.staffId
      this.save()
      return clone(a)
    })
  }

  async adminUpdateNotes(id: ID, notes: string): Promise<Appointment> {
    await this.delay()
    return this.exclusive(() => {
      const a = this.db.appointments.find((x) => x.id === id)
      if (!a) throw new NotFoundError('esa cita')
      a.notes = notes.trim()
      this.save()
      return clone(a)
    })
  }

  async adminCreateBlock(input: Omit<TimeBlock, 'id'>): Promise<TimeBlock> {
    await this.delay()
    return this.exclusive(() => {
      const reason = input.reason.trim()
      if (!reason) throw new InvalidRequestError('Escribe el motivo del bloqueo.')
      if (Date.parse(input.endsAt) <= Date.parse(input.startsAt))
        throw new InvalidRequestError('La hora de fin debe ser después del inicio.')
      const clash = this.db.appointments.filter(
        (a) =>
          (a.status === 'booked' || a.status === 'confirmed') &&
          (input.staffId === null || a.staffId === input.staffId) &&
          a.startsAt < input.endsAt &&
          input.startsAt < a.endsAt,
      )
      if (clash.length)
        throw new InvalidRequestError(
          clash.length === 1
            ? 'Hay 1 cita en ese horario. Reprográmala o cancélala antes de bloquear.'
            : `Hay ${clash.length} citas en ese horario. Reprográmalas o cancélalas antes de bloquear.`,
        )
      const block: TimeBlock = { ...input, reason, id: `block-${randomToken()}` }
      this.db.blocks.push(block)
      this.save()
      return clone(block)
    })
  }

  async adminDeleteBlock(id: ID): Promise<void> {
    await this.delay()
    return this.exclusive(() => {
      const i = this.db.blocks.findIndex((b) => b.id === id)
      if (i < 0) throw new NotFoundError('ese bloqueo')
      this.db.blocks.splice(i, 1)
      this.save()
    })
  }

  async adminFindCustomers(query: string): Promise<Customer[]> {
    await this.delay()
    const q = fold(query.trim())
    const digits = query.replace(/\D/g, '')
    if (q.length < 2 && digits.length < 3) return []
    return clone(
      this.db.customers
        .filter((c) => fold(c.name).includes(q) || (digits.length >= 3 && c.phone.includes(digits)))
        .slice(0, 8),
    )
  }

  async adminLoyaltyFor(customerId: ID): Promise<LoyaltyCard | null> {
    await this.delay()
    const c = this.db.loyalty.find((x) => x.customerId === customerId)
    return c ? clone(c) : null
  }

  /** Whether [start, end) falls inside one of the barber's working ranges that day. */
  private isWorking(s: Staff, startsAt: string, endsAt: string) {
    const tz = businessHours.timeZone
    const date = localDate(startsAt, tz)
    if (localDate(endsAt, tz) !== date) return false
    const dayStart = zonedInstant(date, '00:00', tz).getTime()
    const from = (Date.parse(startsAt) - dayStart) / 60000
    const to = (Date.parse(endsAt) - dayStart) / 60000
    return (s.schedule[weekdayOf(date)] ?? []).some((r) => from >= toMinutes(r.start) && to <= toMinutes(r.end))
  }

  /** Active appointments or blocks overlapping [start, end) for a barber. */
  private conflicts(staffId: ID, startsAt: string, endsAt: string, excludeId?: ID) {
    return (
      this.db.appointments.some(
        (a) =>
          a.id !== excludeId &&
          a.staffId === staffId &&
          isActiveStatus(a.status) &&
          a.startsAt < endsAt &&
          startsAt < a.endsAt,
      ) ||
      this.db.blocks.some(
        (b) => (b.staffId === null || b.staffId === staffId) && b.startsAt < endsAt && startsAt < b.endsAt,
      )
    )
  }

  private resolveCustomer(c: { id: ID } | { name: string; phone: string; email: string }, walkIn: boolean): Customer {
    if ('id' in c) {
      const found = this.db.customers.find((x) => x.id === c.id)
      if (!found) throw new NotFoundError('ese cliente')
      return found
    }
    const name = c.name.trim()
    if (!name) throw new InvalidRequestError('Escribe el nombre del cliente.')
    const phone = c.phone.trim() ? normalizeMxPhone(c.phone) : ''
    if (phone === null) throw new InvalidRequestError('Revisa el teléfono: 10 dígitos.')
    if (!phone && !walkIn) throw new InvalidRequestError('El teléfono es obligatorio para agendar.')
    const email = c.email.trim().toLowerCase()
    const existing = this.db.customers.find((x) => (phone && x.phone === phone) || (email && x.email === email))
    if (existing) return existing
    const customer: Customer = { id: `cust-${randomToken()}`, name, phone, email, createdAt: this.now().toISOString() }
    this.db.customers.push(customer)
    return customer
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

/**
 * A new day: reseed the sample agenda (so "today" always has appointments) but keep
 * what people actually booked in the demo, their customers and loyalty cards.
 * Seeded appointments that would overlap a kept booking are dropped.
 */
function refreshDemo(stored: MockDb, fresh: MockDb): MockDb {
  const own = stored.appointments.filter((a) => !a.token.startsWith('seed-') && a.token !== DEMO_APPOINTMENT_TOKEN)
  const overlaps = (a: Appointment) =>
    own.some(
      (o) => isActiveStatus(o.status) && o.staffId === a.staffId && a.startsAt < o.endsAt && o.startsAt < a.endsAt,
    )
  const ownCustomers = new Set(own.map((a) => a.customerId))
  const freshIds = new Set(fresh.customers.map((c) => c.id))
  const freshCards = new Set(fresh.loyalty.map((l) => l.token))
  return {
    ...fresh,
    appointments: [...fresh.appointments.filter((a) => !overlaps(a)), ...own],
    customers: [...fresh.customers, ...stored.customers.filter((c) => ownCustomers.has(c.id) && !freshIds.has(c.id))],
    loyalty: [...fresh.loyalty, ...stored.loyalty.filter((l) => !freshCards.has(l.token))],
  }
}
