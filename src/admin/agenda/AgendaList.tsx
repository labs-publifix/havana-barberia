import { Ban } from 'lucide-react'
import type { Appointment, Service, TimeBlock } from '@/domain/types'
import { cn } from '@/lib/cn'
import { formatTime12, localTime } from '@/lib/time'
import { AdminStatusBadge } from '../ui/AdminStatusBadge'
import { isLive } from '../ui/appointmentStyle'
import type { GridColumn } from './TimeGrid'

/** Phones and tablets: the same columns as the grid, as tappable lists. */
export function AgendaList({
  columns,
  now,
  timeZone,
  services,
  onOpenAppointment,
  onOpenBlock,
}: {
  columns: GridColumn[]
  now: Date
  timeZone: string
  services: Service[]
  onOpenAppointment: (a: Appointment) => void
  onOpenBlock: (b: TimeBlock) => void
}) {
  const time = (at: string) => formatTime12(localTime(at, timeZone))
  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-6">
      {columns.map((c) => {
        type Row = { at: string; appt?: Appointment; block?: TimeBlock }
        const rows: Row[] = [
          ...c.appointments.map((a) => ({ at: a.startsAt, appt: a })),
          ...c.blocks.map((b) => ({ at: b.startsAt, block: b })),
        ].sort((x, y) => x.at.localeCompare(y.at))
        return (
          <section key={c.key} aria-label={c.label}>
            <div className="mb-2">{c.header}</div>
            {rows.length === 0 ? (
              <p className="rounded-md border border-dashed border-line px-4 py-5 text-sm text-fg-muted">
                {c.ranges.length ? 'Sin citas.' : 'No trabaja este día.'}
              </p>
            ) : (
              <ul className="grid grid-cols-[minmax(0,1fr)] gap-2">
                {rows.map(({ appt: a, block: b }) =>
                  a ? (
                    <li key={a.id}>
                      <button
                        type="button"
                        onClick={() => onOpenAppointment(a)}
                        className={cn(
                          'flex min-h-tap w-full items-center gap-3 rounded-md border bg-raised px-3 py-2.5 text-left',
                          'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus',
                          isLive(a, now)
                            ? 'border-ink-950 shadow-[inset_3px_0_0_var(--color-aqua-500)]'
                            : 'border-line',
                          (a.status === 'cancelled' || a.status === 'no_show') && 'text-fg-muted',
                        )}
                      >
                        <span className="tabular w-[84px] shrink-0 whitespace-nowrap text-sm font-semibold">
                          {time(a.startsAt)}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate font-medium">{a.customer.name}</span>
                          <span className="block truncate text-[13px] text-fg-muted">
                            {a.serviceIds.map((id) => services.find((s) => s.id === id)?.name).join(', ')}
                          </span>
                        </span>
                        <AdminStatusBadge status={a.status} />
                      </button>
                    </li>
                  ) : b ? (
                    <li key={b.id}>
                      <button
                        type="button"
                        onClick={() => onOpenBlock(b)}
                        className="timeline-block flex min-h-tap w-full items-center gap-3 rounded-md px-3 py-2.5 text-left text-sm text-fg-muted focus-visible:outline focus-visible:outline-2 focus-visible:outline-focus"
                      >
                        <span className="tabular w-[84px] shrink-0 whitespace-nowrap font-semibold">
                          {time(b.startsAt)}
                        </span>
                        <Ban className="size-4 shrink-0" aria-hidden />
                        <span className="min-w-0 flex-1 truncate">
                          {b.reason} · hasta {time(b.endsAt)}
                        </span>
                      </button>
                    </li>
                  ) : null,
                )}
              </ul>
            )}
          </section>
        )
      })}
    </div>
  )
}
