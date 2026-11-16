/**
 * Search and social metadata for the public pages. One source for the static
 * HTML written at build time (vite.config.ts: each page gets its own
 * index.html, so it answers 200 with its own head) and for the head updates
 * on client-side navigation (useDocumentTitle). No imports: vite.config.ts
 * reads this file before the app's path aliases exist.
 */

export const SITE_URL = 'https://havanabarberia.com'
export const SITE_NAME = 'Havana Barbería'
export const OG_IMAGE = { path: '/og-image.jpg', width: 1200, height: 630, alt: 'Havana Barbería, barbería en Querétaro' }

export interface SeoPage {
  /** Full <title>. */
  title: string
  description: string
  /** Sitemap hints. */
  priority: number
  changefreq: 'weekly' | 'monthly' | 'yearly'
}

/** The indexable pages, by path (no trailing slash, '/' for home). */
export const SEO_PAGES: Record<string, SeoPage> = {
  '/': {
    title: 'Havana Barbería · Barbería en Querétaro | Reserva en línea',
    description:
      'Barbería en Querétaro, en Las Plazas: corte, fade, barba y facial con barberos expertos. Reserva tu cita en línea en menos de un minuto.',
    priority: 1,
    changefreq: 'weekly',
  },
  '/servicios': {
    title: 'Servicios y precios · Havana Barbería Querétaro',
    description:
      'Precios y duración de cortes, barba, afeitado y faciales en Havana Barbería, Querétaro. Elige tu servicio y reserva en línea.',
    priority: 0.9,
    changefreq: 'weekly',
  },
  '/reservar': {
    title: 'Reserva tu cita · Havana Barbería Querétaro',
    description:
      'Agenda tu corte o barba en Havana Barbería, Querétaro: elige servicio, barbero y horario. Sin crear cuenta y con confirmación por correo.',
    priority: 0.9,
    changefreq: 'weekly',
  },
  '/politicas': {
    title: 'Políticas de reserva · Havana Barbería',
    description:
      'Cancelaciones, cambios de horario, tolerancia y tarjeta de lealtad de Havana Barbería en Querétaro.',
    priority: 0.3,
    changefreq: 'yearly',
  },
  '/privacidad': {
    title: 'Aviso de privacidad · Havana Barbería',
    description:
      'Aviso de privacidad de Havana Barbería: qué datos usamos para tus citas, para qué y cómo ejercer tus derechos.',
    priority: 0.2,
    changefreq: 'yearly',
  },
}

export const canonicalUrl = (path: string) => SITE_URL + (path === '/' ? '/' : path)

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;')

/** The <head> tags of one page (between the <!--seo--> markers of index.html). */
export function seoHead(path: string, extra = ''): string {
  const p = SEO_PAGES[path] ?? SEO_PAGES['/']!
  const url = canonicalUrl(path)
  const img = SITE_URL + OG_IMAGE.path
  return [
    `<title>${esc(p.title)}</title>`,
    `<meta name="description" content="${esc(p.description)}" />`,
    `<link rel="canonical" href="${url}" />`,
    `<meta property="og:type" content="website" />`,
    `<meta property="og:locale" content="es_MX" />`,
    `<meta property="og:site_name" content="${SITE_NAME}" />`,
    `<meta property="og:url" content="${url}" />`,
    `<meta property="og:title" content="${esc(p.title)}" />`,
    `<meta property="og:description" content="${esc(p.description)}" />`,
    `<meta property="og:image" content="${img}" />`,
    `<meta property="og:image:type" content="image/jpeg" />`,
    `<meta property="og:image:width" content="${OG_IMAGE.width}" />`,
    `<meta property="og:image:height" content="${OG_IMAGE.height}" />`,
    `<meta property="og:image:alt" content="${esc(OG_IMAGE.alt)}" />`,
    `<meta name="twitter:card" content="summary_large_image" />`,
    `<meta name="twitter:title" content="${esc(p.title)}" />`,
    `<meta name="twitter:description" content="${esc(p.description)}" />`,
    `<meta name="twitter:image" content="${img}" />`,
    extra,
  ]
    .filter(Boolean)
    .join('\n    ')
}

export function sitemapXml(lastmod: string): string {
  const urls = Object.entries(SEO_PAGES)
    .map(
      ([path, p]) =>
        `  <url>\n    <loc>${canonicalUrl(path)}</loc>\n    <lastmod>${lastmod}</lastmod>\n    <changefreq>${p.changefreq}</changefreq>\n    <priority>${p.priority.toFixed(1)}</priority>\n  </url>`,
    )
    .join('\n')
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`
}
