import type { Appointment, Service } from '@/domain/types'
import { formatMxPhone } from '@/lib/phone'
import { durationLabel, formatTime12, localTime, money } from '@/lib/time'
import { methodPhrases } from '../cash'
import { isLive, sourceLabel } from './appointmentStyle'

const statusLabel: Record<Appointment['status'], string> = {
  booked: 'Sin confirmar',
  confirmed: 'Confirmada',
  completed: 'Completada',
  cancelled: 'Cancelada',
  no_show: 'No se presentó',
}

/** Details shown when hovering or focusing an appointment on the grid or timeline. */
export function AppointmentTooltip({
  appointment: a,
  services,
  timeZone,
  now,
  barber,
}: {
  appointment: Appointment
  services: Service[]
  timeZone: string
  now: Date
  barber?: string
}) {
  const names = a.serviceIds.map((id) => services.find((s) => s.id === id)?.name).filter(Boolean)
  return (
    <div className="grid gap-1 py-0.5">
      <p className="text-sm font-semibold">{a.customer.name}</p>
      <p className="tabular text-white/80">
        {formatTime12(localTime(a.startsAt, timeZone))} – {formatTime12(localTime(a.endsAt, timeZone))} ·{' '}
        {durationLabel(a.durationMin)}
      </p>
      <p>{names.join(', ')}</p>
      <p className="tabular text-white/80">
        {money(a.totalPrice)}
        {barber ? ` · con ${barber}` : ''}
      </p>
      <p className="flex flex-wrap items-center gap-x-2 text-white/80">
        <span className="inline-flex items-center gap-1.5 font-semibold text-white">
          <span aria-hidden className={isLive(a, now) ? 'size-1.5 rounded-full bg-aqua-400' : 'hidden'} />
          {isLive(a, now) ? 'En curso' : statusLabel[a.status]}
        </span>
        <span>· {sourceLabel[a.source ?? 'online']}</span>
      </p>
      {a.payment && (
        <p className="tabular text-white/80">
          Pagó {methodPhrases[a.payment.method]}
          {a.payment.tip > 0 ? ` · propina ${money(a.payment.tip)}` : ''}
        </p>
      )}
      {a.customer.phone && <p className="tabular text-white/80">Tel. {formatMxPhone(a.customer.phone)}</p>}
      {a.notes && <p className="border-t border-white/15 pt-1 italic text-white/80">“{a.notes}”</p>}
    </div>
  )
}
