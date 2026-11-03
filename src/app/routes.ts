/** Route builders. Paths are relative to the router basename (VITE_BASE). */
export const routes = {
  home: '/',
  book: (serviceId?: string) => (serviceId ? `/reservar?servicios=${encodeURIComponent(serviceId)}` : '/reservar'),
  confirmation: (token: string) => `/confirmacion/${token}`,
  manage: (token: string) => `/cita/${token}`,
  loyalty: (token: string) => `/lealtad/${token}`,
  /**
   * Booking with preselection. The flow already reads these query params
   * (servicios, barbero, paso); this builder only creates the link.
   */
  bookWith: ({
    serviceIds = [],
    staffId,
    step,
  }: {
    serviceIds?: string[]
    staffId?: string
    step?: '1' | '2' | '3'
  }) => {
    const q = new URLSearchParams()
    if (step) q.set('paso', step)
    if (serviceIds.length) q.set('servicios', serviceIds.join(','))
    if (staffId) q.set('barbero', staffId)
    const s = q.toString()
    return s ? `/reservar?${s}` : '/reservar'
  },
  services: '/servicios',
  policies: '/politicas',
  privacy: '/privacidad',
  gallery: '/__ui',
}
