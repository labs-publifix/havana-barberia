import { business } from './business'
import { FOUNDER_PATH, founder } from './founder'
import { SEO_PAGES, SITE_URL, canonicalUrl } from './seo'

export const PERSON_ID = `${SITE_URL}${FOUNDER_PATH}#persona`
export const CUBITA_ID = `${SITE_URL}${FOUNDER_PATH}#cubita`
const SHOP_ID = `${SITE_URL}/#barberia`

/**
 * schema.org for Leonardo's profile page: ProfilePage whose main entity is the
 * Person (who he is, where he works, what he founded), the Cubita brand and the
 * breadcrumb. Only facts from his approved biography.
 */
export function founderJsonLd(dateModified: string) {
  const url = canonicalUrl(FOUNDER_PATH)
  const page = SEO_PAGES[FOUNDER_PATH]!
  const photo = `${SITE_URL}${founder.hero.base}-1600.jpg`
  return {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'ProfilePage',
        '@id': `${url}#pagina`,
        url,
        name: page.title,
        description: page.description,
        inLanguage: 'es-MX',
        dateModified,
        isPartOf: { '@type': 'WebSite', '@id': `${SITE_URL}/#sitio`, url: `${SITE_URL}/`, name: business.name },
        breadcrumb: { '@id': `${url}#migas` },
        primaryImageOfPage: { '@id': `${url}#foto` },
        mainEntity: { '@id': PERSON_ID },
      },
      {
        '@type': 'ImageObject',
        '@id': `${url}#foto`,
        url: photo,
        contentUrl: photo,
        width: 1600,
        height: 1066,
        caption: founder.hero.alt,
        creditText: business.name,
      },
      {
        '@type': 'Person',
        '@id': PERSON_ID,
        name: founder.name,
        givenName: founder.givenName,
        familyName: founder.familyName,
        alternateName: founder.alternateNames,
        description: page.description,
        jobTitle: founder.jobTitle,
        url,
        image: { '@id': `${url}#foto` },
        nationality: { '@type': 'Country', name: 'Cuba' },
        homeLocation: { '@type': 'City', name: 'Santiago de Querétaro', containedInPlace: 'Querétaro, México' },
        hasOccupation: {
          '@type': 'Occupation',
          name: 'Barbero',
          occupationLocation: { '@type': 'City', name: 'Santiago de Querétaro' },
        },
        knowsAbout: founder.knowsAbout,
        worksFor: { '@id': SHOP_ID },
        affiliation: [{ '@id': SHOP_ID }, { '@id': CUBITA_ID }],
      },
      {
        '@type': 'Organization',
        '@id': CUBITA_ID,
        name: founder.brand.name,
        description: founder.brand.description,
        image: `${SITE_URL}${founder.brand.image.base}-1200.webp`,
        founder: { '@id': PERSON_ID },
      },
      {
        '@type': 'BreadcrumbList',
        '@id': `${url}#migas`,
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'Inicio', item: `${SITE_URL}/` },
          { '@type': 'ListItem', position: 2, name: 'Barberos', item: `${SITE_URL}/#barberos` },
          { '@type': 'ListItem', position: 3, name: founder.name, item: url },
        ],
      },
    ],
  }
}
