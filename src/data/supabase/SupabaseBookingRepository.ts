import type { Appointment, BookingPolicy, LoyaltyCard, NewAppointment, Slot, Staff } from '@/domain/types'
import { must, supabase } from '@/lib/supabase'
import type { BookingRepository, ServiceCatalog, SlotQuery } from '../BookingRepository'
import { InvalidRequestError } from '../errors'
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

/** Online booking arrives with Edge Functions (Turnstile and limits, entrega 3 of hito 1C). */
class BookingNotOpenError extends InvalidRequestError {
  constructor() {
    super('La reserva en línea abre muy pronto. Mientras tanto, llámanos o escríbenos por WhatsApp.')
  }
}

/**
 * The public site against Supabase. Reads go straight to tables the public
 * may read (RLS); anything that changes data goes through Edge Functions.
 */
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

  async getAvailableSlots(_q: SlotQuery): Promise<Slot[]> {
    return []
  }

  createAppointment(_input: NewAppointment): Promise<Appointment> {
    return Promise.reject(new BookingNotOpenError())
  }

  getAppointmentByToken(_token: string): Promise<Appointment | null> {
    return Promise.resolve(null)
  }

  cancelAppointment(_token: string): Promise<void> {
    return Promise.reject(new BookingNotOpenError())
  }

  rescheduleAppointment(_token: string, _slot: Pick<Slot, 'startsAt'>): Promise<Appointment> {
    return Promise.reject(new BookingNotOpenError())
  }

  getLoyaltyCardByToken(_token: string): Promise<LoyaltyCard | null> {
    return Promise.resolve(null)
  }
}
