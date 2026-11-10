import { useEffect } from 'react'
import { business } from '@/config/business'
import { useBusinessHours } from '@/app/queries'

const DAY = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

/** schema.org BarberShop structured data, built from configuration. */
export function LocalBusinessJsonLd() {
  const hours = useBusinessHours()
  useEffect(() => {
    const data = {
      '@context': 'https://schema.org',
      '@type': 'BarberShop',
      name: business.name,
      url: business.website,
      telephone: '+52 442 537 7844',
      image: new URL(`${import.meta.env.BASE_URL}og-image.jpg`, window.location.origin).href,
      priceRange: '$$',
      address: {
        '@type': 'PostalAddress',
        streetAddress: 'Prol. Av. Zaragoza 46, Las Plazas',
        addressLocality: 'Santiago de Querétaro',
        addressRegion: 'Qro.',
        postalCode: '76180',
        addressCountry: 'MX',
      },
      openingHoursSpecification: hours.weekly.flatMap((ranges, wd) =>
        ranges.map((r) => ({
          '@type': 'OpeningHoursSpecification',
          dayOfWeek: DAY[wd],
          opens: r.start,
          closes: r.end,
        })),
      ),
      aggregateRating: {
        '@type': 'AggregateRating',
        ratingValue: business.rating.value,
        reviewCount: business.rating.count,
      },
    }
    const el = document.createElement('script')
    el.type = 'application/ld+json'
    el.textContent = JSON.stringify(data)
    document.head.appendChild(el)
    return () => el.remove()
  }, [hours.weekly])
  return null
}
