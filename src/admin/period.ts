import type { LocalDate } from '@/domain/types'
import { addDays, capitalize, daysBetween, formatDay } from '@/lib/time'
import { weekStart } from './finance'

/**
 * The period a finance screen shows (pure; tested in period.test.ts). Every
 * screen with dates uses the same choices: a day, a payroll week, a month or a
 * custom range, moved back and forth with the arrows.
 */

export type PeriodUnit = 'day' | 'week' | 'month' | 'range'

export interface Period {
  unit: PeriodUnit
  from: LocalDate
  /** Last day (a week or month can end after today). */
  to: LocalDate
}

/** Longest custom range, in days. */
export const MAX_PERIOD_DAYS = 366

export const monthStart = (d: LocalDate): LocalDate => `${d.slice(0, 8)}01`
export const monthEnd = (d: LocalDate): LocalDate => addDays(monthStart(addDays(monthStart(d), 32)), -1)

/** The day, week or month that contains `date`. */
export function periodAt(unit: Exclude<PeriodUnit, 'range'>, date: LocalDate, weekStartDay: number): Period {
  if (unit === 'day') return { unit, from: date, to: date }
  if (unit === 'week') {
    const from = weekStart(date, weekStartDay)
    return { unit, from, to: addDays(from, 6) }
  }
  return { unit, from: monthStart(date), to: monthEnd(date) }
}

/** The next or previous day / week / month; a custom range moves by its own length. */
export function shiftPeriod(p: Period, dir: -1 | 1, weekStartDay: number): Period {
  if (p.unit === 'range') {
    const n = daysBetween(p.from, p.to) + 1
    return { unit: 'range', from: addDays(p.from, dir * n), to: addDays(p.to, dir * n) }
  }
  if (p.unit === 'month') return periodAt('month', dir < 0 ? addDays(p.from, -1) : addDays(p.to, 1), weekStartDay)
  return periodAt(p.unit, addDays(p.from, dir * (p.unit === 'week' ? 7 : 1)), weekStartDay)
}

/** Whether the period includes today (no later period can be shown). */
export const isCurrent = (p: Period, today: LocalDate) => p.to >= today

/** Last day that already happened (today at most). */
export const endSoFar = (p: Period, today: LocalDate): LocalDate => (p.to > today ? today : p.to)

/**
 * The period to compare against: the one before, cut to the same number of
 * days when the current one is still running (e.g. 1–11 nov against 1–11 oct).
 */
export function previousPeriod(p: Period, today: LocalDate, weekStartDay: number): Period {
  const prev = shiftPeriod(p, -1, weekStartDay)
  const elapsed = daysBetween(p.from, endSoFar(p, today))
  const to = addDays(prev.from, elapsed)
  return { ...prev, to: to < prev.to ? to : prev.to }
}

/** A custom range kept valid: start ≤ end, nothing after today, up to MAX_PERIOD_DAYS. */
export function customRange(from: LocalDate, to: LocalDate, today: LocalDate, changed: 'from' | 'to'): Period {
  let f = from > today ? today : from
  let t = to > today ? today : to
  if (f > t) {
    if (changed === 'from') t = f
    else f = t
  }
  if (daysBetween(f, t) >= MAX_PERIOD_DAYS) {
    if (changed === 'from') t = addDays(f, MAX_PERIOD_DAYS - 1)
    else f = addDays(t, -(MAX_PERIOD_DAYS - 1))
  }
  return { unit: 'range', from: f, to: t }
}

/** "Miércoles 11 de noviembre", "9 – 15 de noviembre", "Noviembre 2026", "3 de oct – 11 de nov 2026". */
export function periodLabel(p: Period): string {
  if (p.unit === 'day') return capitalize(formatDay(p.from, "EEEE d 'de' MMMM"))
  if (p.unit === 'month') return capitalize(formatDay(p.from, "MMMM 'de' yyyy"))
  if (p.from === p.to) return capitalize(formatDay(p.from, "d 'de' MMMM yyyy"))
  const sameYear = p.from.slice(0, 4) === p.to.slice(0, 4)
  if (p.unit === 'week' || (sameYear && p.from.slice(5, 7) === p.to.slice(5, 7)))
    return p.from.slice(5, 7) === p.to.slice(5, 7)
      ? `${formatDay(p.from, 'd')} – ${formatDay(p.to, "d 'de' MMMM")}`
      : `${formatDay(p.from, "d 'de' MMM")} – ${formatDay(p.to, "d 'de' MMM")}`
  return sameYear
    ? `${formatDay(p.from, "d 'de' MMM")} – ${formatDay(p.to, "d 'de' MMM yyyy")}`
    : `${formatDay(p.from, "d 'de' MMM yyyy")} – ${formatDay(p.to, "d 'de' MMM yyyy")}`
}

/** "la semana anterior", "octubre (mismos días)", "los 30 días anteriores". */
export function comparisonLabel(p: Period, prev: Period, today: LocalDate): string {
  const partial = p.to > today
  if (p.unit === 'day') return 'el día anterior'
  if (p.unit === 'week') return partial ? 'la semana anterior (mismos días)' : 'la semana anterior'
  if (p.unit === 'month') return `${formatDay(prev.from, 'MMMM')}${partial ? ' (mismos días)' : ''}`
  const n = daysBetween(p.from, p.to) + 1
  return `los ${n} ${n === 1 ? 'día anterior' : 'días anteriores'}`
}

/** Read a period from the address (?periodo=semana&desde=…&hasta=…); null when absent or invalid. */
export function periodFromParams(params: URLSearchParams, today: LocalDate, weekStartDay: number): Period | null {
  const unit = { dia: 'day', semana: 'week', mes: 'month', rango: 'range' }[params.get('periodo') ?? ''] as
    PeriodUnit | undefined
  const date = /^\d{4}-\d{2}-\d{2}$/
  const from = params.get('desde') ?? ''
  if (!unit || !date.test(from)) return null
  if (unit === 'range') {
    const to = params.get('hasta') ?? ''
    return date.test(to) ? customRange(from, to, today, 'from') : null
  }
  return periodAt(unit, from > today ? today : from, weekStartDay)
}

export function periodToParams(p: Period, params: URLSearchParams): URLSearchParams {
  const next = new URLSearchParams(params)
  next.set('periodo', { day: 'dia', week: 'semana', month: 'mes', range: 'rango' }[p.unit])
  next.set('desde', p.from)
  if (p.unit === 'range') next.set('hasta', p.to)
  else next.delete('hasta')
  return next
}
