import { format, parseISO } from 'date-fns'
import { es } from 'date-fns/locale'
import { formatInTimeZone, fromZonedTime } from 'date-fns-tz'
import type { BusinessHours, Instant, LocalDate, LocalTime } from '@/domain/types'

/**
 * Time helpers. Everything is computed in the business time zone and never
 * depends on the device's time zone.
 */

export const toMinutes = (t: LocalTime): number => {
  const [h = 0, m = 0] = t.split(':').map(Number)
  return h * 60 + m
}

export const fromMinutes = (min: number): LocalTime =>
  `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`

/** Business-local calendar date for an instant. */
export const localDate = (at: Date | Instant, timeZone: string): LocalDate =>
  formatInTimeZone(at, timeZone, 'yyyy-MM-dd')

/** Business-local "HH:mm" for an instant. */
export const localTime = (at: Date | Instant, timeZone: string): LocalTime => formatInTimeZone(at, timeZone, 'HH:mm')

/** UTC instant for a business-local date + time. */
export const zonedInstant = (date: LocalDate, time: LocalTime, timeZone: string): Date =>
  fromZonedTime(`${date}T${time}:00`, timeZone)

/** Weekday of a calendar date (0 = Sunday), independent of any time zone. */
export const weekdayOf = (date: LocalDate): number => {
  const [y, m, d] = date.split('-').map(Number)
  return new Date(Date.UTC(y!, m! - 1, d!)).getUTCDay()
}

export const addDays = (date: LocalDate, n: number): LocalDate => {
  const [y, m, d] = date.split('-').map(Number)
  const t = new Date(Date.UTC(y!, m! - 1, d! + n))
  return t.toISOString().slice(0, 10)
}

/** Format a calendar date without involving time zones. */
const dateForFormat = (date: LocalDate) => parseISO(`${date}T12:00:00`)

export const formatDay = (date: LocalDate, pattern: string) => format(dateForFormat(date), pattern, { locale: es })

/** "lun. 2 de noviembre" */
export const formatDateShort = (date: LocalDate) => formatDay(date, "EEE d 'de' MMMM")
/** "lunes 2 de noviembre" */
export const formatDateLong = (date: LocalDate) => formatDay(date, "EEEE d 'de' MMMM")

/** "10:00 a. m." */
export const formatTime12 = (time: LocalTime) => {
  const min = toMinutes(time)
  const h = Math.floor(min / 60)
  const h12 = h % 12 === 0 ? 12 : h % 12
  return `${h12}:${String(min % 60).padStart(2, '0')} ${h < 12 ? 'a. m.' : 'p. m.'}`
}

/** "4:15" (no suffix; used inside Mañana/Tarde groups) */
export const formatTimeCompact = (time: LocalTime) => formatTime12(time).replace(/ [ap]\. m\.$/, '')

/** "lun. 2 de noviembre, 10:00 a. m." for an instant. */
export const formatInstant = (at: Instant, timeZone: string) =>
  `${formatDateShort(localDate(at, timeZone))}, ${formatTime12(localTime(at, timeZone))}`

export const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

export interface OpenState {
  open: boolean
  /** When closed: next opening, e.g. { date, time } */
  next?: { date: LocalDate; time: LocalTime; isToday: boolean; isTomorrow: boolean }
  /** When open: closing time today. */
  closesAt?: LocalTime
}

/** Whether the shop is open at `now`, and when it opens next. */
export function openState(hours: BusinessHours, now: Date): OpenState {
  const today = localDate(now, hours.timeZone)
  const nowMin = toMinutes(localTime(now, hours.timeZone))
  const ranges = hours.weekly[weekdayOf(today)] ?? []
  const current = ranges.find((r) => nowMin >= toMinutes(r.start) && nowMin < toMinutes(r.end))
  if (current) return { open: true, closesAt: current.end }
  for (let i = 0; i <= 7; i++) {
    const date = addDays(today, i)
    const next = (hours.weekly[weekdayOf(date)] ?? []).find((r) => i > 0 || toMinutes(r.start) > nowMin)
    if (next) return { open: false, next: { date, time: next.start, isToday: i === 0, isTomorrow: i === 1 } }
  }
  return { open: false }
}

export const money = (n: number) =>
  new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 0 }).format(n)

export const durationLabel = (min: number) => {
  if (min < 60) return `${min} min`
  const h = Math.floor(min / 60)
  const m = min % 60
  return m ? `${h} h ${m} min` : `${h} h`
}
