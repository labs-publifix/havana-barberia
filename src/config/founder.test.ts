import { FOUNDER_PATH, founder, isFounderStaff } from './founder'
import { founderJsonLd, PERSON_ID } from './founderJsonLd'
import { businessJsonLd } from './businessJsonLd'
import { SEO_PAGES, sitemapXml } from './seo'

describe('founder page', () => {
  it('finds Leonardo among the barbers by id or name', () => {
    expect(isFounderStaff({ id: 'leonardo', name: 'Leo' })).toBe(true)
    expect(isFounderStaff({ id: 'x7k2', name: 'Leonardo Gómez' })).toBe(true)
    expect(isFounderStaff({ id: 'x7k2', name: '  leonardo' })).toBe(true)
    expect(isFounderStaff({ id: 'isaac', name: 'Isaac Fuentes' })).toBe(false)
    expect(isFounderStaff({ id: 'y', name: 'Leonardita' })).toBe(false)
  })

  it('has search metadata within limits and is in the sitemap', () => {
    const page = SEO_PAGES[FOUNDER_PATH]!
    expect(page.title).toContain(founder.name)
    expect(page.title.length).toBeLessThanOrEqual(60)
    expect(page.description.length).toBeLessThanOrEqual(160)
    expect(page.description).toContain('Havana Barbería')
    expect(page.description).not.toMatch(/Habana Barber/)
    expect(sitemapXml('2026-11-17')).toContain('https://havanabarberia.com/barberos/leonardo-gomez-rios')
  })

  it('describes Leonardo as a Person on a ProfilePage, founder of the shop and of Cubita', () => {
    const graph = founderJsonLd('2026-11-17')['@graph'] as Array<Record<string, unknown>>
    const byType = (t: string) => graph.find((n) => n['@type'] === t)!
    expect(byType('ProfilePage').mainEntity).toEqual({ '@id': PERSON_ID })
    expect(byType('Person')).toMatchObject({ name: 'Leonardo Gómez Ríos', worksFor: { '@id': 'https://havanabarberia.com/#barberia' } })
    expect(byType('Organization')).toMatchObject({ name: 'Cubita', founder: { '@id': PERSON_ID } })
    expect((byType('BreadcrumbList').itemListElement as unknown[]).length).toBe(3)
    expect(businessJsonLd().founder['@id']).toBe(PERSON_ID)
  })

  it('keeps the agreed wording (no medical or result claims)', () => {
    const text = JSON.stringify(founder)
    expect(text).not.toMatch(/cirug/i)
    expect(text).not.toMatch(/resultados reales/i)
    expect(text).not.toMatch(/La Havana/)
    expect(text).not.toMatch(/Jardines de la Hacienda/)
  })
})
