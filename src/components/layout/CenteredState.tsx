import type { ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'

/** Friendly full-width message (not found, errors, empty states). */
export function CenteredState({
  icon: Icon,
  title,
  children,
  actions,
}: {
  icon: LucideIcon
  title: string
  children?: ReactNode
  actions?: ReactNode
}) {
  return (
    <div className="grid justify-items-center gap-4 py-16 text-center">
      <span className="grid size-16 place-items-center rounded-full bg-surface">
        <Icon className="size-8 text-fg-muted" strokeWidth={1.5} aria-hidden />
      </span>
      <h1 className="t-h2">{title}</h1>
      {children && <div className="max-w-[36ch] text-fg-muted">{children}</div>}
      {actions && <div className="mt-2 grid w-full max-w-xs gap-3">{actions}</div>}
    </div>
  )
}
