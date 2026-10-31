/**
 * Booking domain. Pure TypeScript, camelCase, no framework or storage details.
 * The future Supabase implementation maps its snake_case rows to these types.
 */

export type ID = string
/** Calendar date in the business time zone, "YYYY-MM-DD". */
export type LocalDate = string
/** Wall-clock time in the business time zone, "HH:mm". */
export type LocalTime = string
/** Absolute instant, ISO 8601 in UTC ("2026-11-02T16:00:00.000Z"). */
export type Instant = string

export interface TimeRange {
  start: LocalTime
  end: LocalTime
}

/** Index 0 = Sunday … 6 = Saturday. An empty array means closed that day. */
export type WeeklySchedule = TimeRange[][]

export interface BusinessHours {
  timeZone: string
  weekly: WeeklySchedule
}

export interface ServiceCategory {
  id: ID
  name: string
  order: number
}

export interface Service {
  id: ID
  categoryId: ID
  name: string
  description: string
  durationMin: number
  /** MXN, whole pesos. */
  price: number
  active: boolean
  order: number
  /** Counts toward the loyalty card when the appointment is completed. */
  loyaltyEligible: boolean
}

export interface Staff {
  id: ID
  name: string
  role: 'barber'
  photoUrl: string | null
  active: boolean
  order: number
  /** Services this person performs; "all" for every active service. */
  serviceIds: ID[] | 'all'
  schedule: WeeklySchedule
}

/** Time the shop or a barber is not bookable (lunch, vacation, holiday, walk-in). */
export interface TimeBlock {
  id: ID
  /** null = whole shop. */
  staffId: ID | null
  startsAt: Instant
  endsAt: Instant
  reason: string
}

export interface CustomerContact {
  name: string
  /** National 10-digit format, digits only. */
  phone: string
  email: string
}

export interface Customer extends CustomerContact {
  id: ID
  createdAt: Instant
}

export type AppointmentStatus = 'booked' | 'confirmed' | 'completed' | 'cancelled' | 'no_show'

export interface Appointment {
  id: ID
  /** Unguessable token used in links to manage the appointment. */
  token: string
  customerId: ID
  customer: CustomerContact
  staffId: ID
  serviceIds: ID[]
  startsAt: Instant
  endsAt: Instant
  durationMin: number
  totalPrice: number
  status: AppointmentStatus
  notes: string
  createdAt: Instant
  /** Token of the customer's loyalty card, if any. */
  loyaltyToken: string | null
}

export interface LoyaltyCard {
  token: string
  customerId: ID
  customerFirstName: string
  stamps: number
  goal: number
  /** Set when the card is full; the free cut must be redeemed before this date. */
  rewardExpiresAt: Instant | null
}

export interface BookingPolicy {
  slotStepMin: number
  minNoticeMin: number
  maxAdvanceDays: number
  /** Minutes a barber waits before the slot can be released as no-show. */
  toleranceMin: number
  /** Optional cleanup time after each appointment. */
  bufferMin: number
  /** Cancel or reschedule allowed up to this many minutes before start. */
  changeCutoffMin: number
  maxActiveAppointmentsPerCustomer: number
  loyaltyGoal: number
  rewardValidityDays: number
}

export interface Slot {
  startsAt: Instant
  endsAt: Instant
  /** Local start time "HH:mm" for display and grouping. */
  time: LocalTime
  available: boolean
  /** Barber that would take this slot (assigned for "any"); null when unavailable. */
  staffId: ID | null
}

export type StaffChoice = ID | 'any'

export interface NewAppointment {
  serviceIds: ID[]
  staffId: StaffChoice
  startsAt: Instant
  customer: CustomerContact
  notes: string
  privacyAccepted: true
}
