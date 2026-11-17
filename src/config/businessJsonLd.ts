import type { WeeklySchedule } from '@/domain/types'
import { business } from './business'
import { FOUNDER_PATH, founder } from './founder'
import { OG_IMAGE, SITE_URL } from './seo'

const DAY = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

/**
 * schema.org BarberShop for the home page. Written into the static HTML at
 * build time with the configured hours, then refreshed in the browser with
 * the hours from Ajustes › Horario (LocalBusinessJsonLd).
 *
 * No aggregateRating: Google rejects ratings a business publishes about
 * itself («tipo de objeto <parent_node> no válido»); the stars come from the
 * Google Business Profile.
 */
export function businessJsonLd(weekly: WeeklySchedule = business.hours.weekly) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BarberShop',
    '@id': `${SITE_URL}/#barberia`,
    name: business.name,
    description: 'Barbería en Querétaro: corte, fade, barba, afeitado y faciales. Reserva en línea.',
    url: `${SITE_URL}/`,
    telephone: '+52 442 537 7844',
    image: SITE_URL + OG_IMAGE.path,
    logo: `${SITE_URL}/apple-touch-icon.png`,
    priceRange: '$$',
    currenciesAccepted: 'MXN',
    address: {
      '@type': 'PostalAddress',
      streetAddress: 'Prol. Av. Zaragoza 46, Las Plazas',
      addressLocality: 'Santiago de Querétaro',
      addressRegion: 'Querétaro',
      postalCode: '76180',
      addressCountry: 'MX',
    },
    areaServed: { '@type': 'City', name: 'Santiago de Querétaro' },
    hasMap: business.reviewsHref,
    openingHoursSpecification: weekly.flatMap((ranges, wd) =>
      ranges.map((r) => ({ '@type': 'OpeningHoursSpecification', dayOfWeek: DAY[wd], opens: r.start, closes: r.end })),
    ),
    // Same @id as the Person on his profile page (founderJsonLd).
    founder: { '@type': 'Person', '@id': `${SITE_URL}${FOUNDER_PATH}#persona`, name: founder.name, url: `${SITE_URL}${FOUNDER_PATH}` },
    foundingDate: '2023',
    potentialAction: {
      '@type': 'ReserveAction',
      target: { '@type': 'EntryPoint', urlTemplate: `${SITE_URL}/reservar`, actionPlatform: ['https://schema.org/DesktopWebPlatform', 'https://schema.org/MobileWebPlatform'] },
      result: { '@type': 'Reservation', name: 'Cita en Havana Barbería' },
    },
    ...(business.instagramUrl ? { sameAs: [business.instagramUrl] } : {}),
  }
}

export const JSON_LD_ID = 'ld-business'

export const jsonLdScript = (data: object, id = JSON_LD_ID) =>
  `<script type="application/ld+json" id="${id}">${JSON.stringify(data).replace(/</g, '\\u003c')}</script>`
