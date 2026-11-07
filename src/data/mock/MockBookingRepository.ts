import type {
  Appointment,
  StaffCommission,
  AppointmentPayment,
  SoldProduct,
  AppointmentSource,
  Customer,
  ID,
  LoyaltyCard,
  NewAppointment,
  PaymentMethod,
  Product,
  Service,
  ServiceCategory,
  Slot,
  Staff,
  StaffChoice,
  TimeBlock,
  WeeklySchedule,
  BookingPolicy,
} from '@/domain/types'
import { bookingPolicy, businessHours } from '@/config/business'
import { computeSlots, isActiveStatus, nearestAvailable, staffForServices, totalDuration } from '@/lib/availability'
import { addDays, localDate, toMinutes, weekdayOf, zonedInstant } from '@/lib/time'
import { normalizeMxPhone } from '@/lib/phone'
import { DAY_NAMES, outsideSchedule, scheduleErrors } from '@/lib/schedule'
import { policyError } from '@/lib/policy'
import { rewardAvailable, rewardFor } from '@/lib/loyalty'
import { cashSummary } from '@/admin/cash'
import {
  defaultFinanceSettings,
  earnings,
  expectedCash,
  financeSettingsError,
  type Advance,
  type BonusAward,
  type CashMove,
  type DailyClose,
  type FinanceSettings,
  type PayrollClose,
  type ProductSale,
} from '@/admin/finance'
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

/** What the panel sends when completing an appointment (discount already authorized). */
export interface CompletePayment {
  method: PaymentMethod
  tip: number
  tipMethod: PaymentMethod
  useReward?: boolean
  splits?: { method: PaymentMethod; amount: number }[]
  products?: { productId: ID; qty: number }[]
  discount?: { amount: number; reason: string; authorizedBy: ID; authorizedByName: string }
}

/** Accent-insensitive lowercase, for searching names. */
const fold = (s: string) =>
  s
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()

/** End of a business-local day as an instant (rewards expire at the end of the day). */
const zonedEndOfDay = (date: string) => zonedInstant(date, '23:59', businessHours.timeZone).toISOString()

/** What a write changed; new appointments are listed so the panel can announce them. */
export interface MockChange {
  created: Appointment[]
}

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
      // Staff profiles (photo URLs are hashed per build) come from the seed; the catalog is kept (keepCatalog).
      const fresh = createSeed(this.now())
      if (data.seededOn === fresh.seededOn && data.version === MOCK_DB_VERSION) {
        return { ...data, ...keepCatalog(data, fresh) }
      }
      return refreshDemo(data, fresh)
    } catch {
      return null
    }
  }

  /** Persist and tell listeners (the admin panel) what changed. */
  private save(created: Appointment[] = []) {
    try {
      this.storage?.setItem(STORAGE_KEY, JSON.stringify(this.db))
    } catch {
      /* storage full or blocked: keep working in memory */
    }
    this.emit(created)
  }

  // ── Change notifications ──────────────────────────────────────────────────
  // Stand-in for Supabase Realtime: listeners hear about every write in this
  // tab, and about writes from other tabs of the same browser (storage event).

  private listeners = new Set<(change: MockChange) => void>()

  onChange(listener: (change: MockChange) => void): () => void {
    this.listeners.add(listener)
    if (this.listeners.size === 1 && typeof window !== 'undefined') window.addEventListener('storage', this.onStorage)
    return () => {
      this.listeners.delete(listener)
      if (this.listeners.size === 0 && typeof window !== 'undefined')
        window.removeEventListener('storage', this.onStorage)
    }
  }

  private emit(created: Appointment[]) {
    if (!this.listeners) return // during construction
    for (const l of this.listeners) l({ created: clone(created) })
  }

  private onStorage = (e: StorageEvent) => {
    if (e.key !== STORAGE_KEY || !e.newValue || !this.storage) return
    const before = new Set(this.db.appointments.map((a) => a.id))
    const next = this.load()
    if (!next) return
    this.db = next
    this.emit(next.appointments.filter((a) => !before.has(a.id)))
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

  /** Booking and loyalty rules as edited in Ajustes (config/business has the defaults). */
  private get policy(): BookingPolicy {
    return this.db.policy ?? bookingPolicy
  }

  async getPolicy(): Promise<BookingPolicy> {
    return clone(this.policy)
  }

  private slotsFor(q: SlotQuery, policy = this.policy): Slot[] {
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
    if (Date.parse(a.startsAt) - this.now().getTime() < this.policy.changeCutoffMin * 60000) {
      throw new ChangeWindowClosedError(this.policy.changeCutoffMin / 60)
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
      if (upcoming.length >= this.policy.maxActiveAppointmentsPerCustomer)
        throw new BookingLimitError(this.policy.maxActiveAppointmentsPerCustomer)

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
        // Online bookings are confirmed right away: the shop does not confirm by hand.
        status: 'confirmed',
        notes: input.notes.trim(),
        createdAt: this.now().toISOString(),
        loyaltyToken: card.token,
        source: 'online',
      }
      this.db.appointments.push(appt)
      this.save([appt])
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
        goal: this.policy.loyaltyGoal,
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
      a.status = 'confirmed'
      this.save()
      return clone(a)
    })
  }

  // ── Staff actions (admin panel) ────────────────────────────────────────────
  // Same rules the Supabase backend will enforce. Staff can book on short notice
  // and further ahead than customers, but never double-book a barber.

  /** Staff may book from now on (no minimum notice) and up to 90 days ahead. */
  adminSlots(q: SlotQuery): Slot[] {
    return this.slotsFor(q, { ...this.policy, minNoticeMin: 0, maxAdvanceDays: 90 })
  }

  /**
   * Confirm, mark no-show, cancel, or complete. Completing requires the payment
   * (method and tip): it feeds the daily cash count and, later, finance.
   */
  async adminSetStatus(
    id: ID,
    status: 'confirmed' | 'completed' | 'no_show' | 'cancelled',
    payment?: CompletePayment,
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
      if (status === 'no_show' && now < start + this.policy.toleranceMin * 60000)
        throw new InvalidRequestError(`Marca no-show después de ${this.policy.toleranceMin} minutos de tolerancia.`)
      if (status === 'completed') a.payment = this.buildPayment(a, payment)
      a.status = status

      // The stamp is earned when the appointment is completed, if a service counts.
      let stampAdded = false
      let card = this.db.loyalty.find((c) => c.customerId === a.customerId) ?? null
      const eligible = this.db.services.some((sv) => a.serviceIds.includes(sv.id) && sv.loyaltyEligible)
      if (status === 'completed' && eligible && !a.payment?.rewardServiceId) {
        const customer = this.db.customers.find((c) => c.id === a.customerId)
        if (customer) {
          card = this.cardFor(customer)
          if (card.stamps < card.goal) {
            card.stamps += 1
            stampAdded = true
            if (card.stamps === card.goal) {
              const until = addDays(localDate(this.now(), businessHours.timeZone), this.policy.rewardValidityDays)
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

  /**
   * The ticket of a completed appointment: services (minus the free cut and an
   * authorized discount), products sold with it, the tip and how it was paid
   * (one method or split). Validates everything before touching the loyalty card.
   */
  private buildPayment(a: Appointment, payment: CompletePayment | undefined): AppointmentPayment {
    const methods: PaymentMethod[] = ['cash', 'card', 'transfer']
    if (!payment || !methods.includes(payment.method)) throw new InvalidRequestError('Elige cómo pagó.')
    if (!Number.isInteger(payment.tip) || payment.tip < 0 || payment.tip > 100000)
      throw new InvalidRequestError('Escribe la propina en pesos, sin centavos.')
    if (payment.tip > 0 && !methods.includes(payment.tipMethod))
      throw new InvalidRequestError('Elige cómo dejó la propina.')

    let amount = a.totalPrice
    let reward: { service: Service; amount: number } | null = null
    const card = this.db.loyalty.find((c) => c.customerId === a.customerId)
    if (payment.useReward) {
      if (!rewardAvailable(card, this.now()))
        throw new InvalidRequestError('Este cliente no tiene un corte gratis vigente.')
      reward = rewardFor(a.serviceIds, this.db.services)
      if (!reward) throw new InvalidRequestError('No hay un servicio al que aplicar el corte gratis.')
      amount -= reward.amount
    }

    const d = payment.discount
    if (d) {
      if (!Number.isInteger(d.amount) || d.amount <= 0)
        throw new InvalidRequestError('Escribe el descuento en pesos, sin centavos.')
      if (d.amount > amount) throw new InvalidRequestError('El descuento no puede ser mayor a lo que se cobra.')
      if (!d.reason.trim()) throw new InvalidRequestError('Escribe el motivo del descuento.')
      if (!d.authorizedBy) throw new InvalidRequestError('El descuento necesita la autorización del dueño o gerente.')
      amount -= d.amount
    }

    const products: SoldProduct[] = (payment.products ?? [])
      .filter((i) => i.qty > 0)
      .map((i) => {
        const p = this.db.products.find((x) => x.id === i.productId && x.active)
        if (!p) throw new InvalidRequestError('Alguno de los productos ya no está a la venta.')
        if (!Number.isInteger(i.qty) || i.qty > 99) throw new InvalidRequestError('Revisa las cantidades.')
        return { productId: p.id, name: p.name, qty: i.qty, price: p.price, commission: p.commission }
      })
    const charge = amount + products.reduce((t, i) => t + i.price * i.qty, 0)

    let method = payment.method
    let splits: { method: PaymentMethod; amount: number }[] | undefined
    if (payment.splits?.length) {
      splits = payment.splits.filter((x) => x.amount > 0)
      if (splits.length < 2) throw new InvalidRequestError('Un pago mixto necesita al menos dos formas de pago.')
      if (new Set(splits.map((x) => x.method)).size !== splits.length)
        throw new InvalidRequestError('Usa cada forma de pago una sola vez.')
      if (splits.some((x) => !methods.includes(x.method) || !Number.isInteger(x.amount)))
        throw new InvalidRequestError('Revisa los montos del pago mixto.')
      if (splits.reduce((t, x) => t + x.amount, 0) !== charge)
        throw new InvalidRequestError(`El pago mixto debe sumar ${charge} pesos.`)
      method = [...splits].sort((x, y) => y.amount - x.amount)[0]!.method
    }

    // Everything checked: redeem the reward (the card starts over; this visit adds no stamp).
    if (reward && card) {
      card.stamps = 0
      card.rewardExpiresAt = null
    }
    return {
      method,
      amount,
      tip: payment.tip,
      tipMethod: payment.tip > 0 ? payment.tipMethod : method,
      paidAt: this.now().toISOString(),
      ...(reward ? { rewardServiceId: reward.service.id, rewardAmount: reward.amount } : {}),
      ...(splits ? { splits } : {}),
      ...(products.length ? { products } : {}),
      ...(d
        ? {
            discount: {
              amount: d.amount,
              reason: d.reason.trim(),
              authorizedBy: d.authorizedBy,
              authorizedByName: d.authorizedByName,
            },
          }
        : {}),
    }
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
      this.save([appt])
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

  // ── Catalog (services and categories) ─────────────────────────────────────

  adminCatalog() {
    const catOrder = new Map(this.db.categories.map((c) => [c.id, c.order]))
    const services = [...this.db.services].sort(
      (a, b) => (catOrder.get(a.categoryId) ?? 99) - (catOrder.get(b.categoryId) ?? 99) || a.order - b.order,
    )
    const staff = [...this.db.staff].sort((a, b) => a.order - b.order)
    const staffFor: Record<ID, ID[]> = {}
    for (const sv of services)
      staffFor[sv.id] = staff
        .filter((st) => st.serviceIds === 'all' || st.serviceIds.includes(sv.id))
        .map((st) => st.id)
    const usage: Record<ID, number> = {}
    for (const a of this.db.appointments) for (const id of a.serviceIds) usage[id] = (usage[id] ?? 0) + 1
    return clone({
      categories: [...this.db.categories].sort((a, b) => a.order - b.order),
      services,
      staff,
      staffFor,
      usage,
    })
  }

  async adminSaveService(input: {
    id?: ID
    categoryId: ID
    name: string
    description: string
    durationMin: number
    price: number
    loyaltyEligible: boolean
    active: boolean
    staffIds: ID[]
  }): Promise<Service> {
    await this.delay()
    return this.exclusive(() => {
      const name = input.name.trim().replace(/\s+/g, ' ')
      if (!name) throw new InvalidRequestError('Escribe el nombre del servicio.')
      if (this.db.services.some((x) => x.id !== input.id && fold(x.name) === fold(name)))
        throw new InvalidRequestError('Ya existe un servicio con ese nombre.')
      if (!this.db.categories.some((c) => c.id === input.categoryId))
        throw new InvalidRequestError('Elige una categoría.')
      if (
        !Number.isInteger(input.durationMin) ||
        input.durationMin < 15 ||
        input.durationMin > 240 ||
        input.durationMin % 15
      )
        throw new InvalidRequestError('La duración va de 15 min a 4 h, en pasos de 15 min.')
      if (!Number.isInteger(input.price) || input.price < 0 || input.price > 20000)
        throw new InvalidRequestError('Escribe el precio en pesos, sin centavos.')
      const staffIds = input.staffIds.filter((id) => this.db.staff.some((st) => st.id === id))
      if (input.active && staffIds.length === 0)
        throw new InvalidRequestError('Elige al menos un barbero que realice el servicio.')

      const existing = input.id ? this.db.services.find((x) => x.id === input.id) : undefined
      if (input.id && !existing) throw new NotFoundError('ese servicio')
      const lastIn = (categoryId: ID) =>
        Math.max(0, ...this.db.services.filter((x) => x.categoryId === categoryId).map((x) => x.order)) + 1
      let svc: Service
      if (!existing) {
        svc = { id: this.uniqueId(name, this.db.services), order: lastIn(input.categoryId) } as Service
        this.db.services.push(svc)
      } else {
        svc = existing
        if (svc.categoryId !== input.categoryId) svc.order = lastIn(input.categoryId)
      }
      Object.assign(svc, {
        categoryId: input.categoryId,
        name,
        description: input.description.trim(),
        durationMin: input.durationMin,
        price: input.price,
        loyaltyEligible: input.loyaltyEligible,
        active: input.active,
      })
      this.assignStaff(svc.id, staffIds)
      this.save()
      return clone(svc)
    })
  }

  async adminDeleteService(id: ID): Promise<void> {
    await this.delay()
    return this.exclusive(() => {
      const i = this.db.services.findIndex((x) => x.id === id)
      if (i < 0) throw new NotFoundError('ese servicio')
      const used = this.db.appointments.filter((a) => a.serviceIds.includes(id)).length
      if (used)
        throw new InvalidRequestError(
          `Tiene ${used} ${used === 1 ? 'cita' : 'citas'} en el historial. Ocúltalo en lugar de borrarlo.`,
        )
      this.db.services.splice(i, 1)
      for (const st of this.db.staff) if (st.serviceIds !== 'all') st.serviceIds = st.serviceIds.filter((x) => x !== id)
      this.save()
    })
  }

  /** Move a service up or down within its category (the order the site shows). */
  async adminMoveService(id: ID, dir: -1 | 1): Promise<void> {
    await this.delay()
    return this.exclusive(() => {
      const svc = this.db.services.find((x) => x.id === id)
      if (!svc) throw new NotFoundError('ese servicio')
      const list = this.db.services.filter((x) => x.categoryId === svc.categoryId).sort((a, b) => a.order - b.order)
      swapOrder(list, list.indexOf(svc), dir)
      this.save()
    })
  }

  async adminSaveCategory(input: { id?: ID; name: string }): Promise<ServiceCategory> {
    await this.delay()
    return this.exclusive(() => {
      const name = input.name.trim().replace(/\s+/g, ' ')
      if (!name) throw new InvalidRequestError('Escribe el nombre de la categoría.')
      if (this.db.categories.some((c) => c.id !== input.id && fold(c.name) === fold(name)))
        throw new InvalidRequestError('Ya existe una categoría con ese nombre.')
      let cat = input.id ? this.db.categories.find((c) => c.id === input.id) : undefined
      if (input.id && !cat) throw new NotFoundError('esa categoría')
      if (!cat) {
        cat = {
          id: this.uniqueId(name, this.db.categories),
          name,
          order: Math.max(0, ...this.db.categories.map((c) => c.order)) + 1,
        }
        this.db.categories.push(cat)
      } else cat.name = name
      this.save()
      return clone(cat)
    })
  }

  async adminMoveCategory(id: ID, dir: -1 | 1): Promise<void> {
    await this.delay()
    return this.exclusive(() => {
      const list = [...this.db.categories].sort((a, b) => a.order - b.order)
      const i = list.findIndex((c) => c.id === id)
      if (i < 0) throw new NotFoundError('esa categoría')
      swapOrder(list, i, dir)
      this.save()
    })
  }

  async adminDeleteCategory(id: ID): Promise<void> {
    await this.delay()
    return this.exclusive(() => {
      const i = this.db.categories.findIndex((c) => c.id === id)
      if (i < 0) throw new NotFoundError('esa categoría')
      const inside = this.db.services.filter((x) => x.categoryId === id).length
      if (inside)
        throw new InvalidRequestError(
          `Tiene ${inside} ${inside === 1 ? 'servicio' : 'servicios'}. Muévelos a otra categoría antes de borrarla.`,
        )
      this.db.categories.splice(i, 1)
      this.save()
    })
  }

  // ── Team (barbers, schedules, services, commissions) ──────────────────────

  // ── Finance preview (phase 2) ─────────────────────────────────────────────

  /** Everything finance needs for a period (local dates, inclusive). */
  adminFinance(from: string, to: string) {
    const tz = businessHours.timeZone
    return clone({
      appointments: this.db.appointments.filter((a) => {
        const d = localDate(a.startsAt, tz)
        return d >= from && d <= to
      }),
      services: this.db.services,
      staff: [...this.db.staff].sort((a, b) => a.order - b.order),
      commissions: this.db.commissions,
      commissionHistory: this.db.commissionHistory ?? [],
      advances: (this.db.advances ?? []).filter((x) => x.date >= from && x.date <= to),
      settings: { ...defaultFinanceSettings(), ...this.db.finance },
      close: (this.db.payrollCloses ?? []).find((c) => c.weekStart === from) ?? null,
      bonusAwards: (this.db.bonusAwards ?? []).filter((x) => x.weekStart >= from && x.weekStart <= to),
      sales: (this.db.sales ?? []).filter((x) => {
        const d = localDate(x.at, tz)
        return d >= from && d <= to
      }),
    })
  }

  async adminAddAdvance(input: { staffId: ID; date: string; amount: number; note: string }): Promise<Advance> {
    await this.delay()
    return this.exclusive(() => {
      if (!this.db.staff.some((s) => s.id === input.staffId)) throw new NotFoundError('ese barbero')
      this.assertWeekOpen(input.date)
      if (!Number.isInteger(input.amount) || input.amount <= 0 || input.amount > 100000)
        throw new InvalidRequestError('Escribe el anticipo en pesos, sin centavos.')
      const advance: Advance = { id: `adv-${randomToken()}`, ...input, note: input.note.trim() }
      ;(this.db.advances ??= []).push(advance)
      this.save()
      return clone(advance)
    })
  }

  /** Register a counter sale of products. Prices and commissions come from the catalog. */
  async adminCreateSale(input: {
    items: { productId: ID; qty: number }[]
    staffId: ID | null
    method: PaymentMethod
  }): Promise<ProductSale> {
    await this.delay()
    return this.exclusive(() => {
      const items = input.items
        .filter((i) => i.qty > 0)
        .map((i) => {
          const p = this.db.products.find((x) => x.id === i.productId && x.active)
          if (!p) throw new InvalidRequestError('Alguno de los productos ya no está a la venta.')
          if (!Number.isInteger(i.qty) || i.qty > 99) throw new InvalidRequestError('Revisa las cantidades.')
          return { productId: p.id, name: p.name, qty: i.qty, price: p.price, commission: p.commission }
        })
      if (!items.length) throw new InvalidRequestError('Agrega al menos un producto.')
      if (!['cash', 'card', 'transfer'].includes(input.method)) throw new InvalidRequestError('Elige cómo pagó.')
      if (input.staffId && !this.db.staff.some((s) => s.id === input.staffId)) throw new NotFoundError('ese barbero')
      const sale: ProductSale = {
        id: `sale-${randomToken()}`,
        at: this.now().toISOString(),
        items,
        staffId: input.staffId,
        method: input.method,
        total: items.reduce((t, i) => t + i.price * i.qty, 0),
      }
      ;(this.db.sales ??= []).push(sale)
      this.save()
      return clone(sale)
    })
  }

  // ── Payroll weeks ─────────────────────────────────────────────────────────

  private assertWeekOpen(date: string) {
    if ((this.db.payrollCloses ?? []).some((c) => date >= c.weekStart && date <= c.weekEnd))
      throw new InvalidRequestError('Esa semana de nómina ya está cerrada.')
  }

  /** Freeze the week's receipts as they are now (computed here, never trusted from the screen). */
  async adminCloseWeek(weekStart: string, closedBy: string): Promise<PayrollClose> {
    await this.delay()
    return this.exclusive(() => {
      if ((this.db.payrollCloses ?? []).some((c) => c.weekStart === weekStart))
        throw new InvalidRequestError('Esa semana ya está cerrada.')
      const weekEnd = addDays(weekStart, 6)
      const data = this.adminFinance(weekStart, weekEnd)
      const rows = earnings({
        ...data,
        bonusRules: data.settings.bonuses,
        discountCommission: data.settings.discountCommission,
        from: weekStart,
        to: weekEnd,
        timeZone: businessHours.timeZone,
      }).filter((r) => r.services > 0 || r.advances > 0 || r.bonusTotal > 0 || r.products > 0)
      const close: PayrollClose = { weekStart, weekEnd, closedAt: this.now().toISOString(), closedBy, rows, paid: {} }
      ;(this.db.payrollCloses ??= []).push(close)
      this.save()
      return clone(close)
    })
  }

  async adminMarkPaid(weekStart: string, staffId: ID, paid: boolean, by: string): Promise<void> {
    await this.delay()
    return this.exclusive(() => {
      const c = (this.db.payrollCloses ?? []).find((x) => x.weekStart === weekStart)
      if (!c) throw new InvalidRequestError('Cierra la semana antes de marcar pagos.')
      if (paid) c.paid[staffId] = { at: this.now().toISOString(), by }
      else delete c.paid[staffId]
      this.save()
    })
  }

  async adminReopenWeek(weekStart: string): Promise<void> {
    await this.delay()
    return this.exclusive(() => {
      this.db.payrollCloses = (this.db.payrollCloses ?? []).filter((c) => c.weekStart !== weekStart)
      this.save()
    })
  }

  // ── Daily cash (caja del día) ──────────────────────────────────────────────

  adminCashDay(date: string) {
    const tz = businessHours.timeZone
    return clone({
      date,
      appointments: this.db.appointments.filter(
        (a) => a.status === 'completed' && a.payment && localDate(a.payment.paidAt, tz) === date,
      ),
      sales: (this.db.sales ?? []).filter((s) => localDate(s.at, tz) === date),
      moves: (this.db.cashMoves ?? []).filter((m) => m.date === date),
      close: (this.db.dailyCloses ?? []).find((c) => c.date === date) ?? null,
    })
  }

  private assertDayOpen(date: string) {
    if ((this.db.dailyCloses ?? []).some((c) => c.date === date))
      throw new InvalidRequestError('La caja de ese día ya está cerrada. Reábrela para hacer cambios.')
  }

  async adminAddCashMove(input: Omit<CashMove, 'id' | 'at'>): Promise<CashMove> {
    await this.delay()
    return this.exclusive(() => {
      this.assertDayOpen(input.date)
      if (!Number.isInteger(input.amount) || input.amount <= 0 || input.amount > 1000000)
        throw new InvalidRequestError('Escribe el monto en pesos, sin centavos.')
      if (!input.concept.trim()) throw new InvalidRequestError('Escribe el concepto.')
      const move: CashMove = {
        ...input,
        concept: input.concept.trim(),
        id: `mov-${randomToken()}`,
        at: this.now().toISOString(),
      }
      ;(this.db.cashMoves ??= []).push(move)
      this.save()
      return clone(move)
    })
  }

  async adminDeleteCashMove(id: ID): Promise<void> {
    await this.delay()
    return this.exclusive(() => {
      const m = (this.db.cashMoves ?? []).find((x) => x.id === id)
      if (!m) return
      this.assertDayOpen(m.date)
      this.db.cashMoves = this.db.cashMoves.filter((x) => x.id !== id)
      this.save()
    })
  }

  /** Close the drawer: the expected cash is worked out here, never trusted from the screen. */
  async adminCloseDay(input: {
    date: string
    openingFund: number
    counted: number
    note: string
    closedBy: string
  }): Promise<DailyClose> {
    await this.delay()
    return this.exclusive(() => {
      this.assertDayOpen(input.date)
      for (const [v, label] of [
        [input.openingFund, 'el fondo inicial'],
        [input.counted, 'el efectivo contado'],
      ] as const)
        if (!Number.isInteger(v) || v < 0 || v > 1000000) throw new InvalidRequestError(`Revisa ${label}.`)
      const day = this.adminCashDay(input.date)
      const cash = cashSummary(day.appointments, day.sales)
      const { expected } = expectedCash({
        openingFund: input.openingFund,
        cashCharges: cash.charges.cash,
        cashTips: cash.tips.cash,
        moves: day.moves,
      })
      const close: DailyClose = {
        date: input.date,
        openingFund: input.openingFund,
        expected,
        counted: input.counted,
        difference: input.counted - expected,
        note: input.note.trim(),
        closedBy: input.closedBy,
        closedAt: this.now().toISOString(),
      }
      ;(this.db.dailyCloses ??= []).push(close)
      this.save()
      return clone(close)
    })
  }

  async adminReopenDay(date: string): Promise<void> {
    await this.delay()
    return this.exclusive(() => {
      this.db.dailyCloses = (this.db.dailyCloses ?? []).filter((c) => c.date !== date)
      this.save()
    })
  }

  /** Payroll week start, card terminal fee and bonus rules. */
  async adminSaveFinanceSettings(input: FinanceSettings): Promise<FinanceSettings> {
    await this.delay()
    return this.exclusive(() => {
      const err = financeSettingsError(input)
      if (err) throw new InvalidRequestError(err)
      const settings: FinanceSettings = {
        weekStartDay: input.weekStartDay,
        cardFeePercent: input.cardFeePercent,
        discountCommission: input.discountCommission === 'net' ? 'net' : 'list',
        bonuses: input.bonuses.map((b) => ({
          ...b,
          name: b.name.trim(),
          threshold: b.kind === 'manual' ? null : b.threshold,
        })),
      }
      this.db.finance = settings
      this.save()
      return clone(settings)
    })
  }

  /** Mark or unmark a manual bonus (punctuality, attendance…) for a barber in a payroll week. */
  async adminSetBonusAward(award: BonusAward, on: boolean): Promise<void> {
    await this.delay()
    return this.exclusive(() => {
      const rule = (this.db.finance ?? defaultFinanceSettings()).bonuses.find((b) => b.id === award.bonusId)
      if (!rule || rule.kind !== 'manual') throw new InvalidRequestError('Ese bono se calcula solo.')
      this.assertWeekOpen(award.weekStart)
      const same = (x: BonusAward) =>
        x.weekStart === award.weekStart && x.staffId === award.staffId && x.bonusId === award.bonusId
      const list = (this.db.bonusAwards ?? []).filter((x) => !same(x))
      this.db.bonusAwards = on ? [...list, { ...award }] : list
      this.save()
    })
  }

  async adminDeleteAdvance(id: ID): Promise<void> {
    await this.delay()
    return this.exclusive(() => {
      const adv = (this.db.advances ?? []).find((x) => x.id === id)
      if (adv) this.assertWeekOpen(adv.date)
      this.db.advances = (this.db.advances ?? []).filter((x) => x.id !== id)
      this.save()
    })
  }

  // ── Settings (Ajustes) ────────────────────────────────────────────────────

  adminSettings(): { policy: BookingPolicy; services: Service[] } {
    const catOrder = new Map(this.db.categories.map((c) => [c.id, c.order]))
    return clone({
      policy: this.policy,
      services: this.db.services
        .filter((s) => s.active)
        .sort((a, b) => (catOrder.get(a.categoryId) ?? 99) - (catOrder.get(b.categoryId) ?? 99) || a.order - b.order),
    })
  }

  /**
   * Save the booking and loyalty rules and which services earn a stamp. A new
   * goal applies to cards in progress; cards that already reach it get their
   * free cut from today. Cards with a pending reward keep it.
   */
  async adminSavePolicy(input: {
    policy: BookingPolicy
    loyaltyServiceIds: ID[]
  }): Promise<{ policy: BookingPolicy; cardsCompleted: number }> {
    await this.delay()
    return this.exclusive(() => {
      const policy: BookingPolicy = { ...this.policy, ...input.policy, slotStepMin: this.policy.slotStepMin }
      const err = policyError(policy)
      if (err) throw new InvalidRequestError(err)
      const eligible = new Set(input.loyaltyServiceIds)
      if (!this.db.services.some((s) => s.active && eligible.has(s.id)))
        throw new InvalidRequestError('Elige al menos un servicio que sume sello.')

      let cardsCompleted = 0
      if (policy.loyaltyGoal !== this.policy.loyaltyGoal) {
        const until = zonedEndOfDay(addDays(localDate(this.now(), businessHours.timeZone), policy.rewardValidityDays))
        for (const card of this.db.loyalty) {
          if (card.rewardExpiresAt) continue // reward already earned: keep it
          card.goal = policy.loyaltyGoal
          if (card.stamps >= card.goal) {
            card.stamps = card.goal
            card.rewardExpiresAt = until
            cardsCompleted++
          }
        }
      }
      // Hidden services keep their setting (they are not listed in Ajustes).
      for (const s of this.db.services) if (s.active) s.loyaltyEligible = eligible.has(s.id)
      this.db.policy = policy
      this.save()
      return { policy: clone(policy), cardsCompleted }
    })
  }

  adminTeam() {
    const now = this.now().toISOString()
    return clone({
      staff: [...this.db.staff].sort((a, b) => a.order - b.order),
      commissions: this.db.commissions,
      commissionHistory: this.db.commissionHistory ?? [],
      blocks: this.db.blocks.filter((b) => b.endsAt > now).sort((a, b) => a.startsAt.localeCompare(b.startsAt)),
    })
  }

  /**
   * Create or update a barber. `commission` undefined leaves it untouched (reception
   * never sends it). Returns upcoming appointments the change leaves outside the
   * barber's shifts or services, so the shop can move them.
   */
  async adminSaveStaff(input: {
    id?: ID
    name: string
    title: string
    photoUrl: string | null
    active: boolean
    schedule: WeeklySchedule
    serviceIds: ID[]
    commission?: { mode: 'percent' | 'fixed'; value: number | null; overrides: Record<ID, number> }
    /** When a commission change starts to apply (default: today). */
    commissionFrom?: string
  }): Promise<{ staff: Staff; outside: Appointment[] }> {
    await this.delay()
    return this.exclusive(() => {
      const name = input.name.trim().replace(/\s+/g, ' ')
      if (!name) throw new InvalidRequestError('Escribe el nombre del barbero.')
      if (this.db.staff.some((x) => x.id !== input.id && fold(x.name) === fold(name)))
        throw new InvalidRequestError('Ya hay un barbero con ese nombre.')
      const problems = scheduleErrors(input.schedule, businessHours.weekly)
      const day = Object.keys(problems)[0]
      if (day !== undefined) throw new InvalidRequestError(`${DAY_NAMES[Number(day)]}: ${problems[Number(day)]}`)
      const known = new Set(this.db.services.map((x) => x.id))
      const serviceIds = input.serviceIds.filter((id) => known.has(id))
      if (input.active && serviceIds.length === 0)
        throw new InvalidRequestError('Un barbero activo necesita al menos un servicio.')

      const existing = input.id ? this.db.staff.find((x) => x.id === input.id) : undefined
      if (input.id && !existing) throw new NotFoundError('ese barbero')
      const fields = {
        name,
        title: input.title.trim(),
        photoUrl: input.photoUrl,
        active: input.active,
        schedule: input.schedule.map((d) => [...(d ?? [])].sort((a, b) => a.start.localeCompare(b.start))),
        serviceIds: serviceIds.length === known.size ? ('all' as const) : serviceIds,
      }
      let staff: Staff
      if (existing) staff = Object.assign(existing, fields)
      else {
        staff = {
          id: this.uniqueId(name, this.db.staff),
          role: 'barber',
          order: Math.max(0, ...this.db.staff.map((x) => x.order)) + 1,
          ...fields,
        }
        this.db.staff.push(staff)
      }

      if (input.commission) {
        const c = input.commission
        const max = c.mode === 'percent' ? 100 : 100000
        const ok = (v: number) => Number.isInteger(v) && v >= 0 && v <= max
        const what = c.mode === 'percent' ? 'un porcentaje de 0 a 100' : 'un monto en pesos, sin centavos'
        if (c.value !== null && !ok(c.value)) throw new InvalidRequestError(`La comisión debe ser ${what}.`)
        const overrides: Record<ID, number> = {}
        for (const [id, v] of Object.entries(c.overrides)) {
          if (!known.has(id)) continue
          if (!ok(v)) throw new InvalidRequestError(`Cada comisión personalizada debe ser ${what}.`)
          overrides[id] = v
        }
        const next: StaffCommission = { staffId: staff.id, mode: c.mode, value: c.value, overrides }
        const prev = this.db.commissions.find((x) => x.staffId === staff.id)
        const same = (x?: StaffCommission) =>
          !!x &&
          x.mode === next.mode &&
          x.value === next.value &&
          JSON.stringify(x.overrides) === JSON.stringify(overrides)
        if (!same(prev)) {
          // A change applies from a date; past weeks keep the rule they had.
          const from = input.commissionFrom ?? localDate(this.now(), businessHours.timeZone)
          if (!/^\d{4}-\d{2}-\d{2}$/.test(from)) throw new InvalidRequestError('Elige desde cuándo aplica la comisión.')
          if ((this.db.payrollCloses ?? []).some((w) => from <= w.weekEnd))
            throw new InvalidRequestError(
              'Esa fecha cae en una semana de nómina ya cerrada. Elige una fecha posterior.',
            )
          let history = (this.db.commissionHistory ??= [])
          const mine = history.filter((v) => v.staffId === staff.id)
          if (!mine.length && prev) history.push({ ...prev, validFrom: '0000-01-01' })
          history = history.filter((v) => !(v.staffId === staff.id && v.validFrom >= from))
          history.push({ ...next, validFrom: from })
          this.db.commissionHistory = history
        }
        this.db.commissions = [...this.db.commissions.filter((x) => x.staffId !== staff.id), next]
      } else if (!this.db.commissions.some((x) => x.staffId === staff.id)) {
        this.db.commissions.push({ staffId: staff.id, mode: 'percent', value: null, overrides: {} })
      }

      const now = this.now()
      const offered = (a: Appointment) =>
        staff.serviceIds === 'all' || a.serviceIds.every((id) => staff.serviceIds.includes(id))
      const upcoming = this.db.appointments.filter(
        (a) =>
          a.staffId === staff.id &&
          (a.status === 'booked' || a.status === 'confirmed') &&
          Date.parse(a.startsAt) > now.getTime(),
      )
      const outsideShifts = new Set(outsideSchedule(upcoming, staff.id, staff.schedule, businessHours.timeZone, now))
      const outside = upcoming
        .filter((a) => !staff.active || outsideShifts.has(a) || !offered(a))
        .sort((a, b) => a.startsAt.localeCompare(b.startsAt))
      this.save()
      return { staff: clone(staff), outside: clone(outside) }
    })
  }

  /** Move a barber up or down (order on the site and in booking). */
  async adminMoveStaff(id: ID, dir: -1 | 1): Promise<void> {
    await this.delay()
    return this.exclusive(() => {
      const list = [...this.db.staff].sort((a, b) => a.order - b.order)
      const i = list.findIndex((x) => x.id === id)
      if (i < 0) throw new NotFoundError('ese barbero')
      swapOrder(list, i, dir)
      this.save()
    })
  }

  // ── Products ──────────────────────────────────────────────────────────────

  adminProducts(): Product[] {
    return clone([...this.db.products].sort((a, b) => a.name.localeCompare(b.name, 'es')))
  }

  async adminSaveProduct(input: {
    id?: ID
    name: string
    brand: string
    price: number
    cost: number | null
    commission: number | null
    imageUrl: string | null
    active: boolean
  }): Promise<Product> {
    await this.delay()
    return this.exclusive(() => {
      const name = input.name.trim().replace(/\s+/g, ' ')
      if (!name) throw new InvalidRequestError('Escribe el nombre del producto.')
      if (this.db.products.some((x) => x.id !== input.id && fold(x.name) === fold(name)))
        throw new InvalidRequestError('Ya existe un producto con ese nombre.')
      const money = (v: number | null, label: string, required: boolean) => {
        if (v === null) {
          if (required) throw new InvalidRequestError(`Escribe el ${label} en pesos, sin centavos.`)
          return null
        }
        if (!Number.isInteger(v) || v < 0 || v > 100000)
          throw new InvalidRequestError(`Escribe el ${label} en pesos, sin centavos.`)
        return v
      }
      const values = {
        name,
        brand: input.brand.trim(),
        price: money(input.price, 'precio público', true)!,
        cost: money(input.cost, 'costo', false),
        commission: money(input.commission, 'monto de comisión', false),
        imageUrl: input.imageUrl,
        active: input.active,
      }
      let product = input.id ? this.db.products.find((x) => x.id === input.id) : undefined
      if (input.id && !product) throw new NotFoundError('ese producto')
      if (!product) {
        product = {
          id: this.uniqueId(name, this.db.products),
          ...values,
          createdAt: this.now().toISOString(),
        }
        this.db.products.push(product)
      } else Object.assign(product, values)
      this.save()
      return clone(product)
    })
  }

  async adminDeleteProduct(id: ID): Promise<void> {
    await this.delay()
    return this.exclusive(() => {
      const i = this.db.products.findIndex((x) => x.id === id)
      if (i < 0) throw new NotFoundError('ese producto')
      this.db.products.splice(i, 1)
      this.save()
    })
  }

  /** Who performs a service: keeps "all" for barbers who do everything, otherwise explicit lists. */
  private assignStaff(serviceId: ID, staffIds: ID[]) {
    for (const st of this.db.staff) {
      const wants = staffIds.includes(st.id)
      if (st.serviceIds === 'all') {
        if (!wants) st.serviceIds = this.db.services.map((x) => x.id).filter((x) => x !== serviceId)
      } else if (wants && !st.serviceIds.includes(serviceId)) st.serviceIds = [...st.serviceIds, serviceId]
      else if (!wants) st.serviceIds = st.serviceIds.filter((x) => x !== serviceId)
    }
  }

  /** Readable id from a name ("Corte clásico" → "corte-clasico"), unique within `taken`. */
  private uniqueId(name: string, taken: { id: ID }[]) {
    const base =
      fold(name)
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '')
        .slice(0, 40) || 'item'
    let id = base
    for (let n = 2; taken.some((x) => x.id === id); n++) id = `${base}-${n}`
    return id
  }

  /** Edit a customer's contact details and notes; past appointments show the new name/phone too. */
  async adminUpdateCustomer(
    id: ID,
    patch: { name: string; phone: string; email: string; notes: string },
  ): Promise<Customer> {
    await this.delay()
    return this.exclusive(() => {
      const c = this.db.customers.find((x) => x.id === id)
      if (!c) throw new NotFoundError('ese cliente')
      const name = patch.name.trim()
      if (!name) throw new InvalidRequestError('Escribe el nombre.')
      const phone = patch.phone.trim() ? normalizeMxPhone(patch.phone) : ''
      if (phone === null) throw new InvalidRequestError('Revisa el teléfono: 10 dígitos.')
      const email = patch.email.trim().toLowerCase()
      if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new InvalidRequestError('Revisa el correo.')
      const clash = this.db.customers.find(
        (x) => x.id !== id && ((phone && x.phone === phone) || (email && x.email === email)),
      )
      if (clash)
        throw new InvalidRequestError(
          `${phone && clash.phone === phone ? 'Ese teléfono' : 'Ese correo'} ya es de otro cliente (${clash.name}).`,
        )
      Object.assign(c, { name, phone, email, notes: patch.notes.trim() })
      for (const a of this.db.appointments) if (a.customerId === id) a.customer = { name, phone, email }
      this.save()
      return clone(c)
    })
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
    ...keepCatalog(stored, fresh),
    appointments: [...fresh.appointments.filter((a) => !overlaps(a)), ...own],
    customers: [...fresh.customers, ...stored.customers.filter((c) => ownCustomers.has(c.id) && !freshIds.has(c.id))],
    loyalty: [...fresh.loyalty, ...stored.loyalty.filter((l) => !freshCards.has(l.token))],
  }
}

/**
 * The catalog (categories, services, who performs what) is business data edited
 * in the admin, so it is kept from storage. Staff profiles still come from the
 * seed: their photo URLs are hashed per build and go stale.
 */
function keepCatalog(
  stored: MockDb,
  fresh: MockDb,
): Pick<
  MockDb,
  | 'categories'
  | 'services'
  | 'staff'
  | 'products'
  | 'commissions'
  | 'policy'
  | 'advances'
  | 'sales'
  | 'finance'
  | 'bonusAwards'
  | 'cashMoves'
  | 'dailyCloses'
  | 'payrollCloses'
  | 'commissionHistory'
> {
  return {
    // Products arrived in demo v4; older stored demos start from the seed's.
    products: stored.products ?? fresh.products,
    categories: stored.categories?.length ? stored.categories : fresh.categories,
    services: stored.services?.length ? stored.services : fresh.services,
    // Profiles, schedules and services are edited in the admin: keep them. Seed photos
    // are refreshed (hashed per build); photos uploaded in the admin (data URLs) are kept.
    staff: stored.staff?.length
      ? stored.staff.map((s) => {
          const seeded = fresh.staff.find((x) => x.id === s.id)
          return seeded && !s.photoUrl?.startsWith('data:') ? { ...s, photoUrl: seeded.photoUrl } : s
        })
      : fresh.staff,
    commissions: stored.commissions ?? fresh.commissions,
    // Rules edited in Ajustes (arrived in demo v6; older demos start from the defaults).
    policy: stored.policy ? { ...fresh.policy, ...stored.policy } : fresh.policy,
    advances: stored.advances ?? [],
    sales: stored.sales ?? [],
    finance: stored.finance ?? fresh.finance,
    bonusAwards: stored.bonusAwards ?? [],
    cashMoves: stored.cashMoves ?? [],
    dailyCloses: stored.dailyCloses ?? [],
    payrollCloses: stored.payrollCloses ?? [],
    commissionHistory: stored.commissionHistory ?? [],
  }
}

/** Swap an item's order with its neighbour (list sorted by order); renumbers 1..n. */
function swapOrder<T extends { order: number }>(list: T[], i: number, dir: -1 | 1) {
  const j = i + dir
  if (i < 0 || j < 0 || j >= list.length) return
  ;[list[i], list[j]] = [list[j]!, list[i]!]
  list.forEach((x, k) => (x.order = k + 1))
}
