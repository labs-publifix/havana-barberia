export type ID = string

export interface Service {
  id: ID
  name: string
  description: string
  durationMin: number
  price: number // MXN
  active: boolean
}

export interface Barber {
  id: ID
  name: string
  bio: string
  active: boolean
  /** Días que trabaja (0 = domingo … 6 = sábado). */
  workDays: number[]
}

/** Horario del negocio por día de la semana; null = cerrado. */
export interface DayHours {
  open: string // "HH:MM"
  close: string // "HH:MM"
}

export interface BusinessSettings {
  name: string
  phone: string
  address: string
  /** Índice 0 = domingo. */
  hours: (DayHours | null)[]
  slotStepMin: number
  /** Minutos mínimos de anticipación para reservar. */
  minNoticeMin: number
  /** Días hacia adelante en los que se puede reservar. */
  bookingWindowDays: number
}

export type AppointmentStatus = 'confirmada' | 'completada' | 'cancelada' | 'no_asistio'

export interface Appointment {
  id: ID
  serviceId: ID
  barberId: ID
  /** Fecha local "YYYY-MM-DD". */
  date: string
  /** Hora local de inicio "HH:MM". */
  start: string
  durationMin: number
  price: number
  customerName: string
  customerPhone: string
  notes: string
  status: AppointmentStatus
  createdAt: string
}

export type NewAppointment = Omit<Appointment, 'id' | 'status' | 'createdAt' | 'durationMin' | 'price'>

export interface DataSnapshot {
  services: Service[]
  barbers: Barber[]
  settings: BusinessSettings
  appointments: Appointment[]
}
