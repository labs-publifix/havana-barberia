import { ChevronLeft, ChevronRight } from 'lucide-react'
import { buttonClass } from '@/components/ui/buttonClass'
import type { LocalDate } from '@/domain/types'
import {
  MAX_PERIOD_DAYS,
  customRange,
  endSoFar,
  isCurrent,
  periodAt,
  periodLabel,
  shiftPeriod,
  type Period,
  type PeriodUnit,
} from '../period'
import { Segmented } from './controls'
import { DatePicker } from './DatePicker'

const UNITS: { value: PeriodUnit; label: string }[] = [
  { value: 'day', label: 'Día' },
  { value: 'week', label: 'Semana' },
  { value: 'month', label: 'Mes' },
  { value: 'range', label: 'Personalizado' },
]

const BACK_TO: Record<Exclude<PeriodUnit, 'range'>, string> = { day: 'Hoy', week: 'Esta semana', month: 'Este mes' }
const UNIT_NAME: Record<Exclude<PeriodUnit, 'range'>, [string, string]> = {
  day: ['Día anterior', 'Día siguiente'],
  week: ['Semana anterior', 'Semana siguiente'],
  month: ['Mes anterior', 'Mes siguiente'],
}

/**
 * The same period control on every screen with dates: Día, Semana, Mes or
 * Personalizado (from–to, up to a year). Arrows move to the previous or next
 * one; nothing after today.
 */
export function PeriodPicker({
  value,
  onChange,
  today,
  weekStartDay,
  units = ['day', 'week', 'month', 'range'],
}: {
  value: Period
  onChange: (p: Period) => void
  today: LocalDate
  weekStartDay: number
  units?: PeriodUnit[]
}) {
  const nav =
    'grid size-10 shrink-0 place-items-center rounded-full text-fg-muted hover:bg-fg/5 hover:text-fg focus-visible:outline focus-visible:outline-2 focus-visible:outline-focus disabled:opacity-30'
  const pick = (unit: PeriodUnit) => {
    if (unit === value.unit) return
    // Start from the dates already on screen, so switching keeps you in place.
    const anchor = endSoFar(value, today)
    onChange(unit === 'range' ? customRange(value.from, anchor, today, 'from') : periodAt(unit, anchor, weekStartDay))
  }
  const fixed = value.unit === 'range' ? null : value.unit

  return (
    <div className="grid w-full min-w-0 gap-2 sm:w-auto" role="group" aria-label="Periodo">
      <Segmented<PeriodUnit>
        label="Ver por"
        value={value.unit}
        onChange={pick}
        options={UNITS.filter((u) => units.includes(u.value))}
        className="max-w-full justify-self-start overflow-x-auto"
      />
      {fixed ? (
        <div className="flex flex-wrap items-center gap-1">
          <button
            type="button"
            aria-label={UNIT_NAME[fixed][0]}
            onClick={() => onChange(shiftPeriod(value, -1, weekStartDay))}
            className={nav}
          >
            <ChevronLeft className="size-5" strokeWidth={1.75} aria-hidden />
          </button>
          <p className="tabular min-w-[176px] text-center text-[15px] font-semibold" aria-live="polite">
            {periodLabel(value)}
          </p>
          <button
            type="button"
            aria-label={UNIT_NAME[fixed][1]}
            disabled={isCurrent(value, today)}
            onClick={() => onChange(shiftPeriod(value, 1, weekStartDay))}
            className={nav}
          >
            <ChevronRight className="size-5" strokeWidth={1.75} aria-hidden />
          </button>
          {!isCurrent(value, today) && (
            <button
              type="button"
              onClick={() => onChange(periodAt(fixed, today, weekStartDay))}
              className={buttonClass({ variant: 'secondary', size: 'sm' })}
            >
              {BACK_TO[fixed]}
            </button>
          )}
        </div>
      ) : (
        <div className="grid gap-1">
          <div className="grid grid-cols-2 items-end gap-2 sm:flex">
            <DatePicker
              label="Desde"
              value={value.from}
              onChange={(d) => onChange(customRange(d, value.to, today, 'from'))}
              today={today}
              className="min-w-0 grid-cols-[minmax(0,1fr)] sm:w-[168px]"
            />
            <DatePicker
              label="Hasta"
              value={value.to}
              onChange={(d) => onChange(customRange(value.from, d, today, 'to'))}
              today={today}
              min={value.from}
              className="min-w-0 grid-cols-[minmax(0,1fr)] sm:w-[168px]"
            />
          </div>
          <p className="text-[12px] text-fg-muted">Elige el primer y el último día (hasta {MAX_PERIOD_DAYS} días).</p>
        </div>
      )}
    </div>
  )
}
