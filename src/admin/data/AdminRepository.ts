import type { AdminSession, AdminUser } from '../domain'

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
  /** Demo-only helpers; the Supabase implementation leaves this undefined. */
  demo?: {
    users: AdminUser[]
    password: string
    /** Jump straight into a user's session (second step already passed). */
    switchTo(userId: string): Promise<AdminSession>
  }
}
