import type {
  Appointment,
  AppointmentSource,
  ID,
  Instant,
  LocalDate,
  LoyaltyCard,
  PaymentMethod,
  Service,
  ServiceCategory,
  Staff,
  StaffChoice,
  TimeBlock,
  TimeRange,
} from '@/domain/types'

/**
 * Admin domain. Roles come from the project fundamentals:
 * owner and manager see finances; reception runs the day; a barber only sees
 * their own agenda and commissions.
 */
export type AdminRole = 'owner' | 'manager' | 'reception' | 'barber'

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
  manager: 'Gerente',
  reception: 'Recepción',
  barber: 'Barbero',
}

export const roleSummaries: Record<AdminRole, string> = {
  owner: 'Acceso completo',
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
