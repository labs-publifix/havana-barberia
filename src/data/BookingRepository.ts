import type {
  Appointment,
  ID,
  LocalDate,
  LoyaltyCard,
  NewAppointment,
  Service,
  ServiceCategory,
  Slot,
  Staff,
  StaffChoice,
} from '@/domain/types'

export interface SlotQuery {
  serviceIds: ID[]
  staffId: StaffChoice
  date: LocalDate
  /** When rescheduling: this appointment's own time is not counted as busy. */
  excludeAppointmentId?: ID
}

export interface ServiceCatalog {
  categories: ServiceCategory[]
  services: Service[]
}

/**
 * The only way the UI reads or writes booking data. Today: MockBookingRepository.
 * Next: a Supabase implementation of this same interface (see docs/ARCHITECTURE.md).
 */
export interface BookingRepository {
  listServices(): Promise<ServiceCatalog>
  listStaff(): Promise<Staff[]>
  getAvailableSlots(query: SlotQuery): Promise<Slot[]>
  createAppointment(input: NewAppointment): Promise<Appointment>
  getAppointmentByToken(token: string): Promise<Appointment | null>
  cancelAppointment(token: string): Promise<void>
  rescheduleAppointment(token: string, slot: Pick<Slot, 'startsAt'>): Promise<Appointment>
  getLoyaltyCardByToken(token: string): Promise<LoyaltyCard | null>
}
