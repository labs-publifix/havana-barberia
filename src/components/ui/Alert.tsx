import type { ReactNode } from 'react'
import { AlertTriangle, CheckCircle2, Info, XCircle } from 'lucide-react'
import { cn } from '@/lib/cn'

export type AlertTone = 'success' | 'info' | 'warning' | 'danger'

const styles: Record<AlertTone, string> = {
  success: 'border-success-500 bg-success-100 text-success-700',
  info: 'border-info-500 bg-info-100 text-info-700',
  warning: 'border-warning-500 bg-warning-100 text-warning-700',
  danger: 'border-red-500 bg-red-100 text-red-700',
}
const icons = { success: CheckCircle2, info: Info, warning: AlertTriangle, danger: XCircle }

export function Alert({
  tone = 'info',
  title,
  children,
  action,
  className,
}: {
  tone?: AlertTone
  title: string
  children?: ReactNode
  action?: ReactNode
  className?: string
}) {
  const Icon = icons[tone]
  return (
    <div
      role={tone === 'danger' ? 'alert' : 'status'}
      className={cn('flex gap-3 rounded-md border-[1.5px] px-4 py-3 text-sm', styles[tone], className)}
    >
      <Icon className="mt-0.5 size-5 shrink-0" strokeWidth={1.75} aria-hidden />
      <div className="min-w-0 flex-1">
        <p className="font-semibold">{title}</p>
        {children && <div className="mt-0.5 leading-[1.45]">{children}</div>}
        {action && <div className="mt-3">{action}</div>}
      </div>
    </div>
  )
}
