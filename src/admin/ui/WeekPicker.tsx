import { ChevronLeft, ChevronRight } from 'lucide-react'
import { buttonClass } from '@/components/ui/buttonClass'
import type { LocalDate } from '@/domain/types'
import { cn } from '@/lib/cn'
import { addDays } from '@/lib/time'
import { weekLabel } from '../finance'

/** Previous / next week, and back to this one. Weeks run Monday to Sunday. */
export function WeekPicker({
  value,
  onChange,
  current,
}: {
  value: LocalDate
  onChange: (monday: LocalDate) => void
  /** Monday of this week (the latest week that can be shown). */
  current: LocalDate
}) {
  const nav =
    'grid size-10 place-items-center rounded-full text-fg-muted hover:bg-fg/5 hover:text-fg focus-visible:outline focus-visible:outline-2 focus-visible:outline-focus disabled:opacity-30'
  return (
    <div className="flex flex-wrap items-center gap-2">
      <button type="button" aria-label="Semana anterior" onClick={() => onChange(addDays(value, -7))} className={nav}>
        <ChevronLeft className="size-5" strokeWidth={1.75} aria-hidden />
      </button>
      <p className="tabular min-w-[170px] text-center text-[15px] font-semibold" aria-live="polite">
        {weekLabel(value)}
      </p>
      <button
        type="button"
        aria-label="Semana siguiente"
        disabled={value >= current}
        onClick={() => onChange(addDays(value, 7))}
        className={nav}
      >
        <ChevronRight className="size-5" strokeWidth={1.75} aria-hidden />
      </button>
      {value !== current && (
        <button
          type="button"
          onClick={() => onChange(current)}
          className={cn(buttonClass({ variant: 'secondary', size: 'sm' }))}
        >
          Esta semana
        </button>
      )}
    </div>
  )
}
