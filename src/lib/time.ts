import type { Appointment, Barber, BusinessSettings } from '../data/types'

export const toMin = (hhmm: string): number => {
  const [h, m] = hhmm.split(':').map(Number)
  return h * 60 + m
}

export const toHHMM = (min: number): string =>
  `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`

/** "YYYY-MM-DD" en hora local. */
export const isoDate = (d: Date): string =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

export const parseDate = (iso: string): Date => {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d)
}

export const addDays = (iso: string, n: number): string => {
  const d = parseDate(iso)
  d.setDate(d.getDate() + n)
  return isoDate(d)
}

export const weekday = (iso: string): number => parseDate(iso).getDay()

const blocking = (a: Appointment) => a.status === 'confirmada' || a.status === 'completada'

export interface SlotQuery {
  date: string
  durationMin: number
  barber: Barber
  settings: BusinessSettings
  appointments: Appointment[]
  /** Momento actual; inyectable para pruebas. */
  now?: Date
  /** Cita que se está editando y no debe contar como ocupada. */
  ignoreId?: string
}

/** Horas de inicio libres para un barbero en una fecha. */
export function availableSlots(q: SlotQuery): string[] {
  const { date, durationMin, barber, settings } = q
  const now = q.now ?? new Date()
  const wd = weekday(date)
  const hours = settings.hours[wd]
  if (!hours || !barber.active || !barber.workDays.includes(wd)) return []

  const open = toMin(hours.open)
  const close = toMin(hours.close)
  const busy = q.appointments
    .filter((a) => a.barberId === barber.id && a.date === date && blocking(a) && a.id !== q.ignoreId)
    .map((a) => [toMin(a.start), toMin(a.start) + a.durationMin] as const)

  const today = isoDate(now)
  const earliest =
    date < today ? Infinity : date === today ? now.getHours() * 60 + now.getMinutes() + settings.minNoticeMin : -Infinity

  const slots: string[] = []
  for (let t = open; t + durationMin <= close; t += settings.slotStepMin) {
    if (t < earliest) continue
    const end = t + durationMin
    if (busy.some(([s, e]) => t < e && s < end)) continue
    slots.push(toHHMM(t))
  }
  return slots
}

const DAY_NAMES = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado']
export const dayName = (wd: number) => DAY_NAMES[wd]

export const formatDateLong = (iso: string) =>
  parseDate(iso).toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long' })

export const formatDateShort = (iso: string) =>
  parseDate(iso).toLocaleDateString('es-MX', { weekday: 'short', day: 'numeric', month: 'short' })

/** "13:30" → "1:30 p.m." */
export const formatTime = (hhmm: string) => {
  const m = toMin(hhmm)
  const h = Math.floor(m / 60)
  const h12 = h % 12 === 0 ? 12 : h % 12
  return `${h12}:${String(m % 60).padStart(2, '0')} ${h < 12 ? 'a.m.' : 'p.m.'}`
}

export const money = (n: number) =>
  n.toLocaleString('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 0 })
