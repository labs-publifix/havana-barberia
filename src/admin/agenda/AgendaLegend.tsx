import { cn } from '@/lib/cn'
import { liveStyle, statusStyle } from '../ui/appointmentStyle'

/** What each color on the agenda means. Same classes the appointments use, so it can't drift. */
const ITEMS: { label: string; swatch: string }[] = [
  { label: 'En curso', swatch: liveStyle },
  { label: 'Confirmada', swatch: statusStyle.confirmed },
  { label: 'Sin confirmar', swatch: statusStyle.booked },
  { label: 'Completada y cobrada', swatch: statusStyle.completed },
  { label: 'No se presentó', swatch: statusStyle.no_show },
  { label: 'Cancelada', swatch: statusStyle.cancelled },
  { label: 'Horario bloqueado', swatch: 'timeline-block border border-line' },
  { label: 'Fuera de horario', swatch: 'bg-fg/[0.045] border border-line' },
]

export function AgendaLegend({ className }: { className?: string }) {
  return (
    <details className={cn('group rounded-lg border border-line bg-raised text-sm', className)} open>
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-2.5 font-medium [&::-webkit-details-marker]:hidden">
        Guía de colores
        <span className="text-[13px] font-normal text-fg-muted group-open:hidden">Mostrar</span>
        <span className="hidden text-[13px] font-normal text-fg-muted group-open:inline">Ocultar</span>
      </summary>
      <ul
        className="flex flex-wrap gap-x-5 gap-y-2 border-t border-line px-4 py-3"
        aria-label="Guía de colores de la agenda"
      >
        {ITEMS.map((i) => (
          <li key={i.label} className="inline-flex items-center gap-2">
            <span className={cn('h-4 w-7 shrink-0 rounded-[4px]', i.swatch)} aria-hidden />
            {i.label}
          </li>
        ))}
      </ul>
    </details>
  )
}
