import type { Appointment, Customer, ID, LocalDate, LoyaltyCard, Slot, TimeBlock } from '@/domain/types'
import type { SlotQuery } from '@/data'
import { businessHours } from '@/config/business'
import { MockBookingRepository } from '@/data/mock/MockBookingRepository'
import { localDate, weekdayOf } from '@/lib/time'
import type {
  AdminNewAppointment,
  AdminSession,
  AdminUser,
  AgendaDay,
  NewBlock,
  StaffStatusChange,
  StatusChangeResult,
} from '../../domain'
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
    return {
      date,
      timeZone: tz,
      hours: businessHours.weekly[weekdayOf(date)] ?? [],
      staff: db.staff.filter((s) => s.active).sort((a, b) => a.order - b.order),
      services: db.services,
      appointments: db.appointments
        .filter((a) => localDate(a.startsAt, tz) === date)
        .sort((a, b) => a.startsAt.localeCompare(b.startsAt)),
      blocks: db.blocks.filter((b) => localDate(b.startsAt, tz) <= date && date <= localDate(b.endsAt, tz)),
    }
  }

  async getAvailableSlots(query: SlotQuery): Promise<Slot[]> {
    await this.delay()
    return this.booking.adminSlots(query)
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

  demo = {
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
