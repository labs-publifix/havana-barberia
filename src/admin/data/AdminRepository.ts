import type { Appointment, Customer, ID, LocalDate, LoyaltyCard, Slot, TimeBlock } from '@/domain/types'
import type { SlotQuery } from '@/data'
import type {
  AdminChange,
  AdminNewAppointment,
  AdminSession,
  AdminUser,
  AgendaDay,
  NewBlock,
  StaffStatusChange,
  StatusChangeResult,
} from '../domain'

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
  createAppointment(input: AdminNewAppointment): Promise<Appointment>
  rescheduleAppointment(id: ID, change: { startsAt: string; staffId: ID }): Promise<Appointment>
  updateAppointmentNotes(id: ID, notes: string): Promise<Appointment>
  createBlock(input: NewBlock): Promise<TimeBlock>
  deleteBlock(id: ID): Promise<void>
  findCustomers(query: string): Promise<Customer[]>
  getLoyaltyForCustomer(customerId: ID): Promise<LoyaltyCard | null>
  /**
   * Live updates: called on every change to appointments or blocks. Supabase:
   * a Realtime channel on those tables. Returns the unsubscribe function.
   */
  subscribe(listener: (change: AdminChange) => void): () => void

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
