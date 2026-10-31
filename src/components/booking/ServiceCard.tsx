import { Check, Clock, Plus } from 'lucide-react'
import type { Service } from '@/domain/types'
import { cn } from '@/lib/cn'
import { durationLabel, money } from '@/lib/time'

/**
 * Selectable service row. The whole card is one toggle button (aria-pressed),
 * so it is a single large touch target and works with the keyboard.
 */
export function ServiceCard({
  service,
  selected,
  onToggle,
  tone = 'light',
  actionLabel = 'Agendar',
}: {
  service: Service
  selected: boolean
  onToggle: () => void
  tone?: 'light' | 'dark'
  actionLabel?: string
}) {
  const dark = tone === 'dark'
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onToggle}
      className={cn(
        'group grid w-full grid-cols-[1fr_auto] items-start gap-x-4 gap-y-3 rounded-lg border p-4 text-left',
        'transition-[background-color,border-color,box-shadow] duration-base ease-brand',
        'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus',
        dark
          ? 'border-ink-700 bg-ink-900 hover:border-ink-600 aria-pressed:border-aqua-500 aria-pressed:bg-[#0D2B26]'
          : 'border-line bg-raised shadow-sm hover:border-line-strong aria-pressed:border-selected-border aria-pressed:bg-selected',
      )}
    >
      <span className="min-w-0">
        <span className="t-h4 block">{service.name}</span>
        <span className={cn('mt-1 block text-sm leading-[1.45]', dark ? 'text-gray-300' : 'text-fg-muted')}>
          {service.description}
        </span>
      </span>
      <span className="t-price text-right">{money(service.price)}</span>
      <span className={cn('tabular flex items-center gap-1.5 text-sm', dark ? 'text-gray-300' : 'text-fg-muted')}>
        <Clock className="size-4" strokeWidth={1.75} aria-hidden />
        {durationLabel(service.durationMin)}
      </span>
      <span
        aria-hidden
        className={cn(
          'inline-flex h-btn-sm items-center gap-1.5 justify-self-end rounded-full px-4 text-sm font-semibold transition-colors duration-fast',
          selected
            ? dark
              ? 'bg-aqua-500 text-ink-950'
              : 'bg-primary text-primary-fg'
            : dark
              ? 'bg-white text-ink-950 group-hover:bg-aqua-300'
              : 'border-[1.5px] border-fg text-fg group-hover:bg-fg/5',
        )}
      >
        {selected ? <Check className="size-4" strokeWidth={2.25} /> : <Plus className="size-4" strokeWidth={2.25} />}
        {selected ? 'Seleccionado' : actionLabel}
      </span>
    </button>
  )
}
