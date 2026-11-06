import type { Service, StaffCommission } from '@/domain/types'
import { money } from '@/lib/time'

/** Commission math for a barber (pure). Percent of the service price, or a fixed amount per service. */

/** What the barber earns on one service, or null if nothing is captured. */
export function commissionOn(service: Pick<Service, 'id' | 'price'>, c: StaffCommission | null | undefined) {
  if (!c) return null
  const value = c.overrides[service.id] ?? c.value
  if (value === null || value === undefined) return null
  return c.mode === 'percent' ? Math.round((service.price * value) / 100) : value
}

/** "40% por servicio · 2 personalizados", "$120 por servicio" or "Sin capturar". */
export function commissionLabel(c: StaffCommission | null | undefined) {
  if (!c) return 'Sin capturar'
  const base =
    c.value === null
      ? 'Sin capturar'
      : c.mode === 'percent'
        ? `${c.value}% por servicio`
        : `${money(c.value)} por servicio`
  const n = Object.keys(c.overrides).length
  return n ? `${base} · ${n} ${n === 1 ? 'personalizado' : 'personalizados'}` : base
}
