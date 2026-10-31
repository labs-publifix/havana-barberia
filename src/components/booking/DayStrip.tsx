import { useEffect, useRef } from 'react'
import type { LocalDate } from '@/domain/types'
import { cn } from '@/lib/cn'
import { formatDateLong, formatDay } from '@/lib/time'

export interface DayOption {
  date: LocalDate
  disabled: boolean
}

/** Horizontal, scrollable strip of days. Arrow keys move between days. */
export function DayStrip({
  days,
  value,
  onChange,
  today,
}: {
  days: DayOption[]
  value: LocalDate | null
  onChange: (d: LocalDate) => void
  today: LocalDate
}) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = ref.current?.querySelector<HTMLElement>('[aria-pressed="true"]')
    el?.scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'smooth' })
  }, [value])

  return (
    <div
      ref={ref}
      role="group"
      aria-label="Elige el día"
      className="no-scrollbar -mx-4 flex snap-x gap-2 overflow-x-auto px-4 pb-1"
      onKeyDown={(e) => {
        if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return
        const buttons = Array.from(ref.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)') ?? [])
        const i = buttons.indexOf(document.activeElement as HTMLButtonElement)
        const next = buttons[i + (e.key === 'ArrowRight' ? 1 : -1)]
        if (next) {
          e.preventDefault()
          next.focus()
        }
      }}
    >
      {days.map(({ date, disabled }) => {
        const selected = date === value
        const isToday = date === today
        return (
          <button
            key={date}
            type="button"
            disabled={disabled}
            aria-pressed={selected}
            aria-label={`${isToday ? 'Hoy, ' : ''}${formatDateLong(date)}${disabled ? ', cerrado' : ''}`}
            onClick={() => onChange(date)}
            className={cn(
              'grid h-[72px] w-[60px] shrink-0 snap-start place-content-center gap-0.5 rounded-md border text-center',
              'transition-colors duration-fast ease-brand',
              'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus',
              selected
                ? 'border-primary bg-primary text-primary-fg'
                : 'border-line bg-raised text-fg hover:border-line-strong disabled:border-transparent disabled:bg-disabled disabled:text-disabled-fg',
            )}
          >
            <span className="text-xs font-semibold uppercase tracking-[0.06em]">
              {isToday ? 'Hoy' : formatDay(date, 'EEE').replace('.', '')}
            </span>
            <span className="tabular text-xl font-bold leading-none">{formatDay(date, 'd')}</span>
            <span className={cn('text-[11px] leading-none', selected ? 'text-gray-300' : 'text-fg-muted')}>
              {formatDay(date, 'MMM').replace('.', '')}
            </span>
          </button>
        )
      })}
    </div>
  )
}
