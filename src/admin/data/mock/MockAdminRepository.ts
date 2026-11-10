import type {
  Appointment,
  BookingPolicy,
  Customer,
  ID,
  LocalDate,
  LoyaltyCard,
  PaymentMethod,
  Product,
  Service,
  ServiceCategory,
  Slot,
  Staff,
  TimeBlock,
  WeeklySchedule,
} from '@/domain/types'
import type { SlotQuery } from '@/data'
import { businessHours } from '@/config/business'
import { MockBookingRepository } from '@/data/mock/MockBookingRepository'
import { addDays, localDate, weekdayOf, zonedInstant } from '@/lib/time'
import type {
  AdminCatalog,
  AdminFinance,
  CashDay,
  AdminSettings,
  EmailSettings,
  AdminTeam,
  AdminChange,
  AdminNewAppointment,
  AdminSession,
  AdminUser,
  AgendaDay,
  BusinessHoursChange,
  NewBlock,
  PaymentInput,
  PolicyInput,
  ProductInput,
  ServiceInput,
  StaffInput,
  StaffStatusChange,
  StatusChangeResult,
  UserInput,
} from '../../domain'
import { summarizeCustomers, type CustomerSummary } from '../../customers/model'
import type {
  Advance,
  BonusAward,
  CashMove,
  DailyClose,
  FinanceSettings,
  PayrollClose,
  ProductSale,
} from '../../finance'
import { InvalidRequestError } from '@/data/errors'
import { InvalidCredentialsError, InvalidMfaCodeError, type AdminRepository } from '../AdminRepository'
import { isFinanceRole, isOwnerRole } from '../../domain'

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
    mfaRequired: false,
    active: true,
  },
  {
    id: 'u-manager',
    name: 'Gerente',
    email: 'gerencia@havana.test',
    role: 'manager',
    staffId: null,
    mfaRequired: false,
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
const USERS_KEY = 'havana:admin-users'

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
    const user = s && this.users().find((u) => u.id === s.userId && u.active)
    return user ? { user, mfaVerified: s.mfaVerified } : null
  }

  async signIn(email: string, password: string): Promise<AdminSession> {
    await this.delay()
    const user = this.users().find((u) => u.email === email.trim().toLowerCase() && u.active)
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
    return this.users()
  }

  async saveUser(input: UserInput): Promise<AdminUser> {
    await this.delay()
    const actor = (await this.getSession())?.user
    if (!isOwnerRole(actor?.role)) throw new InvalidRequestError('Solo la persona dueña administra usuarios.')
    const users = this.users()
    const name = input.name.trim().replace(/\s+/g, ' ')
    const email = input.email.trim().toLowerCase()
    if (!name) throw new InvalidRequestError('Escribe el nombre.')
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new InvalidRequestError('Revisa el correo.')
    if (!input.id && input.password && input.password.length < 10)
      throw new InvalidRequestError('La contraseña temporal necesita al menos 10 caracteres.')
    if (users.some((u) => u.id !== input.id && u.email === email))
      throw new InvalidRequestError('Ya hay un usuario con ese correo.')
    const existing = input.id ? users.find((u) => u.id === input.id) : undefined
    if (input.id && !existing) throw new InvalidRequestError('Ese usuario ya no existe.')
    if (existing?.id === actor.id && (input.role !== actor.role || !input.active))
      throw new InvalidRequestError('No puedes cambiar tu propio rol ni desactivarte.')

    let staffId: string | null = null
    if (input.role === 'barber') {
      const staff = this.booking.snapshot().staff
      if (!input.staffId || !staff.some((s) => s.id === input.staffId))
        throw new InvalidRequestError('Elige el perfil del barbero en Equipo.')
      if (users.some((u) => u.id !== input.id && u.staffId === input.staffId && u.role === 'barber'))
        throw new InvalidRequestError('Ese barbero ya tiene un usuario.')
      staffId = input.staffId
    }

    const user: AdminUser = {
      id: existing?.id ?? `u-${Date.now().toString(36)}${Math.floor(Math.random() * 1e4)}`,
      name,
      email,
      role: input.role,
      staffId,
      mfaRequired: false,
      active: input.active,
    }
    const next = existing ? users.map((u) => (u.id === user.id ? user : u)) : [...users, user]
    if (!next.some((u) => u.role === 'owner' && u.active))
      throw new InvalidRequestError('Debe quedar al menos una persona dueña activa.')
    this.writeUsers(next)
    return { ...user }
  }

  async getFinance(from: LocalDate, to: LocalDate): Promise<AdminFinance> {
    await this.delay()
    const data = this.booking.adminFinance(from, to)
    // Same rule as RLS will enforce: a barber only gets their own work and rule.
    const me = (await this.getSession())?.user
    if (me?.role === 'barber') {
      return {
        ...data,
        appointments: data.appointments.filter((a) => a.staffId === me.staffId),
        staff: data.staff.filter((s) => s.id === me.staffId),
        commissions: data.commissions.filter((c) => c.staffId === me.staffId),
        commissionHistory: data.commissionHistory.filter((c) => c.staffId === me.staffId),
        advances: data.advances.filter((x) => x.staffId === me.staffId),
        sales: data.sales.filter((x) => x.staffId === me.staffId),
        bonusAwards: data.bonusAwards.filter((x) => x.staffId === me.staffId),
        close: data.close && { ...data.close, rows: data.close.rows.filter((r) => r.staffId === me.staffId) },
      }
    }
    return data
  }

  addAdvance(input: { staffId: ID; date: LocalDate; amount: number; note: string }): Promise<Advance> {
    return this.booking.adminAddAdvance(input)
  }

  createSale(input: {
    items: { productId: ID; qty: number }[]
    staffId: ID | null
    method: PaymentMethod
  }): Promise<ProductSale> {
    return this.booking.adminCreateSale(input)
  }

  async closeWeek(weekStart: LocalDate): Promise<PayrollClose> {
    const me = (await this.getSession())?.user
    return this.booking.adminCloseWeek(weekStart, me?.name ?? 'Panel')
  }

  async markPaid(weekStart: LocalDate, staffId: ID, paid: boolean): Promise<void> {
    const me = (await this.getSession())?.user
    return this.booking.adminMarkPaid(weekStart, staffId, paid, me?.name ?? 'Panel')
  }

  async reopenWeek(weekStart: LocalDate): Promise<void> {
    const me = (await this.getSession())?.user
    if (!isOwnerRole(me?.role)) throw new InvalidRequestError('Solo el dueño puede reabrir una semana cerrada.')
    return this.booking.adminReopenWeek(weekStart)
  }

  async getCashDay(date: LocalDate): Promise<CashDay> {
    await this.delay()
    return this.booking.adminCashDay(date)
  }

  async addCashMove(input: {
    date: LocalDate
    kind: 'out' | 'in'
    amount: number
    concept: string
  }): Promise<CashMove> {
    const me = (await this.getSession())?.user
    return this.booking.adminAddCashMove({ ...input, by: me?.name ?? 'Panel' })
  }

  deleteCashMove(id: ID): Promise<void> {
    return this.booking.adminDeleteCashMove(id)
  }

  async closeDay(input: { date: LocalDate; openingFund: number; counted: number; note: string }): Promise<DailyClose> {
    const me = (await this.getSession())?.user
    return this.booking.adminCloseDay({ ...input, closedBy: me?.name ?? 'Panel' })
  }

  async reopenDay(date: LocalDate): Promise<void> {
    const me = (await this.getSession())?.user
    if (!isFinanceRole(me?.role))
      throw new InvalidRequestError('Solo el dueño o el gerente pueden reabrir una caja cerrada.')
    return this.booking.adminReopenDay(date)
  }

  async getFinanceSettings(): Promise<FinanceSettings> {
    await this.delay()
    return this.booking.adminFinance('0000-00-00', '0000-00-00').settings
  }

  saveFinanceSettings(input: FinanceSettings): Promise<FinanceSettings> {
    return this.booking.adminSaveFinanceSettings(input)
  }

  private customerEmails = false

  /** The demo sends nothing: it only remembers the switch. */
  async getEmailSettings(): Promise<EmailSettings> {
    await this.delay()
    return { customerEmails: this.customerEmails, recent: [] }
  }

  async setCustomerEmails(on: boolean): Promise<void> {
    const me = (await this.getSession())?.user
    if (!isFinanceRole(me?.role)) throw new InvalidRequestError('Tu rol no permite hacer este cambio.')
    this.customerEmails = on
  }

  setBonusAward(award: BonusAward, on: boolean): Promise<void> {
    return this.booking.adminSetBonusAward(award, on)
  }

  deleteAdvance(id: ID): Promise<void> {
    return this.booking.adminDeleteAdvance(id)
  }

  async getSettings(): Promise<AdminSettings> {
    await this.delay()
    return this.booking.adminSettings()
  }

  savePolicy(input: PolicyInput): Promise<{ policy: BookingPolicy; cardsCompleted: number }> {
    return this.booking.adminSavePolicy(input)
  }

  async saveBusinessHours(weekly: WeeklySchedule): Promise<BusinessHoursChange> {
    const me = (await this.getSession())?.user
    if (!isFinanceRole(me?.role)) throw new InvalidRequestError('Tu rol no permite cambiar el horario.')
    return this.booking.adminSaveBusinessHours(weekly)
  }

  async getAgendaDay(date: LocalDate): Promise<AgendaDay> {
    await this.delay()
    const db = this.booking.snapshot()
    const shop = await this.booking.getBusinessHours()
    const tz = businessHours.timeZone
    const dayStart = zonedInstant(date, '00:00', tz).toISOString()
    const dayEnd = zonedInstant(date, '23:59', tz).toISOString()
    return {
      date,
      timeZone: tz,
      hours: shop.weekly[weekdayOf(date)] ?? [],
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

  async completeAppointment(id: ID, payment: PaymentInput): Promise<StatusChangeResult> {
    const { discount, ...rest } = payment
    if (!discount) return this.booking.adminSetStatus(id, 'completed', rest)
    const by = await this.authorizer(discount.authorizer)
    return this.booking.adminSetStatus(id, 'completed', {
      ...rest,
      discount: { amount: discount.amount, reason: discount.reason, authorizedBy: by.id, authorizedByName: by.name },
    })
  }

  /** Who authorizes a discount: the signed-in owner/manager, or one who types their credentials. */
  private async authorizer(creds?: { email: string; password: string }): Promise<AdminUser> {
    const me = (await this.getSession())?.user
    if (me && isFinanceRole(me.role)) return me
    const u = this.users().find(
      (x) => x.active && isFinanceRole(x.role) && x.email === creds?.email.trim().toLowerCase(),
    )
    if (!u || creds?.password !== DEMO_PASSWORD)
      throw new InvalidRequestError('La autorización no es válida: usa el correo y la contraseña del dueño o gerente.')
    return u
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

  /** Barbers' notice e-mails (the demo keeps them only in memory). */
  private staffEmails: Record<string, string> = {}

  async getTeam(): Promise<AdminTeam> {
    await this.delay()
    const me = (await this.getSession())?.user
    return { ...this.booking.adminTeam(), emails: isFinanceRole(me?.role) ? { ...this.staffEmails } : {} }
  }

  async saveStaff(input: StaffInput): Promise<{ staff: Staff; outside: Appointment[] }> {
    const email = input.email?.trim().toLowerCase()
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
      throw new InvalidRequestError('Revisa el correo del barbero.')
    const saved = await this.booking.adminSaveStaff(input)
    if (email !== undefined) this.staffEmails[saved.staff.id] = email
    return saved
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

  demo = ((repo: MockAdminRepository) => ({
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
    /** Active users (including ones invited in Ajustes), for the role switcher. */
    get users(): AdminUser[] {
      return repo.users().filter((u) => u.active)
    },
    password: DEMO_PASSWORD,
    switchTo: async (userId: string): Promise<AdminSession> => {
      const user = this.users().find((u) => u.id === userId && u.active)
      if (!user) throw new InvalidCredentialsError()
      this.write({ userId, mfaVerified: true })
      return { user, mfaVerified: true }
    },
  }))(this)

  /** Panel users: the demo accounts plus any invited or edited in Ajustes (kept in this browser). */
  private users(): AdminUser[] {
    if (this.usersMemory) return this.usersMemory.map((u) => ({ ...u }))
    try {
      const raw = this.storage?.getItem(USERS_KEY)
      if (raw) {
        const stored = JSON.parse(raw) as AdminUser[]
        if (Array.isArray(stored) && stored.length) return stored
      }
    } catch {
      /* storage blocked or unreadable: demo users */
    }
    return demoUsers.map((u) => ({ ...u }))
  }

  private writeUsers(users: AdminUser[]) {
    try {
      this.storage?.setItem(USERS_KEY, JSON.stringify(users))
      if (!this.storage) this.usersMemory = users
    } catch {
      this.usersMemory = users
    }
  }

  private usersMemory: AdminUser[] | null = null

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
