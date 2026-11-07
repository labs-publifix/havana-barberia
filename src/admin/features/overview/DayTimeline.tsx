import type { CSSProperties } from 'react'
import type { Appointment, Service, TimeBlock } from '@/domain/types'
import { Avatar } from '@/components/booking/Avatar'
import { cn } from '@/lib/cn'
import { formatTime12, formatTimeCompact, localTime, toMinutes } from '@/lib/time'
import { type StaffLoad } from '../../overview'
import { AppointmentTooltip } from '../../ui/AppointmentTooltip'
import { Tip } from '../../ui/Tooltip'
import { isLive, liveStyle, shortName as firstNameAndInitial, statusStyle, statusText } from '../../ui/appointmentStyle'

/**
 * One row per barber across the opening hours: working time in white, time off
 * shaded, appointments as blocks and a "now" line. Built for the large screen
 * at the shop; on phones the overview uses lists instead.
 */
export function DayTimeline({
  loads,
  appointments,
  blocks,
  services,
  bounds,
  now,
  timeZone,
  isToday,
}: {
  loads: StaffLoad[]
  appointments: Appointment[]
  blocks: TimeBlock[]
  services: Service[]
  bounds: [number, number]
  now: Date
  timeZone: string
  isToday: boolean
}) {
  const [from, to] = bounds
  const span = to - from
  const pos = (min: number) => `${((Math.min(Math.max(min, from), to) - from) / span) * 100}%`
  const width = (a: number, b: number) => `${((Math.min(b, to) - Math.max(a, from)) / span) * 100}%`
  const minOf = (at: string) => toMinutes(localTime(at, timeZone))
  const nowMin = toMinutes(localTime(now, timeZone))
  const showNow = isToday && nowMin >= from && nowMin <= to
  const hours = Array.from({ length: Math.floor(span / 60) + 1 }, (_, i) => from + i * 60)
  const serviceName = (id: string) => services.find((s) => s.id === id)?.name ?? ''

  return (
    <div className="grid grid-cols-[188px_minmax(0,1fr)] gap-x-4 2xl:grid-cols-[208px_minmax(0,1fr)]">
      {/* Hour axis */}
      <div aria-hidden />
      <div aria-hidden className="relative mb-2 h-5">
        {hours.map((m) => (
          <span key={m} className="tabular absolute -translate-x-1/2 text-xs text-fg-muted" style={{ left: pos(m) }}>
            {formatTimeCompact(`${String(Math.floor(m / 60)).padStart(2, '0')}:00`)}
          </span>
        ))}
        {showNow && (
          <span
            className="tabular absolute z-[1] -translate-x-1/2 rounded-full bg-ink-950 px-2 text-xs font-semibold leading-5 text-white"
            style={{ left: pos(nowMin) }}
          >
            {formatTimeCompact(localTime(now, timeZone))}
          </span>
        )}
      </div>

      {loads.map((l) => {
        const own = appointments.filter((a) => a.staffId === l.staff.id && a.status !== 'cancelled')
        const ownBlocks = blocks.filter((b) => b.staffId === null || b.staffId === l.staff.id)
        return (
          <div key={l.staff.id} className="contents">
            <div className="flex min-w-0 items-center gap-3 py-2">
              <Avatar name={l.staff.name} src={l.staff.photoUrl} size={40} />
              <div className="min-w-0">
                <p className="truncate text-[15px] font-semibold">{l.staff.name}</p>
                <p className="tabular text-[13px] text-fg-muted">
                  {l.workingMin ? `${l.pct}% ocupado` : 'Descansa hoy'}
                </p>
              </div>
            </div>
            <div className="relative my-1.5 h-16 overflow-hidden rounded-md bg-fg/[0.045] 2xl:h-20">
              {/* Hour grid */}
              {hours.slice(1, -1).map((m) => (
                <span key={m} aria-hidden className="absolute inset-y-0 w-px bg-fg/[0.06]" style={{ left: pos(m) }} />
              ))}
              {/* Working time */}
              {l.ranges.map((r) => (
                <span
                  key={r.start}
                  aria-hidden
                  className="absolute inset-y-0 border-x border-line bg-raised"
                  style={{ left: pos(toMinutes(r.start)), width: width(toMinutes(r.start), toMinutes(r.end)) }}
                />
              ))}
              {/* Blocks (time off, training, holidays) */}
              {ownBlocks.map((b) => (
                <span
                  key={b.id}
                  className="timeline-block absolute inset-y-0 flex items-end overflow-hidden px-2 pb-1.5 text-[11px] font-medium text-fg-muted"
                  style={{ left: pos(minOf(b.startsAt)), width: width(minOf(b.startsAt), minOf(b.endsAt)) }}
                  title={`${b.reason}: ${formatTime12(localTime(b.startsAt, timeZone))} – ${formatTime12(localTime(b.endsAt, timeZone))}`}
                >
                  <span className="truncate">{b.reason}</span>
                </span>
              ))}
              {showNow && (
                <span
                  aria-hidden
                  className="absolute inset-y-0 w-0.5 -translate-x-1/2 bg-ink-950"
                  style={{ left: pos(nowMin) }}
                />
              )}
              {/* Appointments */}
              <ul aria-label={`Citas de ${l.staff.name}`} className="absolute inset-0">
                {own.map((a) => {
                  const start = minOf(a.startsAt)
                  const end = minOf(a.endsAt)
                  const live = isLive(a, now)
                  const serviceList = a.serviceIds.map(serviceName).join(', ')
                  const time = formatTime12(localTime(a.startsAt, timeZone))
                  const style: CSSProperties = { left: pos(start), width: `calc(${width(start, end)} - 3px)` }
                  return (
                    <Tip
                      key={a.id}
                      side="bottom"
                      content={
                        <AppointmentTooltip
                          appointment={a}
                          services={services}
                          timeZone={timeZone}
                          now={now}
                          barber={l.staff.name.split(' ')[0]}
                        />
                      }
                    >
                      <li
                        className={cn(
                          'absolute inset-y-1.5 ml-px flex min-w-0 flex-col justify-center overflow-hidden rounded-md leading-tight',
                          a.durationMin > 30 ? 'px-1.5' : 'px-1',
                          // One style per state: cn() does not resolve conflicting classes.
                          live ? liveStyle : statusStyle[a.status],
                        )}
                        style={style}
                      >
                        {a.durationMin >= 30 && (
                          <span
                            className={cn(
                              'tabular truncate font-semibold',
                              a.durationMin > 30 ? 'text-xs' : 'text-[11px]',
                            )}
                            aria-hidden
                          >
                            {formatTimeCompact(localTime(a.startsAt, timeZone))}
                          </span>
                        )}
                        {/* Short appointments only fit the time; the name is in the lists and on hover. */}
                        {a.durationMin > 30 && (
                          <span className="truncate text-[13px] font-medium" aria-hidden>
                            {firstNameAndInitial(a.customer.name)}
                          </span>
                        )}
                        <span className="sr-only">
                          {time}, {a.customer.name}, {serviceList}, {live ? 'en curso' : statusText[a.status]}
                        </span>
                      </li>
                    </Tip>
                  )
                })}
              </ul>
            </div>
          </div>
        )
      })}
    </div>
  )
}

export function TimelineLegend() {
  const item = (cls: string, label: string) => (
    <li className="flex items-center gap-2">
      <span aria-hidden className={cn('h-3.5 w-6 rounded', cls)} />
      {label}
    </li>
  )
  return (
    <ul aria-label="Leyenda" className="flex flex-wrap gap-x-5 gap-y-2 text-[13px] text-fg-muted">
      {item('bg-ink-950 ring-2 ring-inset ring-aqua-500', 'En curso')}
      {item('bg-ink-950', 'Confirmada')}
      {item('border-[1.5px] border-dashed border-ink-950 bg-raised', 'Sin confirmar')}
      {item('bg-success-100', 'Completada')}
      {item('bg-red-100', 'No se presentó')}
      {item('timeline-block', 'Bloqueo')}
      {item('bg-fg/[0.06]', 'Fuera de horario')}
    </ul>
  )
}
