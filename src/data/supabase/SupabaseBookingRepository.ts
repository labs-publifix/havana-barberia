import type {
  Appointment,
  BookingPolicy,
  BusinessHours,
  LoyaltyCard,
  NewAppointment,
  Slot,
  Staff,
} from '@/domain/types'
import { must, supabase } from '@/lib/supabase'
import { computeSlots, staffForServices, totalDuration } from '@/lib/availability'
import { addDays, zonedInstant } from '@/lib/time'
import { humanCheck } from '@/lib/turnstile'
import type { BookingRepository, ServiceCatalog, SlotQuery } from '../BookingRepository'
import {
  BookingLimitError,
  ChangeWindowClosedError,
  InvalidRequestError,
  NotFoundError,
  SlotUnavailableError,
} from '../errors'
import {
  toCategory,
  toPolicy,
  toService,
  toStaff,
  type CategoryRow,
  type ServiceRow,
  type SettingsRow,
  type StaffRow,
} from './rows'

const TURNSTILE_SITE_KEY = import.meta.env.VITE_TURNSTILE_SITE_KEY as string | undefined

/** Turn the Edge Function's refusal into the errors the booking screens explain. */
async function refusal(error: unknown): Promise<Error> {
  const body = (await (error as { context?: Response }).context?.json?.().catch(() => null)) as {
    code?: string
    message?: string
    alternatives?: Slot[]
    limit?: number
    cutoffHours?: number
  } | null
  switch (body?.code) {
    case 'slot_unavailable':
      return new SlotUnavailableError(body.alternatives ?? [])
    case 'booking_limit':
      return new BookingLimitError(body.limit ?? 2)
    case 'change_window_closed':
      return new ChangeWindowClosedError(body.cutoffHours ?? 4)
    case 'not_found':
      return new NotFoundError('esa cita')
    default:
      return new InvalidRequestError(body?.message ?? 'No pudimos completar la solicitud. Intenta de nuevo.')
  }
}

export class SupabaseBookingRepository implements BookingRepository {
  async listServices(): Promise<ServiceCatalog> {
    const db = supabase()
    const [cats, services] = await Promise.all([
      db.from('categories').select('id, name, sort').order('sort'),
      db.from('services').select('*').eq('active', true).order('sort'),
    ])
    return {
      categories: must<CategoryRow[]>(cats).map(toCategory),
      services: must<ServiceRow[]>(services).map(toService),
    }
  }

  async listStaff(): Promise<Staff[]> {
    const db = supabase()
    const [staff, links] = await Promise.all([
      db.from('staff').select('*').eq('active', true).order('sort'),
      db.from('staff_services').select('staff_id, service_id'),
    ])
    const l = must<{ staff_id: string; service_id: string }[]>(links)
    return must<StaffRow[]>(staff).map((r) => toStaff(r, l))
  }

  async getPolicy(): Promise<BookingPolicy> {
    return toPolicy(must<SettingsRow>(await supabase().from('settings').select('*').eq('id', 1).single()))
  }

  async unsubscribe(token: string): Promise<string | null> {
    const { data, error } = await supabase().rpc('unsubscribe', { p_token: token })
    if (error) throw error
    return (data as string | null) ?? null
  }

  async getBusinessHours(): Promise<BusinessHours> {
    const row = must<{ business_hours: BusinessHours['weekly']; time_zone: string }>(
      await supabase().from('settings').select('business_hours, time_zone').eq('id', 1).single(),
    )
    return { timeZone: row.time_zone, weekly: row.business_hours }
  }

  /** Computed in the browser with the same engine the server checks against. */
  async getAvailableSlots(q: SlotQuery): Promise<Slot[]> {
    const db = supabase()
    const [settingsRes, staff, catalog] = await Promise.all([
      db.from('settings').select('*').eq('id', 1).single(),
      this.listStaff(),
      this.listServices(),
    ])
    const settings = must<SettingsRow & { time_zone: string }>(settingsRes)
    const services = catalog.services.filter((s) => q.serviceIds.includes(s.id))
    if (!services.length || services.length !== q.serviceIds.length) return []
    const tz = settings.time_zone
    const busy = must<BusyRow[]>(
      await db.rpc('busy_slots', {
        from_at: zonedInstant(q.date, '00:00', tz).toISOString(),
        to_at: zonedInstant(addDays(q.date, 1), '00:00', tz).toISOString(),
      }),
    )
    const candidates = staffForServices(staff, q.serviceIds)
    return computeSlots({
      date: q.date,
      durationMin: totalDuration(services),
      staff: q.staffId === 'any' ? candidates : candidates.filter((s) => s.id === q.staffId),
      hours: { timeZone: tz, weekly: settings.business_hours },
      policy: toPolicy(settings),
      appointments: busy
        .filter((b) => !b.is_block)
        .map((b) => ({
          id: b.id,
          staffId: b.staff_id!,
          startsAt: b.starts_at,
          endsAt: b.ends_at,
          status: 'confirmed',
        })),
      blocks: busy
        .filter((b) => b.is_block)
        .map((b) => ({ id: b.id, staffId: b.staff_id, startsAt: b.starts_at, endsAt: b.ends_at, reason: '' })),
      now: new Date(),
      excludeAppointmentId: q.excludeAppointmentId,
    })
  }

  private async call<T>(body: Record<string, unknown>): Promise<T> {
    const { data, error } = await supabase().functions.invoke('booking', { body })
    if (error) throw await refusal(error)
    return data as T
  }

  async createAppointment(input: NewAppointment): Promise<Appointment> {
    if (!TURNSTILE_SITE_KEY)
      throw new InvalidRequestError('La reserva en línea no está disponible. Escríbenos por WhatsApp.')
    const turnstileToken = await humanCheck(TURNSTILE_SITE_KEY, 'booking').catch((e: Error) => {
      throw new InvalidRequestError(e.message)
    })
    const { appointment } = await this.call<{ appointment: Appointment }>({
      action: 'create',
      turnstileToken,
      ...input,
    })
    return appointment
  }

  async getAppointmentByToken(token: string): Promise<Appointment | null> {
    const { data, error } = await supabase().rpc('appointment_by_token', { p_token: token })
    if (error) throw error
    const a = (data as TokenAppointmentRow[] | null)?.[0]
    if (!a) return null
    return {
      id: a.id,
      token: a.token,
      customerId: '',
      customer: { name: a.customer_name, phone: '', email: '' },
      staffId: a.staff_id,
      serviceIds: a.service_ids,
      startsAt: new Date(a.starts_at).toISOString(),
      endsAt: new Date(a.ends_at).toISOString(),
      durationMin: a.duration_min,
      totalPrice: a.total_price,
      status: a.status,
      notes: '',
      createdAt: '',
      loyaltyToken: a.loyalty_token,
    }
  }

  async cancelAppointment(token: string): Promise<void> {
    await this.call({ action: 'cancel', token })
  }

  async rescheduleAppointment(token: string, slot: Pick<Slot, 'startsAt'>): Promise<Appointment> {
    const { appointment } = await this.call<{ appointment: Appointment }>({
      action: 'reschedule',
      token,
      startsAt: slot.startsAt,
    })
    return appointment
  }

  async getLoyaltyCardByToken(token: string): Promise<LoyaltyCard | null> {
    const { data, error } = await supabase().rpc('loyalty_by_token', { p_token: token })
    if (error) throw error
    const c = (data as TokenCardRow[] | null)?.[0]
    if (!c) return null
    return {
      token: c.token,
      customerId: '',
      customerFirstName: c.customer_first_name,
      stamps: c.stamps,
      goal: c.goal,
      rewardExpiresAt: c.reward_expires_at,
    }
  }
}

interface BusyRow {
  id: string
  staff_id: string | null
  starts_at: string
  ends_at: string
  is_block: boolean
}

interface TokenAppointmentRow {
  id: string
  token: string
  staff_id: string
  service_ids: string[]
  starts_at: string
  ends_at: string
  duration_min: number
  total_price: number
  status: Appointment['status']
  customer_name: string
  loyalty_token: string | null
}

interface TokenCardRow {
  token: string
  customer_first_name: string
  stamps: number
  goal: number
  reward_expires_at: string | null
}
