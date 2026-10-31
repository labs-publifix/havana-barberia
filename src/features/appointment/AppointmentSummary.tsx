import { CalendarDays, Clock, MapPin, Scissors } from 'lucide-react'
import type { Appointment, Service, Staff } from '@/domain/types'
import { Avatar } from '@/components/booking/Avatar'
import { StatusBadge } from '@/components/ui/Badge'
import { business } from '@/config/business'
import { capitalize, durationLabel, formatDateLong, formatTime12, localDate, localTime, money } from '@/lib/time'

export function AppointmentSummary({
  appointment: a,
  services,
  staff,
  showStatus = true,
}: {
  appointment: Appointment
  services: Service[]
  staff?: Staff
  showStatus?: boolean
}) {
  const tz = business.hours.timeZone
  const items = a.serviceIds.map((id) => services.find((s) => s.id === id)).filter(Boolean) as Service[]
  const icon = 'mt-0.5 size-5 shrink-0 text-fg-muted'
  return (
    <div className="grid gap-4 rounded-lg border border-line bg-raised p-4 shadow-sm sm:p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          {staff && <Avatar name={staff.name} src={staff.photoUrl} size={48} />}
          <div className="min-w-0">
            <p className="text-sm text-fg-muted">Con</p>
            <p className="t-h4">{staff?.name ?? 'Tu barbero'}</p>
          </div>
        </div>
        {showStatus && <StatusBadge status={a.status} />}
      </div>
      <ul className="grid gap-3 border-t border-line pt-4">
        <li className="flex gap-3">
          <CalendarDays className={icon} strokeWidth={1.75} aria-hidden />
          <span className="font-semibold">{capitalize(formatDateLong(localDate(a.startsAt, tz)))}</span>
        </li>
        <li className="flex gap-3">
          <Clock className={icon} strokeWidth={1.75} aria-hidden />
          <span className="tabular">
            {formatTime12(localTime(a.startsAt, tz))} – {formatTime12(localTime(a.endsAt, tz))}{' '}
            <span className="text-fg-muted">({durationLabel(a.durationMin)})</span>
          </span>
        </li>
        <li className="flex gap-3">
          <Scissors className={icon} strokeWidth={1.75} aria-hidden />
          <span className="grid flex-1 gap-1">
            {items.map((s) => (
              <span key={s.id} className="flex justify-between gap-3">
                <span>{s.name}</span>
                <span className="tabular text-fg-muted">{money(s.price)}</span>
              </span>
            ))}
          </span>
        </li>
        <li className="flex gap-3">
          <MapPin className={icon} strokeWidth={1.75} aria-hidden />
          <span className="text-fg-muted">{business.address}</span>
        </li>
      </ul>
      <div className="flex items-baseline justify-between border-t border-line pt-4">
        <span className="text-fg-muted">Total a pagar en la barbería</span>
        <span className="t-price">{money(a.totalPrice)}</span>
      </div>
    </div>
  )
}
