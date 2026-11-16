import { useEffect } from 'react'
import { useBusinessHours } from '@/app/queries'
import { JSON_LD_ID, businessJsonLd } from '@/config/businessJsonLd'

/**
 * schema.org BarberShop structured data. The static HTML of the home page
 * already carries it (built with the configured hours); this keeps the same
 * script up to date with the hours from Ajustes › Horario.
 */
export function LocalBusinessJsonLd() {
  const hours = useBusinessHours()
  useEffect(() => {
    let el = document.getElementById(JSON_LD_ID) as HTMLScriptElement | null
    const created = !el
    if (!el) {
      el = document.createElement('script')
      el.type = 'application/ld+json'
      el.id = JSON_LD_ID
      document.head.appendChild(el)
    }
    el.textContent = JSON.stringify(businessJsonLd(hours.weekly))
    return () => {
      if (created) el.remove()
    }
  }, [hours.weekly])
  return null
}
