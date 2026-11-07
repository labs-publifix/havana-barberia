import { useId, type ReactNode } from 'react'
import * as RS from '@radix-ui/react-select'
import { Check, ChevronDown, ChevronUp } from 'lucide-react'
import { cn } from '@/lib/cn'

/** Radix does not accept "" as an item value; options with "" map to this internally. */
const EMPTY = '__empty__'
const toRadix = (v: string) => (v === '' ? EMPTY : v)
const fromRadix = (v: string) => (v === EMPTY ? '' : v)

export interface SelectOption {
  value: string
  label: string
}

/**
 * Dropdown with the platform's look (pill-cornered field, white list with a
 * check on the chosen item). Built on Radix Select: full keyboard support,
 * type-ahead and screen-reader semantics. The list opens above side panels.
 */
export function Select({
  label,
  hideLabel,
  hint,
  error,
  value,
  onValueChange,
  options,
  disabled,
  className,
}: {
  label: string
  hideLabel?: boolean
  hint?: ReactNode
  error?: string
  value: string
  onValueChange: (value: string) => void
  options: SelectOption[]
  disabled?: boolean
  className?: string
}) {
  const id = useId()
  return (
    <div className={cn('grid gap-1.5', className)}>
      <label htmlFor={id} className={cn('text-[13px] font-medium text-fg', hideLabel && 'sr-only')}>
        {label}
      </label>
      <RS.Root value={toRadix(value)} onValueChange={(v) => onValueChange(fromRadix(v))} disabled={disabled}>
        <RS.Trigger
          id={id}
          aria-invalid={error ? true : undefined}
          aria-describedby={error || hint ? `${id}-msg` : undefined}
          className={cn(
            'flex h-10 w-full items-center justify-between gap-2 rounded-md border-[1.5px] bg-raised pl-3 pr-2.5 text-left text-base text-fg coarse:h-11',
            'transition-[border-color,box-shadow] duration-fast ease-brand',
            'hover:border-fg focus:border-fg focus:outline-none focus:ring-4 focus:ring-aqua-500/30',
            'data-[state=open]:border-fg data-[placeholder]:text-gray-500',
            'disabled:cursor-not-allowed disabled:bg-disabled disabled:text-disabled-fg disabled:hover:border-line-strong',
            error ? 'border-red-600' : 'border-line-strong',
          )}
        >
          <span className="min-w-0 truncate">
            <RS.Value />
          </span>
          <RS.Icon asChild>
            <ChevronDown className="size-4 shrink-0 text-fg-muted" aria-hidden />
          </RS.Icon>
        </RS.Trigger>
        <RS.Portal>
          <RS.Content
            position="popper"
            sideOffset={6}
            collisionPadding={12}
            className={cn(
              'z-[60] max-h-[min(320px,var(--radix-select-content-available-height))] min-w-[var(--radix-select-trigger-width)] overflow-hidden',
              'rounded-lg border border-line bg-raised text-fg shadow-lg',
              'data-[state=open]:animate-[fade-in_120ms_ease-out]',
            )}
          >
            <RS.ScrollUpButton className="flex h-7 items-center justify-center text-fg-muted">
              <ChevronUp className="size-4" aria-hidden />
            </RS.ScrollUpButton>
            <RS.Viewport className="p-1.5">
              {options.map((o) => (
                <RS.Item
                  key={o.value}
                  value={toRadix(o.value)}
                  className={cn(
                    'relative flex h-10 cursor-pointer select-none items-center rounded-md pl-8 pr-3 text-[15px] outline-none coarse:h-11',
                    'data-[highlighted]:bg-fg/[0.06] data-[state=checked]:font-semibold',
                    'data-[disabled]:pointer-events-none data-[disabled]:text-disabled-fg',
                  )}
                >
                  <RS.ItemIndicator className="absolute left-2.5 grid place-items-center">
                    <Check className="size-4" strokeWidth={2.25} aria-hidden />
                  </RS.ItemIndicator>
                  <RS.ItemText>{o.label}</RS.ItemText>
                </RS.Item>
              ))}
            </RS.Viewport>
            <RS.ScrollDownButton className="flex h-7 items-center justify-center text-fg-muted">
              <ChevronDown className="size-4" aria-hidden />
            </RS.ScrollDownButton>
          </RS.Content>
        </RS.Portal>
      </RS.Root>
      {error ? (
        <p id={`${id}-msg`} className="text-[13px] leading-snug text-fg-danger">
          {error}
        </p>
      ) : hint ? (
        <p id={`${id}-msg`} className="text-[13px] leading-snug text-fg-muted">
          {hint}
        </p>
      ) : null}
    </div>
  )
}
