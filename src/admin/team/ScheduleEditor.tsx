import { Copy, Plus, X } from 'lucide-react'
import { buttonClass } from '@/components/ui/buttonClass'
import type { TimeRange, WeeklySchedule } from '@/domain/types'
import { cn } from '@/lib/cn'
import { DAY_NAMES, scheduleErrors } from '@/lib/schedule'
import { formatTime12, fromMinutes, toMinutes } from '@/lib/time'
import { timeOptions } from '../agenda/model'
import { Switch } from '../ui/controls'
import { Select } from '../ui/Select'

/** Monday first, the way the shop thinks about its week. */
const ORDER = [1, 2, 3, 4, 5, 6, 0]

/**
 * A barber's week: whether they work each day and one or more shifts (lunch
 * goes between shifts). Times only within the shop's hours, every 15 minutes.
 */
export function ScheduleEditor({
  value,
  onChange,
  shop,
  disabled,
  variant = 'barber',
}: {
  value: WeeklySchedule
  onChange: (schedule: WeeklySchedule) => void
  shop: WeeklySchedule
  disabled?: boolean
  /** "shop": the barbershop's own hours (Ajustes › Horario). */
  variant?: 'barber' | 'shop'
}) {
  const t =
    variant === 'shop'
      ? {
          on: 'Abre',
          off: 'Cerrado',
          add: 'Agregar horario (si cierra a mediodía)',
          copy: 'Copiar el lunes a los demás días',
        }
      : {
          on: 'Trabaja',
          off: 'Descansa',
          add: 'Agregar turno (para separar la comida)',
          copy: 'Copiar el lunes a los demás días',
        }
  const errors = scheduleErrors(value, shop)
  const setDay = (d: number, ranges: TimeRange[]) => onChange(value.map((x, i) => (i === d ? ranges : x)))
  const bounds = (d: number): [number, number] | null => {
    const open = shop[d] ?? []
    if (!open.length) return null
    return [Math.min(...open.map((r) => toMinutes(r.start))), Math.max(...open.map((r) => toMinutes(r.end)))]
  }
  const monday = value[1] ?? []

  return (
    <div className="grid gap-3">
      <ul className="divide-y divide-line rounded-lg border border-line">
        {ORDER.map((d) => {
          const ranges = value[d] ?? []
          const b = bounds(d)
          const works = ranges.length > 0
          const opts = b ? timeOptions(b[0], b[1]).map((t) => ({ value: t, label: formatTime12(t) })) : []
          return (
            <li key={d} className="grid gap-3 px-4 py-3 sm:grid-cols-[120px_minmax(0,1fr)] sm:items-start">
              <div className="flex items-center justify-between gap-3 sm:block">
                <p className="pt-2 text-sm font-semibold">{DAY_NAMES[d]}</p>
                {!b && <p className="text-[13px] text-fg-muted sm:mt-1">La barbería cierra</p>}
              </div>
              <div className="grid gap-2">
                {b && (
                  <Switch
                    label={works ? t.on : t.off}
                    checked={works}
                    disabled={disabled}
                    onChange={(on) => setDay(d, on ? [{ start: fromMinutes(b[0]), end: fromMinutes(b[1]) }] : [])}
                  />
                )}
                {ranges.map((r, i) => (
                  <div key={i} className="flex items-end gap-2">
                    <Select
                      label={`${DAY_NAMES[d]}, turno ${i + 1}: entrada`}
                      hideLabel
                      value={r.start}
                      disabled={disabled}
                      onValueChange={(v) =>
                        setDay(
                          d,
                          ranges.map((x, k) => (k === i ? { ...x, start: v } : x)),
                        )
                      }
                      options={opts}
                      className="min-w-0 flex-1 sm:w-[150px] sm:flex-none"
                    />
                    <span className="pb-2.5 text-sm text-fg-muted" aria-hidden>
                      a
                    </span>
                    <Select
                      label={`${DAY_NAMES[d]}, turno ${i + 1}: salida`}
                      hideLabel
                      value={r.end}
                      disabled={disabled}
                      onValueChange={(v) =>
                        setDay(
                          d,
                          ranges.map((x, k) => (k === i ? { ...x, end: v } : x)),
                        )
                      }
                      options={opts}
                      className="min-w-0 flex-1 sm:w-[150px] sm:flex-none"
                    />
                    {!disabled && ranges.length > 1 && (
                      <button
                        type="button"
                        onClick={() =>
                          setDay(
                            d,
                            ranges.filter((_, k) => k !== i),
                          )
                        }
                        aria-label={`Quitar turno ${i + 1} del ${DAY_NAMES[d]!.toLowerCase()}`}
                        className="grid size-11 shrink-0 place-items-center rounded-full text-fg-muted hover:bg-fg/5 hover:text-fg focus-visible:outline focus-visible:outline-2 focus-visible:outline-focus"
                      >
                        <X className="size-4" aria-hidden />
                      </button>
                    )}
                  </div>
                ))}
                {!disabled && works && b && (
                  <button
                    type="button"
                    onClick={() => {
                      const last = toMinutes(ranges.at(-1)!.end)
                      const start = Math.min(last + 60, b[1] - 60)
                      setDay(d, [...ranges, { start: fromMinutes(start), end: fromMinutes(b[1]) }])
                    }}
                    className="inline-flex items-center gap-1.5 justify-self-start rounded text-[13px] font-medium text-fg-muted hover:text-fg focus-visible:outline focus-visible:outline-2 focus-visible:outline-focus"
                  >
                    <Plus className="size-3.5" aria-hidden /> {t.add}
                  </button>
                )}
                {errors[d] && (
                  <p role="alert" className="text-[13px] text-fg-danger">
                    {errors[d]}
                  </p>
                )}
              </div>
            </li>
          )
        })}
      </ul>
      {!disabled && (
        <button
          type="button"
          disabled={!monday.length}
          onClick={() =>
            onChange(
              value.map((day, d) => {
                const b = bounds(d)
                if (d === 1 || !b) return day
                // Monday's shifts, trimmed to the shop's hours that day.
                return monday
                  .map((r) => ({
                    start: fromMinutes(Math.max(toMinutes(r.start), b[0])),
                    end: fromMinutes(Math.min(toMinutes(r.end), b[1])),
                  }))
                  .filter((r) => toMinutes(r.end) > toMinutes(r.start))
              }),
            )
          }
          className={cn(buttonClass({ variant: 'secondary', size: 'sm' }), 'justify-self-start')}
        >
          <Copy className="size-4" strokeWidth={1.75} aria-hidden /> {t.copy}
        </button>
      )}
    </div>
  )
}
