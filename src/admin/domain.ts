import type { Appointment, ID, LocalDate, Service, Staff, TimeBlock, TimeRange } from '@/domain/types'

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
