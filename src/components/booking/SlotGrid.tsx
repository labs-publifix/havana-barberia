import type { Slot } from '@/domain/types'
import { cn } from '@/lib/cn'
import { formatTime12, formatTimeCompact, toMinutes } from '@/lib/time'

const groups = [
  { label: 'Mañana', test: (m: number) => m < 12 * 60 },
  { label: 'Tarde', test: (m: number) => m >= 12 * 60 && m < 19 * 60 },
  { label: 'Noche', test: (m: number) => m >= 19 * 60 },
]

/**
 * Time grid grouped by part of the day. Unavailable times stay visible,
 * grayed and struck through, so people understand the day is busy rather
 * than closed.
 */
export function SlotGrid({
  slots,
  value,
  onChange,
  highlight = [],
}: {
  slots: Slot[]
  value: string | null
  onChange: (slot: Slot) => void
  /** Suggested alternatives to emphasize after a conflict. */
  highlight?: string[]
}) {
  return (
    <div className="grid gap-5">
      {groups.map((g) => {
        const items = slots.filter((s) => g.test(toMinutes(s.time)))
        if (items.length === 0) return null
        return (
          <fieldset key={g.label}>
            <legend className="t-overline mb-2 text-fg-muted">{g.label}</legend>
            <div className="grid grid-cols-4 gap-2">
              {items.map((s) => {
                const selected = s.startsAt === value
                return (
                  <button
                    key={s.startsAt}
                    type="button"
                    disabled={!s.available}
                    aria-pressed={selected}
                    aria-label={`${formatTime12(s.time)}${s.available ? '' : ', no disponible'}`}
                    onClick={() => onChange(s)}
                    className={cn(
                      't-time h-12 rounded-md border transition-colors duration-fast ease-brand',
                      'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus',
                      selected
                        ? 'border-primary bg-primary text-primary-fg'
                        : s.available
                          ? cn(
                              'border-line-strong bg-raised text-fg hover:border-fg',
                              highlight.includes(s.startsAt) && 'border-selected-border bg-selected',
                            )
                          : 'cursor-not-allowed border-transparent bg-disabled text-disabled-fg line-through',
                    )}
                  >
                    {formatTimeCompact(s.time)}
                  </button>
                )
              })}
            </div>
          </fieldset>
        )
      })}
    </div>
  )
}
