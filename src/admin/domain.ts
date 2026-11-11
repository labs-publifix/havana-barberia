import { InvalidRequestError } from '@/data/errors'
import type { Expense, ExpenseCategory } from './profit'
import type {
  Appointment,
  BookingPolicy,
  AppointmentSource,
  ID,
  Instant,
  LocalDate,
  LoyaltyCard,
  PaymentMethod,
  Product,
  Service,
  ServiceCategory,
  Staff,
  StaffChoice,
  StaffCommission,
  TimeBlock,
  TimeRange,
  WeeklySchedule,
} from '@/domain/types'
import type {
  Advance,
  BonusAward,
  CashMove,
  CommissionVersion,
  DailyClose,
  FinanceSettings,
  PayrollClose,
  ProductSale,
} from './finance'

/**
 * Admin domain. Roles come from the project fundamentals:
 * owner and manager see finances; reception runs the day; a barber only sees
 * their own agenda and commissions.
 */
export type AdminRole = 'owner' | 'developer' | 'manager' | 'reception' | 'barber'

/** Owner, or the developer (same access, to verify everything with a real account). */
export const isOwnerRole = (role: AdminRole | null | undefined) => role === 'owner' || role === 'developer'
/** Owner, developer and manager: money, commissions, costs and corrections. */
export const isFinanceRole = (role: AdminRole | null | undefined) => isOwnerRole(role) || role === 'manager'

export interface AdminUser {
  id: ID
  name: string
  email: string
  role: AdminRole
  /** Linked barber profile (role "barber"), so the agenda can filter to it. */
  staffId: ID | null
  /** Owner and manager must use two-step verification. */
  mfaRequired: boolean
  active: boolean
}

export interface AdminSession {
  user: AdminUser
  /** False until the second step is passed (only when the user requires it). */
  mfaVerified: boolean
}

export const roleLabels: Record<AdminRole, string> = {
  owner: 'Dueño',
  developer: 'Desarrollador',
  manager: 'Gerente',
  reception: 'Recepción',
  barber: 'Barbero',
}

export const roleSummaries: Record<AdminRole, string> = {
  owner: 'Acceso completo',
  developer: 'Acceso completo, para revisar que todo funcione',
  manager: 'Operación y finanzas',
  reception: 'Agenda, clientes y ventas',
  barber: 'Su agenda y comisiones',
}

/** A session is usable once the second step is done (or not required). */
export const isSessionComplete = (s: AdminSession | null | undefined): boolean =>
  !!s && (!s.user.mfaRequired || s.mfaVerified)

/** Everything the admin needs to show one day: who works, what was booked, what is blocked. */
export interface AgendaDay {
  date: LocalDate
  timeZone: string
  /** Shop opening hours that day (empty when closed). */
  hours: TimeRange[]
  staff: Staff[]
  services: Service[]
  appointments: Appointment[]
  blocks: TimeBlock[]
}

/** Status changes staff can make from the panel. */
export type StaffStatusChange = 'confirmed' | 'no_show' | 'cancelled'

/** Payment captured when completing an appointment (amount = the appointment's price). */
export interface PaymentInput {
  method: PaymentMethod
  /** 0 when no tip. */
  tip: number
  tipMethod: PaymentMethod
  /** Redeem the loyalty free cut (a haircut is not charged and pays no commission). */
  useReward?: boolean
  /** Mixed payment (sums to services + products, without the tip). */
  splits?: { method: PaymentMethod; amount: number }[]
  /** Products sold in the same ticket. */
  products?: { productId: ID; qty: number }[]
  /**
   * Discount on the services. Owner and manager authorize their own; anyone
   * else needs an owner's or manager's email and password (Supabase: re-auth).
   */
  discount?: { amount: number; reason: string; authorizer?: { email: string; password: string } }
}

export interface StatusChangeResult {
  appointment: Appointment
  /** Customer's card after the change (a completed appointment can add a stamp). */
  loyalty: LoyaltyCard | null
  stampAdded: boolean
}

/** Customer for a panel booking: an existing one, or new details (phone optional for walk-ins). */
export type PanelCustomer = { id: ID } | { name: string; phone: string; email: string }

export interface AdminNewAppointment {
  serviceIds: ID[]
  staffId: StaffChoice
  startsAt: Instant
  customer: PanelCustomer
  notes: string
  source: Exclude<AppointmentSource, 'online'>
}

export interface NewBlock {
  /** null = whole shop. */
  staffId: ID | null
  startsAt: Instant
  endsAt: Instant
  reason: string
}

/**
 * Something changed in the data (from this device, another tab or, with
 * Supabase, another device). `created` lists new appointments so the panel can
 * announce them.
 */
export interface AdminChange {
  created: Appointment[]
}

/** Everything the catalog screen needs, including hidden services. */
export interface AdminCatalog {
  categories: ServiceCategory[]
  /** All services (active and hidden), by category then order. */
  services: Service[]
  staff: Staff[]
  /** Barbers who perform each service. */
  staffFor: Record<ID, ID[]>
  /** Appointments that use each service (a used service is hidden, not deleted). */
  usage: Record<ID, number>
}

export interface ServiceInput {
  /** Missing for a new service. */
  id?: ID
  categoryId: ID
  name: string
  description: string
  durationMin: number
  /** MXN, whole pesos; the same with every barber. */
  price: number
  loyaltyEligible: boolean
  /** Visible on the site and in booking. */
  active: boolean
  staffIds: ID[]
}

export interface ProductInput {
  /** Missing for a new product. */
  id?: ID
  name: string
  brand: string
  price: number
  /** null = not captured yet. */
  cost: number | null
  commission: number | null
  imageUrl: string | null
  active: boolean
}

/** Ajustes: the rules plus the services that can earn a loyalty stamp. */
export interface AdminSettings {
  policy: BookingPolicy
  /** Visible services, in site order (each with loyaltyEligible). */
  services: Service[]
}

/** Ajustes › Correos: whether customers receive e-mails, and the latest ones sent. */
export interface EmailSettings {
  /** Off: every e-mail goes only to the review copy (test mode). */
  customerEmails: boolean
  /** Besides the barber, who hears about every online booking and cancellation (up to 5). */
  teamEmails: string[]
  /** Direct link to leave a Google review (empty: the Google Maps profile). */
  googleReviewUrl: string
  recent: SentEmail[]
}

export interface SentEmail {
  id: string
  kind:
    | 'confirmation'
    | 'reschedule'
    | 'cancellation'
    | 'reminder_24h'
    | 'reminder_2h'
    | 'team_new'
    | 'team_cancel'
    | 'thank_you'
  status: 'pending' | 'sending' | 'sent' | 'failed' | 'skipped'
  to: string | null
  subject: string | null
  error: string | null
  createdAt: string
  sentAt: string | null
}

/** Result of saving the shop's hours: what no longer fits, so the shop can fix it. */
export interface BusinessHoursChange {
  weekly: WeeklySchedule
  /** Barbers with shifts outside the new hours (those times simply stop being bookable). */
  staffOutside: { id: ID; name: string; days: number[] }[]
  /** Upcoming appointments outside the new hours (they stay; move them if needed). */
  appointmentsOutside: Appointment[]
}

export interface PolicyInput {
  policy: BookingPolicy
  /** Services that add a stamp when completed. */
  loyaltyServiceIds: ID[]
}

/** Create (no id) or update a panel user. Owner and manager always need two-step verification. */
export interface UserInput {
  id?: ID
  name: string
  email: string
  role: AdminRole
  /** Required for barbers: their profile in Equipo. */
  staffId: ID | null
  active: boolean
  /** New users: create the account confirmed with this temporary password (no invitation e-mail). */
  password?: string
}

/** One day of the drawer: what was charged, cash moves and the count if closed. */
export interface CashDay {
  date: LocalDate
  appointments: Appointment[]
  sales: ProductSale[]
  moves: CashMove[]
  close: DailyClose | null
}

/** A period of finance data (phase-2 preview). */
export interface AdminFinance {
  appointments: Appointment[]
  services: Service[]
  staff: Staff[]
  /** Owner and manager only (a barber gets their own). */
  commissions: StaffCommission[]
  commissionHistory: CommissionVersion[]
  advances: Advance[]
  sales: ProductSale[]
  settings: FinanceSettings
  bonusAwards: BonusAward[]
  /** The payroll week starting on `from`, if it was closed. */
  close: PayrollClose | null
}

export interface AdminTeam {
  /** Every barber (active or not), in site order. */
  staff: Staff[]
  /** Owner and manager only (Supabase: a separate table under RLS). */
  commissions: StaffCommission[]
  commissionHistory: CommissionVersion[]
  /** Upcoming time off (per barber and shop-wide). */
  blocks: TimeBlock[]
  /** Where each barber receives notices of their appointments (owner, developer and manager only). */
  emails?: Record<ID, string>
}

export interface StaffInput {
  /** Missing for a new barber. */
  id?: ID
  name: string
  title: string
  /** Shown on the site under the name. */
  bio: string
  /** Notices of their appointments; undefined leaves it as it was (roles that can't see it). */
  email?: string
  photoUrl: string | null
  /** Shows in booking and on the site. */
  active: boolean
  schedule: WeeklySchedule
  serviceIds: ID[]
  /** Owner and manager only; undefined leaves it as it was. */
  commission?: Omit<StaffCommission, 'staffId'>
  /** When a changed commission starts to apply (default: today). Past weeks keep their rule. */
  commissionFrom?: LocalDate
}

/** Notice e-mails for the team: trimmed, lower-case, no repeats, up to 5; refuses invalid ones. */
export function cleanEmails(emails: string[]): string[] {
  const list = [...new Set(emails.map((e) => e.trim().toLowerCase()).filter(Boolean))]
  const bad = list.find((e) => !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e))
  if (bad) throw new InvalidRequestError(`Revisa el correo «${bad}».`)
  if (list.length > 5) throw new InvalidRequestError('Hasta 5 correos.')
  return list
}

/** Everything Finanzas › Utilidades needs for a period (owner, developer and manager). */
export interface ProfitData {
  finance: AdminFinance
  products: Pick<Product, 'id' | 'name' | 'cost'>[]
  expenses: Expense[]
  payrollCloses: PayrollClose[]
  /** Cash-drawer withdrawals in the period (count as expense only when Leo says so). */
  cashOuts: CashMove[]
}

export interface ExpenseInput {
  date: LocalDate
  category: ExpenseCategory
  concept: string
  amount: number
  method: 'cash' | 'card' | 'transfer'
  /** When it comes from a cash-drawer withdrawal. */
  cashMoveId?: ID | null
}

/** The Google review link as saved: https only, or empty (falls back to the Maps profile). */
export function reviewUrl(url: string): string {
  const u = url.trim()
  if (!u) return ''
  if (!/^https:\/\/\S+$/.test(u)) throw new InvalidRequestError('Pega el enlace completo, empieza con https://')
  return u
}
