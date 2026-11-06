import type {
  Appointment,
  Customer,
  ID,
  LocalDate,
  LoyaltyCard,
  Product,
  Service,
  ServiceCategory,
  Slot,
  Staff,
  TimeBlock,
} from '@/domain/types'
import type { SlotQuery } from '@/data'
import { businessHours } from '@/config/business'
import { MockBookingRepository } from '@/data/mock/MockBookingRepository'
import { addDays, localDate, weekdayOf, zonedInstant } from '@/lib/time'
import type {
  AdminCatalog,
  AdminTeam,
  AdminChange,
  AdminNewAppointment,
  AdminSession,
  AdminUser,
  AgendaDay,
  NewBlock,
  PaymentInput,
  ProductInput,
  ServiceInput,
  StaffInput,
  StaffStatusChange,
  StatusChangeResult,
} from '../../domain'
import { summarizeCustomers, type CustomerSummary } from '../../customers/model'
import { InvalidCredentialsError, InvalidMfaCodeError, type AdminRepository } from '../AdminRepository'

/**
 * Demo users. Generic, fictitious accounts (reserved .test domain); the barber
 * account is linked to a public barber profile so the agenda can filter to it.
 */
export const demoUsers: AdminUser[] = [
  {
    id: 'u-owner',
    name: 'Dueño',
    email: 'dueno@havana.test',
    role: 'owner',
    staffId: null,
    mfaRequired: true,
    active: true,
  },
  {
    id: 'u-manager',
    name: 'Gerente',
    email: 'gerencia@havana.test',
    role: 'manager',
    staffId: null,
    mfaRequired: true,
    active: true,
  },
  {
    id: 'u-reception',
    name: 'Recepción',
    email: 'recepcion@havana.test',
    role: 'reception',
    staffId: null,
    mfaRequired: false,
    active: true,
  },
  {
    id: 'u-leonardo',
    name: 'Leonardo Gómez',
    email: 'leonardo@havana.test',
    role: 'barber',
    staffId: 'leonardo',
    mfaRequired: false,
    active: true,
  },
  {
    id: 'u-isaac',
    name: 'Isaac Fuentes',
    email: 'isaac@havana.test',
    role: 'barber',
    staffId: 'isaac',
    mfaRequired: false,
    active: true,
  },
]

export const DEMO_PASSWORD = 'demo1234'

/** Invented names for simulated online bookings. */
const DEMO_NAMES = ['Esteban Lara', 'Rubén Solís', 'Iker Montes', 'Gael Cordero', 'Julián Ávila', 'Marco Treviño']
const STORAGE_KEY = 'havana:admin-session'

interface Stored {
  userId: string
  mfaVerified: boolean
}

export interface MockAdminOptions {
  storage?: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> | null
  latencyMs?: number
  /**
   * Source of the demo agenda. In the app it is the same instance the public site
   * uses, so a booking made at /reservar shows up in the panel right away.
   */
  booking?: MockBookingRepository
}

/** Demo auth: any listed email with the demo password; any 6-digit code passes the second step. */
export class MockAdminRepository implements AdminRepository {
  private readonly storage: MockAdminOptions['storage']
  private readonly latencyMs: number
  private readonly booking: MockBookingRepository

  constructor(opts: MockAdminOptions = {}) {
    this.storage = opts.storage === undefined ? defaultStorage() : opts.storage
    this.latencyMs = opts.latencyMs ?? 0
    this.booking = opts.booking ?? new MockBookingRepository({ storage: null })
  }

  async getSession(): Promise<AdminSession | null> {
    const s = this.read()
    const user = s && demoUsers.find((u) => u.id === s.userId && u.active)
    return user ? { user, mfaVerified: s.mfaVerified } : null
  }

  async signIn(email: string, password: string): Promise<AdminSession> {
    await this.delay()
    const user = demoUsers.find((u) => u.email === email.trim().toLowerCase() && u.active)
    if (!user || password !== DEMO_PASSWORD) throw new InvalidCredentialsError()
    this.write({ userId: user.id, mfaVerified: false })
    return { user, mfaVerified: false }
  }

  async verifyMfa(code: string): Promise<AdminSession> {
    await this.delay()
    const session = await this.getSession()
    if (!session) throw new InvalidCredentialsError()
    if (!/^\d{6}$/.test(code)) throw new InvalidMfaCodeError()
    this.write({ userId: session.user.id, mfaVerified: true })
    return { ...session, mfaVerified: true }
  }

  async signOut(): Promise<void> {
    this.memory = null
    try {
      this.storage?.removeItem(STORAGE_KEY)
    } catch {
      /* storage blocked */
    }
  }

  async listUsers(): Promise<AdminUser[]> {
    await this.delay()
    return demoUsers.map((u) => ({ ...u }))
  }

  async getAgendaDay(date: LocalDate): Promise<AgendaDay> {
    await this.delay()
    const db = this.booking.snapshot()
    const tz = businessHours.timeZone
    const dayStart = zonedInstant(date, '00:00', tz).toISOString()
    const dayEnd = zonedInstant(date, '23:59', tz).toISOString()
    return {
      date,
      timeZone: tz,
      hours: businessHours.weekly[weekdayOf(date)] ?? [],
      staff: db.staff.filter((s) => s.active).sort((a, b) => a.order - b.order),
      services: db.services,
      appointments: db.appointments
        .filter((a) => localDate(a.startsAt, tz) === date)
        .sort((a, b) => a.startsAt.localeCompare(b.startsAt)),
      // Multi-day time off (vacations) is clipped to this day, so every screen can treat
      // blocks as same-day ranges.
      blocks: db.blocks
        .filter((b) => b.startsAt < dayEnd && b.endsAt > dayStart)
        .map((b) => ({
          ...b,
          startsAt: b.startsAt < dayStart ? dayStart : b.startsAt,
          endsAt: b.endsAt > dayEnd ? dayEnd : b.endsAt,
        })),
    }
  }

  async getAvailableSlots(query: SlotQuery): Promise<Slot[]> {
    await this.delay()
    return this.booking.adminSlots(query)
  }

  completeAppointment(id: ID, payment: PaymentInput): Promise<StatusChangeResult> {
    return this.booking.adminSetStatus(id, 'completed', payment)
  }

  setAppointmentStatus(id: ID, status: StaffStatusChange): Promise<StatusChangeResult> {
    return this.booking.adminSetStatus(id, status)
  }

  createAppointment(input: AdminNewAppointment): Promise<Appointment> {
    return this.booking.adminCreateAppointment(input)
  }

  rescheduleAppointment(id: ID, change: { startsAt: string; staffId: ID }): Promise<Appointment> {
    return this.booking.adminReschedule(id, change)
  }

  updateAppointmentNotes(id: ID, notes: string): Promise<Appointment> {
    return this.booking.adminUpdateNotes(id, notes)
  }

  createBlock(input: NewBlock): Promise<TimeBlock> {
    return this.booking.adminCreateBlock(input)
  }

  deleteBlock(id: ID): Promise<void> {
    return this.booking.adminDeleteBlock(id)
  }

  findCustomers(query: string): Promise<Customer[]> {
    return this.booking.adminFindCustomers(query)
  }

  getLoyaltyForCustomer(customerId: ID): Promise<LoyaltyCard | null> {
    return this.booking.adminLoyaltyFor(customerId)
  }

  async listCustomers(): Promise<CustomerSummary[]> {
    await this.delay()
    const db = this.booking.snapshot()
    return summarizeCustomers(db.customers, db.appointments, db.loyalty, new Date())
  }

  async getCustomer(id: ID): Promise<{ summary: CustomerSummary; appointments: Appointment[] } | null> {
    await this.delay()
    const db = this.booking.snapshot()
    const customer = db.customers.find((c) => c.id === id)
    if (!customer) return null
    const appointments = db.appointments
      .filter((a) => a.customerId === id)
      .sort((a, b) => b.startsAt.localeCompare(a.startsAt))
    const [summary] = summarizeCustomers([customer], appointments, db.loyalty, new Date())
    return { summary: summary!, appointments }
  }

  updateCustomer(id: ID, patch: { name: string; phone: string; email: string; notes: string }): Promise<Customer> {
    return this.booking.adminUpdateCustomer(id, patch)
  }

  async getCatalog(): Promise<AdminCatalog> {
    await this.delay()
    return this.booking.adminCatalog()
  }

  saveService(input: ServiceInput): Promise<Service> {
    return this.booking.adminSaveService(input)
  }

  deleteService(id: ID): Promise<void> {
    return this.booking.adminDeleteService(id)
  }

  moveService(id: ID, dir: -1 | 1): Promise<void> {
    return this.booking.adminMoveService(id, dir)
  }

  saveCategory(input: { id?: ID; name: string }): Promise<ServiceCategory> {
    return this.booking.adminSaveCategory(input)
  }

  moveCategory(id: ID, dir: -1 | 1): Promise<void> {
    return this.booking.adminMoveCategory(id, dir)
  }

  deleteCategory(id: ID): Promise<void> {
    return this.booking.adminDeleteCategory(id)
  }

  async getTeam(): Promise<AdminTeam> {
    await this.delay()
    return this.booking.adminTeam()
  }

  saveStaff(input: StaffInput): Promise<{ staff: Staff; outside: Appointment[] }> {
    return this.booking.adminSaveStaff(input)
  }

  moveStaff(id: ID, dir: -1 | 1): Promise<void> {
    return this.booking.adminMoveStaff(id, dir)
  }

  uploadStaffPhoto(image: Blob): Promise<string> {
    return this.uploadProductImage(image)
  }

  async listProducts(): Promise<Product[]> {
    await this.delay()
    return this.booking.adminProducts()
  }

  saveProduct(input: ProductInput): Promise<Product> {
    return this.booking.adminSaveProduct(input)
  }

  deleteProduct(id: ID): Promise<void> {
    return this.booking.adminDeleteProduct(id)
  }

  /** Demo: keep the (already small) image inside the demo data as a data URL. */
  uploadProductImage(image: Blob): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(String(reader.result))
      reader.onerror = () => reject(new Error('No se pudo leer la imagen.'))
      reader.readAsDataURL(image)
    })
  }

  subscribe(listener: (change: AdminChange) => void): () => void {
    return this.booking.onChange(listener)
  }

  demo = {
    simulateOnlineBooking: async (): Promise<Appointment> => {
      const popular = ['corte-adulto', 'corte-barba', 'afeitado-barba', 'corte-nino', 'barba-premium']
      const serviceId = popular[Math.floor(Math.random() * popular.length)]!
      const tz = businessHours.timeZone
      const today = localDate(new Date(), tz)
      const n = Math.floor(Math.random() * DEMO_NAMES.length)
      for (let d = 0; d < 14; d++) {
        const date = addDays(today, d)
        const slots = await this.booking.getAvailableSlots({ serviceIds: [serviceId], staffId: 'any', date })
        const free = slots.filter((s) => s.available)
        if (!free.length) continue
        // Not always the very first slot, so repeated tries spread out.
        const slot = free[Math.min(free.length - 1, Math.floor(Math.random() * 4))]!
        return this.booking.createAppointment({
          serviceIds: [serviceId],
          staffId: 'any',
          startsAt: slot.startsAt,
          customer: {
            name: DEMO_NAMES[n]!,
            phone: `442${String(Math.floor(1000000 + Math.random() * 8999999))}`,
            email: `demo${Date.now() % 100000}@ejemplo.com`,
          },
          notes: '',
          privacyAccepted: true,
        })
      }
      throw new Error('No hay horarios libres en los próximos días.')
    },
    users: demoUsers,
    password: DEMO_PASSWORD,
    switchTo: async (userId: string): Promise<AdminSession> => {
      const user = demoUsers.find((u) => u.id === userId)
      if (!user) throw new InvalidCredentialsError()
      this.write({ userId, mfaVerified: true })
      return { user, mfaVerified: true }
    },
  }

  private read(): Stored | null {
    if (!this.storage) return this.memory
    try {
      const raw = this.storage.getItem(STORAGE_KEY)
      return raw ? (JSON.parse(raw) as Stored) : null
    } catch {
      return this.memory
    }
  }

  private write(s: Stored) {
    try {
      this.storage?.setItem(STORAGE_KEY, JSON.stringify(s))
    } catch {
      /* storage blocked: the session lives until reload */
    }
    this.memory = s
  }

  /** Fallback when storage is unavailable. */
  private memory: Stored | null = null

  private delay() {
    return this.latencyMs > 0 ? new Promise((r) => setTimeout(r, this.latencyMs)) : Promise.resolve()
  }
}

function defaultStorage() {
  try {
    return typeof window !== 'undefined' ? window.localStorage : null
  } catch {
    return null
  }
}
