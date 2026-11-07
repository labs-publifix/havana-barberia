import type { ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'
import { cn } from '@/lib/cn'

/** White surface with a hairline border: the basic container of the admin. */
export function Card({
  title,
  description,
  actions,
  children,
  className,
  bodyClassName,
}: {
  title?: string
  description?: ReactNode
  actions?: ReactNode
  children: ReactNode
  className?: string
  /** Replaces the default padding (p-5). */
  bodyClassName?: string
}) {
  return (
    <section className={cn('rounded-lg border border-line bg-raised', className)}>
      {(title || actions) && (
        <header className="flex flex-wrap items-start justify-between gap-3 border-b border-line px-5 py-4">
          <div className="min-w-0">
            {title && <h2 className="text-base font-semibold tracking-[-0.01em]">{title}</h2>}
            {description && <p className="mt-0.5 text-sm text-fg-muted">{description}</p>}
          </div>
          {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
        </header>
      )}
      <div className={bodyClassName ?? 'p-5'}>{children}</div>
    </section>
  )
}

/** Section intro inside the page (the page title itself lives in the top bar). */
export function PageHeader({
  description,
  actions,
  children,
}: {
  description?: ReactNode
  actions?: ReactNode
  children?: ReactNode
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0 max-w-2xl">
        {description && <p className="text-[15px] leading-relaxed text-fg-muted">{description}</p>}
        {children}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  )
}

/** Single figure with label; numbers are tabular so columns of stats line up. */
export function StatCard({
  label,
  value,
  detail,
  icon: Icon,
}: {
  label: string
  value: ReactNode
  detail?: ReactNode
  icon?: LucideIcon
}) {
  return (
    <div className="rounded-lg border border-line bg-raised p-5">
      <div className="flex items-center justify-between gap-3">
        <p className="text-[13px] font-medium text-fg-muted">{label}</p>
        {Icon && <Icon className="size-4 text-fg-muted" strokeWidth={1.75} aria-hidden />}
      </div>
      <p className="tabular mt-2 text-[28px] font-semibold leading-none tracking-[-0.02em]">{value}</p>
      {detail && <p className="mt-2 text-[13px] text-fg-muted">{detail}</p>}
    </div>
  )
}

export function EmptyState({
  icon: Icon,
  title,
  children,
  action,
}: {
  icon: LucideIcon
  title: string
  children?: ReactNode
  action?: ReactNode
}) {
  return (
    <div className="grid justify-items-center gap-3 px-6 py-14 text-center">
      <span className="grid size-12 place-items-center rounded-full bg-fg/[0.06]" aria-hidden>
        <Icon className="size-6 text-fg-muted" strokeWidth={1.75} />
      </span>
      <p className="text-base font-semibold">{title}</p>
      {children && <div className="max-w-sm text-sm text-fg-muted">{children}</div>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  )
}
