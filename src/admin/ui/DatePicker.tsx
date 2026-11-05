import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react'
import * as RP from '@radix-ui/react-popover'
import { CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react'
import type { LocalDate } from '@/domain/types'
import { cn } from '@/lib/cn'
import { addDays, capitalize, formatDateLong, formatDay, weekdayOf } from '@/lib/time'

const WEEKDAYS = ['L', 'M', 'M', 'J', 'V', 'S', 'D']
const WEEKDAY_NAMES = ['lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado', 'domingo']

/** First day of the month `delta` months away from `date`'s month. */
function monthStart(date: LocalDate, delta = 0): LocalDate {
  const [y, m] = date.split('-').map(Number)
  const t = new Date(Date.UTC(y!, m! - 1 + delta, 1))
  return t.toISOString().slice(0, 10)
}

/** Six Monday-first weeks covering the month. */
function monthGrid(first: LocalDate): LocalDate[] {
  const start = addDays(first, -((weekdayOf(first) + 6) % 7))
  return Array.from({ length: 42 }, (_, i) => addDays(start, i))
}

/** Same day of month in the month `delta` away (clamped to its length). */
function shiftMonth(date: LocalDate, delta: number): LocalDate {
  const target = monthStart(date, delta)
  const day = Number(date.slice(8, 10))
  const last = Number(addDays(monthStart(date, delta + 1), -1).slice(8, 10))
  return `${target.slice(0, 8)}${String(Math.min(day, last)).padStart(2, '0')}`
}

/**
 * Date field with the platform's calendar (Monday-first, today marked).
 * Keyboard: arrows move by day or week, Page Up/Down by month, Home/End to the
 * week's ends, Enter picks, Escape closes.
 */
export function DatePicker({
  label,
  hideLabel,
  value,
  onChange,
  today,
  min,
  className,
}: {
  label: string
  hideLabel?: boolean
  value: LocalDate
  onChange: (date: LocalDate) => void
  /** Business-local today (for the "Hoy" shortcut and marker). */
  today: LocalDate
  min?: LocalDate
  className?: string
}) {
  const id = useId()
  const [open, setOpen] = useState(false)
  const [focused, setFocused] = useState<LocalDate>(value || today)
  const grid = useRef<HTMLDivElement>(null)
  const first = monthStart(focused)
  const days = monthGrid(first)
  const disabled = (d: LocalDate) => !!min && d < min

  // Keep keyboard focus on the focused day while the calendar is open.
  useEffect(() => {
    if (!open) return
    const el = grid.current?.querySelector<HTMLButtonElement>(`[data-date="${focused}"]`)
    el?.focus({ preventScroll: true })
  }, [focused, open])

  const pick = (d: LocalDate) => {
    if (disabled(d)) return
    onChange(d)
    setOpen(false)
  }

  const onKey = (e: KeyboardEvent) => {
    const moves: Record<string, () => LocalDate> = {
      ArrowLeft: () => addDays(focused, -1),
      ArrowRight: () => addDays(focused, 1),
      ArrowUp: () => addDays(focused, -7),
      ArrowDown: () => addDays(focused, 7),
      PageUp: () => shiftMonth(focused, -1),
      PageDown: () => shiftMonth(focused, 1),
      Home: () => addDays(focused, -((weekdayOf(focused) + 6) % 7)),
      End: () => addDays(focused, 6 - ((weekdayOf(focused) + 6) % 7)),
    }
    const move = moves[e.key]
    if (!move) return
    e.preventDefault()
    setFocused(move())
  }

  return (
    <div className={cn('grid gap-1.5', className)}>
      <label htmlFor={id} className={cn('text-[13px] font-medium text-fg', hideLabel && 'sr-only')}>
        {label}
      </label>
      <RP.Root
        open={open}
        onOpenChange={(o) => {
          setOpen(o)
          if (o) setFocused(value || today)
        }}
      >
        <RP.Trigger
          id={id}
          className={cn(
            'flex h-10 w-full items-center gap-2.5 rounded-md border-[1.5px] border-line-strong bg-raised px-3 text-left text-base text-fg coarse:h-11',
            'transition-[border-color,box-shadow] duration-fast ease-brand hover:border-fg',
            'focus:border-fg focus:outline-none focus:ring-4 focus:ring-aqua-500/30 data-[state=open]:border-fg',
          )}
        >
          <CalendarDays className="size-4 shrink-0 text-fg-muted" strokeWidth={1.75} aria-hidden />
          <span className="tabular min-w-0 truncate">
            {value ? capitalize(formatDay(value, "EEE d 'de' MMM yyyy")) : 'Elige una fecha'}
          </span>
        </RP.Trigger>
        <RP.Portal>
          <RP.Content
            align="start"
            sideOffset={6}
            collisionPadding={12}
            onOpenAutoFocus={(e) => {
              // Land on the chosen day (not the first button) so arrows work right away.
              e.preventDefault()
              const day = (e.currentTarget as HTMLElement | null)?.querySelector<HTMLButtonElement>(
                `[data-date="${value || today}"]`,
              )
              day?.focus({ preventScroll: true })
            }}
            className="z-[60] w-[296px] rounded-lg border border-line bg-raised p-3 text-fg shadow-lg data-[state=open]:animate-[fade-in_120ms_ease-out]"
          >
            <div className="mb-2 flex items-center justify-between">
              <button
                type="button"
                onClick={() => setFocused(shiftMonth(focused, -1))}
                aria-label="Mes anterior"
                className="grid size-9 place-items-center rounded-full hover:bg-fg/5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-focus"
              >
                <ChevronLeft className="size-4" aria-hidden />
              </button>
              <p className="text-sm font-semibold" aria-live="polite">
                {capitalize(formatDay(first, "MMMM 'de' yyyy"))}
              </p>
              <button
                type="button"
                onClick={() => setFocused(shiftMonth(focused, 1))}
                aria-label="Mes siguiente"
                className="grid size-9 place-items-center rounded-full hover:bg-fg/5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-focus"
              >
                <ChevronRight className="size-4" aria-hidden />
              </button>
            </div>

            <div role="grid" aria-label={capitalize(formatDay(first, "MMMM 'de' yyyy"))} ref={grid} onKeyDown={onKey}>
              <div role="row" className="grid grid-cols-7">
                {WEEKDAYS.map((w, i) => (
                  <span
                    key={i}
                    role="columnheader"
                    aria-label={WEEKDAY_NAMES[i]}
                    className="grid h-8 place-items-center text-xs font-semibold text-fg-muted"
                  >
                    {w}
                  </span>
                ))}
              </div>
              {Array.from({ length: 6 }, (_, w) => (
                <div role="row" key={w} className="grid grid-cols-7">
                  {days.slice(w * 7, w * 7 + 7).map((d) => {
                    const inMonth = d.slice(0, 7) === first.slice(0, 7)
                    const selected = d === value
                    const isToday = d === today
                    return (
                      <span role="gridcell" key={d} aria-selected={selected}>
                        <button
                          type="button"
                          data-date={d}
                          tabIndex={d === focused ? 0 : -1}
                          disabled={disabled(d)}
                          onClick={() => pick(d)}
                          aria-label={`${capitalize(formatDateLong(d))} de ${d.slice(0, 4)}${isToday ? ', hoy' : ''}`}
                          aria-current={isToday ? 'date' : undefined}
                          className={cn(
                            'tabular relative mx-auto grid size-9 place-items-center rounded-full text-sm transition-colors duration-fast',
                            'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus',
                            'disabled:cursor-not-allowed disabled:text-disabled-fg disabled:hover:bg-transparent',
                            selected
                              ? 'bg-ink-950 font-semibold text-white'
                              : cn('hover:bg-fg/[0.06]', inMonth ? 'text-fg' : 'text-fg-muted/70'),
                            isToday && !selected && 'font-semibold ring-1 ring-inset ring-ink-950',
                          )}
                        >
                          {Number(d.slice(8, 10))}
                        </button>
                      </span>
                    )
                  })}
                </div>
              ))}
            </div>

            <div className="mt-2 flex justify-between border-t border-line pt-2">
              <button
                type="button"
                onClick={() => pick(today)}
                disabled={disabled(today)}
                className="rounded-full px-3 py-1.5 text-sm font-semibold hover:bg-fg/5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-focus disabled:text-disabled-fg"
              >
                Hoy
              </button>
              <RP.Close className="rounded-full px-3 py-1.5 text-sm text-fg-muted hover:bg-fg/5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-focus">
                Cerrar
              </RP.Close>
            </div>
          </RP.Content>
        </RP.Portal>
      </RP.Root>
    </div>
  )
}
