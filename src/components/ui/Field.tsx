import { forwardRef, useId, type InputHTMLAttributes, type ReactNode, type TextareaHTMLAttributes } from 'react'
import { Check } from 'lucide-react'
import { cn } from '@/lib/cn'

const control = cn(
  'w-full rounded-md border-[1.5px] bg-raised px-4 text-base text-fg transition-[border-color,box-shadow] duration-fast ease-brand',
  'placeholder:text-gray-500 caret-ink-950',
  'focus:border-fg focus:outline-none focus:ring-4 focus:ring-aqua-500/30',
  'disabled:bg-disabled disabled:text-disabled-fg',
)

interface FieldShellProps {
  id: string
  label: string
  hint?: ReactNode
  error?: string
  optional?: boolean
  children: ReactNode
}

function FieldShell({ id, label, hint, error, optional, children }: FieldShellProps) {
  return (
    <div className="grid gap-1.5">
      <label htmlFor={id} className="t-label text-fg">
        {label}
        {optional && <span className="font-normal text-fg-muted"> (opcional)</span>}
      </label>
      {children}
      {error ? (
        <p id={`${id}-msg`} className="text-[13px] leading-snug text-fg-danger">
          {error}
        </p>
      ) : hint ? (
        <p id={`${id}-msg`} className="t-caption text-fg-muted">
          {hint}
        </p>
      ) : null}
    </div>
  )
}

export interface TextFieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string
  hint?: ReactNode
  error?: string
  optional?: boolean
}

export const TextField = forwardRef<HTMLInputElement, TextFieldProps>(function TextField(
  { label, hint, error, optional, id, className, ...rest },
  ref,
) {
  const auto = useId()
  const fid = id ?? auto
  return (
    <FieldShell id={fid} label={label} hint={hint} error={error} optional={optional}>
      <input
        ref={ref}
        id={fid}
        aria-invalid={error ? true : undefined}
        aria-describedby={error || hint ? `${fid}-msg` : undefined}
        className={cn(control, 'h-input', error ? 'border-red-600' : 'border-line-strong', className)}
        {...rest}
      />
    </FieldShell>
  )
})

export interface TextAreaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label: string
  hint?: ReactNode
  error?: string
  optional?: boolean
}

export const TextArea = forwardRef<HTMLTextAreaElement, TextAreaProps>(function TextArea(
  { label, hint, error, optional, id, className, ...rest },
  ref,
) {
  const auto = useId()
  const fid = id ?? auto
  return (
    <FieldShell id={fid} label={label} hint={hint} error={error} optional={optional}>
      <textarea
        ref={ref}
        id={fid}
        rows={3}
        aria-invalid={error ? true : undefined}
        aria-describedby={error || hint ? `${fid}-msg` : undefined}
        className={cn(control, 'min-h-24 resize-y py-3', error ? 'border-red-600' : 'border-line-strong', className)}
        {...rest}
      />
    </FieldShell>
  )
})

export interface CheckboxProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> {
  label: ReactNode
  error?: string
}

export const Checkbox = forwardRef<HTMLInputElement, CheckboxProps>(function Checkbox(
  { label, error, id, className, ...rest },
  ref,
) {
  const auto = useId()
  const fid = id ?? auto
  return (
    <div className={cn('grid gap-1.5', className)}>
      <label
        htmlFor={fid}
        className="flex min-h-tap cursor-pointer items-start gap-3 py-2.5 text-sm leading-[1.45] text-fg"
      >
        <span className="relative mt-px grid size-6 shrink-0 place-items-center">
          <input
            ref={ref}
            id={fid}
            type="checkbox"
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? `${fid}-msg` : undefined}
            className={cn(
              'peer size-6 appearance-none rounded-sm border-[1.5px] bg-raised transition-colors duration-fast',
              'checked:border-primary checked:bg-primary',
              'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus',
              error ? 'border-red-600' : 'border-line-strong',
            )}
            {...rest}
          />
          <Check
            className="pointer-events-none absolute size-4 text-primary-fg opacity-0 peer-checked:opacity-100"
            strokeWidth={3}
            aria-hidden
          />
        </span>
        <span>{label}</span>
      </label>
      {error && (
        <p id={`${fid}-msg`} className="text-[13px] leading-snug text-fg-danger">
          {error}
        </p>
      )}
    </div>
  )
})
