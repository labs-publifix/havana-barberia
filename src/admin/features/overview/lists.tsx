import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { routes } from '@/app/routes'
import { Ban, BellRing, CalendarX2, CheckCircle2, Clock3, type LucideIcon, UserX } from 'lucide-react'
import type { Appointment, Service, Staff } from '@/domain/types'
import { Avatar } from '@/components/booking/Avatar'
import { Badge } from '@/components/ui/Badge'
import { cn } from '@/lib/cn'
import { formatMxPhone } from '@/lib/phone'
import { durationLabel, formatTime12, localDate, localTime } from '@/lib/time'
import type { AlertKind, OverviewAlert } from '../../overview'

interface Ctx {
  staff: Staff[]
  services: Service[]
  timeZone: string
}

const time = (at: string, tz: string) => formatTime12(localTime(at, tz))
const staffName = (ctx: Ctx, id: string | null) =>
  id ? (ctx.staff.find((s) => s.id === id)?.name ?? '') : 'Toda la barbería'
const firstName = (name: string) => name.split(/\s+/)[0] ?? name
const linkClass =
  'rounded underline-offset-4 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-focus'
/** Agenda link that opens this appointment. */
const agendaLink = (a: Appointment, tz: string) => routes.adminAgenda({ fecha: localDate(a.startsAt, tz), cita: a.id })

/** "en 25 min", "en 1 h 10 min" for the next appointment. */
function startsIn(at: string, now: Date) {
  const min = Math.max(0, Math.round((Date.parse(at) - now.getTime()) / 60000))
  return min === 0 ? 'ahora' : `en ${durationLabel(min)}`
}

export function UpcomingList({
  items,
  now,
  showBarber,
  ...ctx
}: Ctx & { items: Appointment[]; now: Date; showBarber: boolean }) {
  if (!items.length) {
    return (
      <p className="flex items-center gap-2 py-6 text-sm text-fg-muted">
        <CheckCircle2 className="size-5" strokeWidth={1.75} aria-hidden />
        No quedan citas por atender hoy.
      </p>
    )
  }
  return (
    <ol className="divide-y divide-line">
      {items.map((a, i) => {
        const barber = ctx.staff.find((s) => s.id === a.staffId)
        const services = a.serviceIds.map((id) => ctx.services.find((s) => s.id === id)?.name).filter(Boolean)
        return (
          <li key={a.id} className="flex items-center gap-4 py-3 first:pt-0 last:pb-0">
            <div className="w-[76px] shrink-0">
              <p className="t-time">{time(a.startsAt, ctx.timeZone)}</p>
              {i === 0 && <p className="text-xs font-medium text-fg-muted">{startsIn(a.startsAt, now)}</p>}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate font-semibold">
                <Link to={agendaLink(a, ctx.timeZone)} className={linkClass}>
                  {a.customer.name}
                </Link>
              </p>
              <p className="truncate text-sm text-fg-muted">
                {services.join(', ')} · {durationLabel(a.durationMin)}
              </p>
              {a.status === 'booked' && (
                <Badge tone="warning" className="mt-1 sm:hidden">
                  Sin confirmar
                </Badge>
              )}
            </div>
            {a.status === 'booked' && (
              <Badge tone="warning" className="hidden sm:inline-flex">
                Sin confirmar
              </Badge>
            )}
            {showBarber && barber && (
              <span className="flex shrink-0 items-center gap-2" title={barber.name}>
                <Avatar name={barber.name} src={barber.photoUrl} size={28} />
                <span className="hidden text-sm text-fg-muted 2xl:inline">{firstName(barber.name)}</span>
                <span className="sr-only 2xl:hidden">con {barber.name}</span>
              </span>
            )}
          </li>
        )
      })}
    </ol>
  )
}

const alertMeta: Record<AlertKind, { icon: LucideIcon; tone: string; title: string }> = {
  unclosed: { icon: Clock3, tone: 'bg-warning-100 text-warning-700', title: 'Sin cerrar' },
  unconfirmed: { icon: BellRing, tone: 'bg-info-100 text-info-700', title: 'Por confirmar' },
  no_show: { icon: UserX, tone: 'bg-red-100 text-red-700', title: 'No se presentó' },
  block: { icon: Ban, tone: 'bg-gray-100 text-gray-500', title: 'Bloqueo' },
  cancelled: { icon: CalendarX2, tone: 'bg-gray-100 text-gray-500', title: 'Canceló' },
}

function AlertRow({ kind, children, detail }: { kind: AlertKind; children: ReactNode; detail?: ReactNode }) {
  const m = alertMeta[kind]
  const Icon = m.icon
  return (
    <li className="flex gap-3 py-3 first:pt-0 last:pb-0">
      <span aria-hidden className={cn('grid size-8 shrink-0 place-items-center rounded-full', m.tone)}>
        <Icon className="size-4" strokeWidth={2} />
      </span>
      <div className="min-w-0 text-sm">
        <p>
          <span className="font-semibold">{m.title}:</span> {children}
        </p>
        {detail && <p className="mt-0.5 text-[13px] text-fg-muted">{detail}</p>}
      </div>
    </li>
  )
}

export function AlertsList({ alerts, ...ctx }: Ctx & { alerts: OverviewAlert[] }) {
  if (!alerts.length) {
    return (
      <p className="flex items-center gap-2 py-6 text-sm text-fg-muted">
        <CheckCircle2 className="size-5" strokeWidth={1.75} aria-hidden />
        Todo en orden por ahora.
      </p>
    )
  }
  return (
    <ul className="divide-y divide-line">
      {alerts.map((al, i) => {
        const a = al.appointment
        const b = al.block
        const key = `${al.kind}-${a?.id ?? b?.id ?? i}`
        if (b) {
          return (
            <AlertRow key={key} kind="block" detail={staffName(ctx, b.staffId)}>
              {b.reason}, {time(b.startsAt, ctx.timeZone)} – {time(b.endsAt, ctx.timeZone)}
            </AlertRow>
          )
        }
        if (!a) return null
        const who = (
          <Link to={agendaLink(a, ctx.timeZone)} className={linkClass}>
            {a.customer.name}, {time(a.startsAt, ctx.timeZone)} con {firstName(staffName(ctx, a.staffId))}
          </Link>
        )
        const detail =
          al.kind === 'unclosed'
            ? 'Márcala como completada o no-show.'
            : al.kind === 'unconfirmed'
              ? `Tel. ${formatMxPhone(a.customer.phone)}`
              : undefined
        return (
          <AlertRow key={key} kind={al.kind} detail={detail}>
            {who}
          </AlertRow>
        )
      })}
    </ul>
  )
}

/** Phones and tablets: each barber's day as a short list instead of the timeline. */
export function BarberDayList({
  appointments,
  loads,
  now,
  ...ctx
}: Ctx & { appointments: Appointment[]; loads: { staff: Staff; pct: number; workingMin: number }[]; now: Date }) {
  const t = now.getTime()
  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-6">
      {loads.map((l) => {
        const own = appointments.filter((a) => a.staffId === l.staff.id && a.status !== 'cancelled')
        return (
          <section key={l.staff.id} aria-label={`Día de ${l.staff.name}`}>
            <header className="flex items-center gap-3">
              <Avatar name={l.staff.name} src={l.staff.photoUrl} size={36} />
              <p className="min-w-0 flex-1 truncate font-semibold">{l.staff.name}</p>
              <p className="tabular text-sm text-fg-muted">{l.workingMin ? `${l.pct}% ocupado` : 'Descansa hoy'}</p>
            </header>
            {own.length > 0 && (
              <ul className="mt-2 grid grid-cols-[minmax(0,1fr)] gap-1.5">
                {own.map((a) => {
                  const done = a.status === 'completed' || a.status === 'no_show' || Date.parse(a.endsAt) <= t
                  return (
                    <li
                      key={a.id}
                      className={cn(
                        'flex items-center gap-3 rounded-md border border-line px-3 py-2 text-sm',
                        done && 'text-fg-muted',
                      )}
                    >
                      <span className="tabular w-[84px] shrink-0 whitespace-nowrap font-semibold">
                        {time(a.startsAt, ctx.timeZone)}
                      </span>
                      <span className={cn('min-w-0 flex-1 truncate', a.status === 'no_show' && 'line-through')}>
                        {a.customer.name}
                      </span>
                      {a.status === 'booked' && <Badge tone="warning">Sin confirmar</Badge>}
                      {a.status === 'no_show' && <Badge tone="danger">No vino</Badge>}
                    </li>
                  )
                })}
              </ul>
            )}
          </section>
        )
      })}
    </div>
  )
}
