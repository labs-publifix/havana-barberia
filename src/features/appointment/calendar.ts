import type { Appointment, Service } from '@/domain/types'
import { business } from '@/config/business'
import { routes } from '@/app/routes'
import { buildIcs, downloadIcs } from '@/lib/ics'

export function addToCalendar(a: Appointment, services: Service[]) {
  const names = a.serviceIds.map((id) => services.find((s) => s.id === id)?.name).filter(Boolean)
  const manageUrl = `${window.location.origin}${import.meta.env.BASE_URL.replace(/\/$/, '')}${routes.manage(a.token)}`
  const ics = buildIcs({
    uid: a.id,
    startsAt: a.startsAt,
    endsAt: a.endsAt,
    title: `${business.name}: ${names.join(', ')}`,
    location: business.address,
    description: `Para cancelar o reprogramar (hasta ${business.policy.changeCutoffMin / 60} h antes): ${manageUrl}\nTeléfono: ${business.phoneDisplay}`,
    url: manageUrl,
  })
  downloadIcs('cita-havana-barberia.ics', ics)
}
