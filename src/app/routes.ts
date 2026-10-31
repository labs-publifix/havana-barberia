/** Route builders. Paths are relative to the router basename (VITE_BASE). */
export const routes = {
  home: '/',
  book: (serviceId?: string) => (serviceId ? `/reservar?servicios=${encodeURIComponent(serviceId)}` : '/reservar'),
  confirmation: (token: string) => `/confirmacion/${token}`,
  manage: (token: string) => `/cita/${token}`,
  loyalty: (token: string) => `/lealtad/${token}`,
  policies: '/politicas',
  privacy: '/privacidad',
  gallery: '/__ui',
}
