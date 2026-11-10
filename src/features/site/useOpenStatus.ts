import { useNow } from '@/app/useNow'
import { formatDay, formatTime12, openState } from '@/lib/time'
import { useBusinessHours } from '@/app/queries'

/** Open/closed status computed from the shop's hours (Ajustes › Horario; business time zone). */
export function useOpenStatus() {
  const now = useNow()
  const hours = useBusinessHours()
  const s = openState(hours, now)
  if (s.open) {
    const closes = formatTime12(s.closesAt!)
    return {
      open: true,
      label: `Abierto ahora · cierra a las ${closes}`,
      chip: `Abierto hasta las ${closes}`,
      short: 'Abierto',
    }
  }
  if (!s.next) return { open: false, label: 'Cerrado', chip: 'Cerrado', short: 'Cerrado' }
  const when = s.next.isToday ? 'hoy' : s.next.isTomorrow ? 'mañana' : `el ${formatDay(s.next.date, 'EEEE')}`
  const at = formatTime12(s.next.time)
  return {
    open: false,
    label: `Cerrado · abre ${when} a las ${at}`,
    chip: `Abre ${when} a las ${at}`,
    short: s.next.isToday ? `Abre a las ${at}` : `Abre ${when} ${at}`,
  }
}
