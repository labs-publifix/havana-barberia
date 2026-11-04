import {
  forwardRef,
  useId,
  type InputHTMLAttributes,
  type KeyboardEvent,
  type ReactNode,
  type SelectHTMLAttributes,
} from 'react'
import { ChevronDown, Search } from 'lucide-react'
import { cn } from '@/lib/cn'

/**
 * Dense controls for the admin (40px on desktop, 44px on touch screens).
 * Text stays at 16px so iOS never zooms into a field.
 */
const controlClass = cn(
  'h-10 w-full rounded-md border-[1.5px] bg-raised px-3 text-base text-fg coarse:h-11',
  'transition-[border-color,box-shadow] duration-fast ease-brand placeholder:text-gray-500',
  'focus:border-fg focus:outline-none focus:ring-4 focus:ring-aqua-500/30',
  'disabled:cursor-not-allowed disabled:bg-disabled disabled:text-disabled-fg',
)

interface ShellProps {
  id: string
  label: string
  hideLabel?: boolean
  hint?: ReactNode
  error?: string
  children: ReactNode
}

function Shell({ id, label, hideLabel, hint, error, children }: ShellProps) {
  return (
    <div className="grid gap-1.5">
      <label htmlFor={id} className={cn('text-[13px] font-medium text-fg', hideLabel && 'sr-only')}>
        {label}
      </label>
      {children}
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

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string
  hideLabel?: boolean
  hint?: ReactNode
  error?: string
  /** Text or symbol shown inside the field on the left (e.g. "$"). */
  prefix?: string
  suffix?: string
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { label, hideLabel, hint, error, prefix, suffix, id, className, ...rest },
  ref,
) {
  const auto = useId()
  const fid = id ?? auto
  return (
    <Shell id={fid} label={label} hideLabel={hideLabel} hint={hint} error={error}>
      <div className="relative">
        {prefix && (
          <span className="pointer-events-none absolute inset-y-0 left-3 grid place-items-center text-fg-muted">
            {prefix}
          </span>
        )}
        <input
          ref={ref}
          id={fid}
          aria-invalid={error ? true : undefined}
          aria-describedby={error || hint ? `${fid}-msg` : undefined}
          className={cn(
            controlClass,
            error ? 'border-red-600' : 'border-line-strong',
            prefix && 'pl-7',
            suffix && 'pr-12',
            className,
          )}
          {...rest}
        />
        {suffix && (
          <span className="pointer-events-none absolute inset-y-0 right-3 grid place-items-center text-sm text-fg-muted">
            {suffix}
          </span>
        )}
      </div>
    </Shell>
  )
})

export interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label: string
  hideLabel?: boolean
  hint?: ReactNode
  error?: string
  options: { value: string; label: string }[]
}

/** Native select: the most reliable control on every device and screen reader. */
export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select(
  { label, hideLabel, hint, error, options, id, className, ...rest },
  ref,
) {
  const auto = useId()
  const fid = id ?? auto
  return (
    <Shell id={fid} label={label} hideLabel={hideLabel} hint={hint} error={error}>
      <div className="relative">
        <select
          ref={ref}
          id={fid}
          aria-invalid={error ? true : undefined}
          aria-describedby={error || hint ? `${fid}-msg` : undefined}
          className={cn(
            controlClass,
            'cursor-pointer appearance-none pr-9',
            error ? 'border-red-600' : 'border-line-strong',
            className,
          )}
          {...rest}
        >
          {options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        <ChevronDown
          className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-fg-muted"
          aria-hidden
        />
      </div>
    </Shell>
  )
})

/** Search box with icon; the label is visually hidden but read by screen readers. */
export const SearchInput = forwardRef<HTMLInputElement, Omit<InputProps, 'prefix' | 'type'>>(function SearchInput(
  { label, className, id, ...rest },
  ref,
) {
  const auto = useId()
  const fid = id ?? auto
  return (
    <div className={cn('relative', className)}>
      <label htmlFor={fid} className="sr-only">
        {label}
      </label>
      <Search
        className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-fg-muted"
        aria-hidden
      />
      <input ref={ref} id={fid} type="search" className={cn(controlClass, 'border-line-strong pl-9')} {...rest} />
    </div>
  )
})

export function Switch({
  checked,
  onChange,
  label,
  description,
  disabled,
}: {
  checked: boolean
  onChange: (v: boolean) => void
  label: string
  description?: string
  disabled?: boolean
}) {
  const id = useId()
  return (
    <div className="flex items-start justify-between gap-4">
      <div className="min-w-0">
        <p id={`${id}-l`} className="text-sm font-medium text-fg">
          {label}
        </p>
        {description && (
          <p id={`${id}-d`} className="mt-0.5 text-[13px] leading-snug text-fg-muted">
            {description}
          </p>
        )}
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-labelledby={`${id}-l`}
        aria-describedby={description ? `${id}-d` : undefined}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={cn(
          'relative mt-0.5 inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors duration-fast ease-brand',
          'before:absolute before:-inset-2.5 before:content-[""]',
          'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus',
          'disabled:cursor-not-allowed disabled:opacity-50',
          checked ? 'bg-ink-950' : 'bg-gray-300',
        )}
      >
        <span
          aria-hidden
          className={cn(
            'size-5 rounded-full bg-white shadow-sm transition-transform duration-fast ease-brand',
            checked ? 'translate-x-[22px]' : 'translate-x-0.5',
          )}
        />
      </button>
    </div>
  )
}

/** Small set of mutually exclusive options (radio group with arrow-key support). */
export function Segmented<T extends string>({
  label,
  value,
  onChange,
  options,
  className,
}: {
  label: string
  value: T
  onChange: (v: T) => void
  options: { value: T; label: string; count?: number }[]
  className?: string
}) {
  const onKey = (e: KeyboardEvent<HTMLButtonElement>, i: number) => {
    const d =
      e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 0
    if (!d) return
    e.preventDefault()
    const next = options[(i + d + options.length) % options.length]!
    onChange(next.value)
    const group = e.currentTarget.parentElement
    ;(group?.querySelector(`[data-value="${next.value}"]`) as HTMLElement | null)?.focus()
  }
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className={cn('inline-flex h-10 items-center gap-0.5 rounded-full bg-fg/[0.06] p-1 coarse:h-11', className)}
    >
      {options.map((o, i) => {
        const on = o.value === value
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={on}
            data-value={o.value}
            tabIndex={on ? 0 : -1}
            onClick={() => onChange(o.value)}
            onKeyDown={(e) => onKey(e, i)}
            className={cn(
              'inline-flex h-full items-center gap-1.5 whitespace-nowrap rounded-full px-3.5 text-sm font-medium transition-colors duration-fast',
              'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus',
              on ? 'bg-raised text-fg shadow-sm' : 'text-fg-muted hover:text-fg',
            )}
          >
            {o.label}
            {o.count !== undefined && <span className="tabular text-xs text-fg-muted">{o.count}</span>}
          </button>
        )
      })}
    </div>
  )
}

export function Kbd({ children }: { children: ReactNode }) {
  return (
    <kbd className="inline-grid h-5 min-w-5 place-items-center rounded border border-line-strong bg-raised px-1 font-sans text-[11px] font-semibold text-fg-muted">
      {children}
    </kbd>
  )
}
