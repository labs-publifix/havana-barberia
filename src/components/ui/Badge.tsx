import type { ReactNode } from 'react'
import type { AppointmentStatus } from '@/domain/types'
import { cn } from '@/lib/cn'

export type BadgeTone = 'info' | 'accent' | 'success' | 'warning' | 'neutral' | 'danger' | 'onDark'

const tones: Record<BadgeTone, string> = {
  info: 'bg-info-100 text-info-700',
  accent: 'bg-aqua-100 text-aqua-800',
  success: 'bg-success-100 text-success-700',
  warning: 'bg-warning-100 text-warning-700',
  neutral: 'bg-gray-100 text-gray-500',
  danger: 'bg-red-100 text-red-700',
  onDark: 'bg-white/10 text-white',
}

/** Pill with a dot and text: color never carries meaning alone. */
export function Badge({
  tone = 'neutral',
  children,
  className,
}: {
  tone?: BadgeTone
  children: ReactNode
  className?: string
}) {
  return (
    <span
      className={cn(
        'inline-flex h-[22px] items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 text-[12.5px] font-semibold leading-none',
        tones[tone],
        className,
      )}
    >
      <span className="size-1.5 rounded-full bg-current" aria-hidden />
      {children}
    </span>
  )
}

const statusMap: Record<AppointmentStatus, [BadgeTone, string]> = {
  booked: ['info', 'Reservada'],
  confirmed: ['accent', 'Confirmada'],
  completed: ['success', 'Completada'],
  cancelled: ['neutral', 'Cancelada'],
  no_show: ['danger', 'No se presentó'],
}

export function StatusBadge({ status }: { status: AppointmentStatus }) {
  const [tone, label] = statusMap[status]
  return <Badge tone={tone}>{label}</Badge>
}
