import { Badge, type BadgeTone } from '@/components/ui/Badge'
import type { AppointmentStatus } from '@/domain/types'

/**
 * Status as staff read it: "booked" means the customer has not confirmed yet.
 * (The public site keeps its own wording.)
 */
const map: Record<AppointmentStatus, [BadgeTone, string]> = {
  booked: ['warning', 'Sin confirmar'],
  confirmed: ['accent', 'Confirmada'],
  completed: ['success', 'Completada'],
  cancelled: ['neutral', 'Cancelada'],
  no_show: ['danger', 'No se presentó'],
}

export function AdminStatusBadge({ status }: { status: AppointmentStatus }) {
  const [tone, label] = map[status]
  return <Badge tone={tone}>{label}</Badge>
}
