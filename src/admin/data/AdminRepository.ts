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
import type {
  AdminCatalog,
  AdminFinance,
  CashDay,
  AdminSettings,
  BusinessHoursChange,
  EmailSettings,
  AdminTeam,
  AdminChange,
  AdminNewAppointment,
  AdminSession,
  AdminUser,
  AgendaDay,
  NewBlock,
  PaymentInput,
  PolicyInput,
  ProductInput,
  ServiceInput,
  StaffInput,
  StaffStatusChange,
  StatusChangeResult,
  UserInput,
} from '../domain'
import type { CustomerSummary } from '../customers/model'
import type { Advance, BonusAward, CashMove, DailyClose, FinanceSettings, PayrollClose, ProductSale } from '../finance'

export class InvalidCredentialsError extends Error {
  constructor() {
    super('Correo o contraseña incorrectos.')
    this.name = 'InvalidCredentialsError'
  }
}

export class InvalidMfaCodeError extends Error {
  constructor() {
    super('El código no es válido o ya expiró.')
    this.name = 'InvalidMfaCodeError'
  }
}

/**
 * The only way the admin UI reads or writes data. Today: MockAdminRepository.
 * Next (hito 1C): a Supabase implementation —
 * signIn → auth.signInWithPassword, verifyMfa → auth.mfa.challengeAndVerify,
 * listUsers → a staff/profiles table protected by RLS.
 * Later deliveries add agenda, customers, catalog, team, settings and finance methods.
 */
export interface AdminRepository {
  getSession(): Promise<AdminSession | null>
  signIn(email: string, password: string): Promise<AdminSession>
  verifyMfa(code: string): Promise<AdminSession>
  signOut(): Promise<void>
  listUsers(): Promise<AdminUser[]>
  /** One day of the agenda (all barbers; the UI filters by role). */
  getAgendaDay(date: LocalDate): Promise<AgendaDay>

  // Agenda actions (staff). Errors: SlotUnavailableError, InvalidRequestError, NotFoundError.
  /** Free slots for staff bookings: no minimum notice, up to 90 days ahead. */
  getAvailableSlots(query: SlotQuery): Promise<Slot[]>
  /** Confirm, complete (may add a loyalty stamp), mark no-show or cancel. */
  setAppointmentStatus(id: ID, status: StaffStatusChange): Promise<StatusChangeResult>
  /** Complete with its payment (method, tip); may add a loyalty stamp. Only once it started. */
  completeAppointment(id: ID, payment: PaymentInput): Promise<StatusChangeResult>
  createAppointment(input: AdminNewAppointment): Promise<Appointment>
  rescheduleAppointment(id: ID, change: { startsAt: string; staffId: ID }): Promise<Appointment>
  updateAppointmentNotes(id: ID, notes: string): Promise<Appointment>
  createBlock(input: NewBlock): Promise<TimeBlock>
  deleteBlock(id: ID): Promise<void>
  findCustomers(query: string): Promise<Customer[]>
  getLoyaltyForCustomer(customerId: ID): Promise<LoyaltyCard | null>

  // Customers (Clientes). Supabase: a view with the same summary per customer.
  listCustomers(): Promise<CustomerSummary[]>
  /** Summary plus every appointment of one customer (newest first). */
  getCustomer(id: ID): Promise<{ summary: CustomerSummary; appointments: Appointment[] } | null>
  /** Contact details and notes. Errors: InvalidRequestError (phone/email taken or invalid). */
  updateCustomer(id: ID, patch: { name: string; phone: string; email: string; notes: string }): Promise<Customer>
  // Catalog (Servicios y precios). Errors: InvalidRequestError with a message to show.
  getCatalog(): Promise<AdminCatalog>
  /** Create (no id) or update a service, including who performs it. */
  saveService(input: ServiceInput): Promise<Service>
  /** Only services never used in an appointment; used ones are hidden instead. */
  deleteService(id: ID): Promise<void>
  moveService(id: ID, dir: -1 | 1): Promise<void>
  saveCategory(input: { id?: ID; name: string }): Promise<ServiceCategory>
  moveCategory(id: ID, dir: -1 | 1): Promise<void>
  /** Only empty categories. */
  deleteCategory(id: ID): Promise<void>

  // Team (Equipo y horarios).
  getTeam(): Promise<AdminTeam>
  /** Create or update a barber; returns upcoming appointments the change leaves outside their shifts or services. */
  saveStaff(input: StaffInput): Promise<{ staff: Staff; outside: Appointment[] }>
  moveStaff(id: ID, dir: -1 | 1): Promise<void>
  /** Store a barber photo (already resized) and return its URL. */
  uploadStaffPhoto(image: Blob): Promise<string>

  // Finance preview (phase 2). Supabase: views under RLS (a barber reads only their own rows).
  getFinance(from: LocalDate, to: LocalDate): Promise<AdminFinance>
  addAdvance(input: { staffId: ID; date: LocalDate; amount: number; note: string }): Promise<Advance>
  deleteAdvance(id: ID): Promise<void>
  getFinanceSettings(): Promise<FinanceSettings>
  // Payroll weeks (owner and manager). A closed week freezes its receipts.
  closeWeek(weekStart: LocalDate): Promise<PayrollClose>
  markPaid(weekStart: LocalDate, staffId: ID, paid: boolean): Promise<void>
  /** Owner only. */
  reopenWeek(weekStart: LocalDate): Promise<void>
  // Daily cash (desk roles). Changes are refused once the day is closed.
  getCashDay(date: LocalDate): Promise<CashDay>
  addCashMove(input: { date: LocalDate; kind: 'out' | 'in'; amount: number; concept: string }): Promise<CashMove>
  deleteCashMove(id: ID): Promise<void>
  /** Save the count; the expected cash is computed on the server. */
  closeDay(input: { date: LocalDate; openingFund: number; counted: number; note: string }): Promise<DailyClose>
  /** Owner and manager only. */
  reopenDay(date: LocalDate): Promise<void>
  /** Owner and manager. Errors: InvalidRequestError. */
  saveFinanceSettings(input: FinanceSettings): Promise<FinanceSettings>
  setBonusAward(award: BonusAward, on: boolean): Promise<void>
  /** Owner, developer and manager: the shop's opening hours (the frame for every barber). */
  saveBusinessHours(weekly: WeeklySchedule): Promise<BusinessHoursChange>
  /** Owner and manager: e-mail test mode and the latest e-mails. */
  getEmailSettings(): Promise<EmailSettings>
  setCustomerEmails(on: boolean): Promise<void>
  /** Counter sale of products (prices and commissions from the catalog). */
  createSale(input: {
    items: { productId: ID; qty: number }[]
    staffId: ID | null
    method: PaymentMethod
  }): Promise<ProductSale>

  // Settings (Ajustes). Owner and manager. Supabase: a settings row and the profiles table.
  getSettings(): Promise<AdminSettings>
  /** Errors: InvalidRequestError. Returns how many loyalty cards a lower goal completed. */
  savePolicy(input: PolicyInput): Promise<{ policy: BookingPolicy; cardsCompleted: number }>
  /**
   * Owner only. Invite (no id) or update a user. Rules: unique email, a barber is
   * linked to one profile, nobody demotes or deactivates themselves, and there is
   * always an active owner. Supabase: auth.admin.inviteUserByEmail + profiles.
   */
  saveUser(input: UserInput): Promise<AdminUser>

  // Products (sold at the shop). Cost, commission and margin are for owner and manager only.
  listProducts(): Promise<Product[]>
  saveProduct(input: ProductInput): Promise<Product>
  deleteProduct(id: ID): Promise<void>
  /**
   * Store a product photo (already resized by the browser) and return its URL.
   * Supabase: upload to a Storage bucket and return the public URL.
   */
  uploadProductImage(image: Blob): Promise<string>

  /**
   * Live updates: called on every change to appointments or blocks. Supabase:
   * a Realtime channel on those tables. Returns the unsubscribe function.
   */
  subscribe(listener: (change: AdminChange) => void): () => void

  /**
   * Sections this data source already supports (others show "llega pronto").
   * Undefined: every section (the demo).
   */
  available?: readonly string[]
  /**
   * Second step not set up yet: start it and return the QR code (SVG data URL)
   * and the secret to type by hand; null when the account already has it.
   */
  mfaEnrollment?(): Promise<{ qrCode: string; secret: string } | null>
  /** E-mail a link to set a new password. */
  requestPasswordReset?(email: string): Promise<void>
  /** Set the password of the signed-in account (after an invitation or reset link). */
  setPassword?(password: string): Promise<void>

  /** Demo-only helpers; the Supabase implementation leaves this undefined. */
  demo?: {
    /** Book like a customer would on the public site (to try notifications with one tab). */
    simulateOnlineBooking(): Promise<Appointment>
    users: AdminUser[]
    password: string
    /** Jump straight into a user's session (second step already passed). */
    switchTo(userId: string): Promise<AdminSession>
  }
}
