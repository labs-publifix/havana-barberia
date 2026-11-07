import type { MouseEvent, ReactNode } from 'react'
import { Ban } from 'lucide-react'
import type { Appointment, LocalDate, Service, TimeBlock, TimeRange } from '@/domain/types'
import { cn } from '@/lib/cn'
import { formatTime12, formatTimeCompact, fromMinutes, localTime, toMinutes } from '@/lib/time'
import { isLive, liveStyle, shortName, statusStyle, statusText } from '../ui/appointmentStyle'
import { AppointmentTooltip } from '../ui/AppointmentTooltip'
import { Tip } from '../ui/Tooltip'
import { minuteAt } from './model'

/** Pixels per minute: one hour is 84px, enough for two lines in a 30-min appointment. */
const PPM = 1.4

export interface GridColumn {
  key: string
  header: ReactNode
  /** Accessible name for the column ("Leonardo Gómez, jueves 5"). */
  label: string
  date: LocalDate
  staffId: string
  /** Barber's name for the appointment tooltip. */
  staffName?: string
  ranges: TimeRange[]
  appointments: Appointment[]
  blocks: TimeBlock[]
  isToday: boolean
}

/**
 * Agenda grid: hours down the side, one column per barber (day view) or per day
 * (week view). Working time is white, the rest shaded; blocks are striped.
 * Appointments and blocks are buttons that open the side panel; clicking empty
 * working time starts a new appointment there (pointer shortcut; the "Nueva cita"
 * button does the same for keyboard users).
 */
export function TimeGrid({
  columns,
  bounds,
  now,
  timeZone,
  services,
  compact,
  onOpenAppointment,
  onOpenBlock,
  onPickSlot,
}: {
  columns: GridColumn[]
  bounds: [number, number]
  now: Date
  timeZone: string
  services: Service[]
  /** Narrow columns (week view): fewer words per appointment. */
  compact?: boolean
  onOpenAppointment: (a: Appointment) => void
  onOpenBlock: (b: TimeBlock) => void
  onPickSlot?: (col: GridColumn, time: string) => void
}) {
  const [from, to] = bounds
  const height = (to - from) * PPM
  const y = (min: number) => (Math.max(min, from) - from) * PPM
  const minOf = (at: string | Date) => toMinutes(localTime(at, timeZone))
  const hours = Array.from({ length: (to - from) / 60 + 1 }, (_, i) => from + i * 60)
  const nowMin = minOf(now)
  const serviceNames = (a: Appointment) =>
    a.serviceIds.map((id) => services.find((s) => s.id === id)?.name ?? '').join(', ')

  const pick = (col: GridColumn) => (e: MouseEvent<HTMLDivElement>) => {
    if (!onPickSlot || e.target !== e.currentTarget) return
    const rect = e.currentTarget.getBoundingClientRect()
    const min = minuteAt(e.clientY - rect.top, from, PPM)
    const inside = col.ranges.some((r) => min >= toMinutes(r.start) && min < toMinutes(r.end))
    if (inside) onPickSlot(col, fromMinutes(min))
  }

  return (
    <div className="grid" style={{ gridTemplateColumns: `56px repeat(${columns.length}, minmax(0, 1fr))` }}>
      {/* Column headers stay visible under the top bar while scrolling. */}
      <div className="sticky top-16 z-[2] border-b border-line bg-raised" />
      {columns.map((c) => (
        <div
          key={c.key}
          className={cn(
            'sticky top-16 z-[2] min-w-0 border-b border-l border-line bg-raised px-3 py-2.5',
            c.isToday && 'shadow-[inset_0_-2px_0_var(--sem-text-primary)]',
          )}
        >
          {c.header}
        </div>
      ))}

      {/* Hour labels */}
      <div className="relative" style={{ height }} aria-hidden>
        {hours.slice(0, -1).map((m) => (
          <span
            key={m}
            className="tabular absolute right-2 -translate-y-1/2 text-xs text-fg-muted first:translate-y-0.5"
            style={{ top: y(m) }}
          >
            {formatTimeCompact(fromMinutes(m))}
          </span>
        ))}
      </div>

      {columns.map((c) => (
        <div
          key={c.key}
          className={cn('relative border-l border-line bg-fg/[0.045]', onPickSlot && 'cursor-cell')}
          style={{ height }}
          onClick={pick(c)}
        >
          {/* Working time and hour lines (decorative; clicks fall through to the column). */}
          {c.ranges.map((r) => (
            <span
              key={r.start}
              aria-hidden
              className="pointer-events-none absolute inset-x-0 bg-raised"
              style={{ top: y(toMinutes(r.start)), height: (toMinutes(r.end) - toMinutes(r.start)) * PPM }}
            />
          ))}
          {hours.slice(1, -1).map((m) => (
            <span
              key={m}
              aria-hidden
              className="pointer-events-none absolute inset-x-0 h-px bg-fg/[0.07]"
              style={{ top: y(m) }}
            />
          ))}

          {c.isToday && nowMin >= from && nowMin <= to && (
            <span
              aria-hidden
              className="pointer-events-none absolute inset-x-0 h-0.5 bg-ink-950 before:absolute before:-left-1 before:-top-[3px] before:size-2 before:rounded-full before:bg-ink-950 before:content-['']"
              style={{ top: y(nowMin) }}
            />
          )}
          <ul aria-label={c.label} className="pointer-events-none absolute inset-0">
            {c.blocks.map((b) => {
              const s = minOf(b.startsAt)
              const e = minOf(b.endsAt)
              return (
                <li key={b.id} className="absolute inset-x-0" style={{ top: y(s), height: (e - s) * PPM }}>
                  <button
                    type="button"
                    onClick={() => onOpenBlock(b)}
                    className="timeline-block pointer-events-auto flex h-full w-full items-start gap-1.5 overflow-hidden px-2 py-1.5 text-left text-xs font-medium text-fg-muted focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-focus"
                  >
                    <Ban className="mt-px size-3.5 shrink-0" aria-hidden />
                    <span className="truncate">
                      {b.reason}
                      <span className="sr-only">
                        , bloqueo de {formatTime12(localTime(b.startsAt, timeZone))} a{' '}
                        {formatTime12(localTime(b.endsAt, timeZone))}
                      </span>
                    </span>
                  </button>
                </li>
              )
            })}

            {c.appointments
              .filter((a) => a.status !== 'cancelled')
              .map((a) => {
                const s = minOf(a.startsAt)
                const e = minOf(a.endsAt)
                const h = (e - s) * PPM
                const live = isLive(a, now)
                const time = formatTimeCompact(localTime(a.startsAt, timeZone))
                const tall = h >= 56
                return (
                  <li key={a.id} className="absolute inset-x-1" style={{ top: y(s) + 1, height: h - 2 }}>
                    <Tip
                      // One wide column (a single barber) leaves no room at the sides: show it above.
                      side={columns.length === 1 ? 'top' : 'right'}
                      align="start"
                      content={
                        <AppointmentTooltip
                          appointment={a}
                          services={services}
                          timeZone={timeZone}
                          now={now}
                          barber={c.staffName}
                        />
                      }
                    >
                      <button
                        type="button"
                        onClick={() => onOpenAppointment(a)}
                        className={cn(
                          'pointer-events-auto flex h-full w-full flex-col overflow-hidden rounded-md px-2 text-left leading-tight shadow-sm',
                          'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus',
                          tall ? 'justify-start py-1.5' : 'justify-center',
                          live ? liveStyle : statusStyle[a.status],
                        )}
                      >
                        {tall ? (
                          <>
                            <span className="tabular text-xs font-semibold opacity-80">
                              {time} – {formatTimeCompact(localTime(a.endsAt, timeZone))}
                            </span>
                            <span className="mt-0.5 truncate text-[13px] font-semibold">
                              {compact ? shortName(a.customer.name) : a.customer.name}
                            </span>
                            {!compact && <span className="truncate text-xs opacity-80">{serviceNames(a)}</span>}
                          </>
                        ) : (
                          <span className="truncate text-xs">
                            <span className="tabular font-semibold">{time}</span>{' '}
                            {h >= 18 && shortName(a.customer.name)}
                          </span>
                        )}
                        <span className="sr-only">
                          , {a.customer.name}, {serviceNames(a)}, {live ? 'en curso' : statusText[a.status]}
                        </span>
                      </button>
                    </Tip>
                  </li>
                )
              })}
          </ul>
        </div>
      ))}
    </div>
  )
}
