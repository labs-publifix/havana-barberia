import { renderHook } from '@testing-library/react'
import { useDocumentTitle } from './useDocumentTitle'
import { SEO_PAGES } from '@/config/seo'

const go = (path: string) => window.history.replaceState(null, '', import.meta.env.BASE_URL.replace(/\/$/, '') + path)
const head = (sel: string, attr = 'content') => document.head.querySelector(sel)?.getAttribute(attr) ?? null

describe('useDocumentTitle', () => {
  afterEach(() => go('/'))

  it('sets title, description, canonical and Open Graph for a public page', () => {
    go('/servicios')
    renderHook(() => useDocumentTitle('Servicios y precios'))
    expect(document.title).toBe(SEO_PAGES['/servicios']!.title)
    expect(head('meta[name="description"]')).toBe(SEO_PAGES['/servicios']!.description)
    expect(head('link[rel="canonical"]', 'href')).toBe('https://havanabarberia.com/servicios')
    expect(head('meta[property="og:url"]')).toBe('https://havanabarberia.com/servicios')
    expect(head('meta[name="twitter:title"]')).toBe(SEO_PAGES['/servicios']!.title)
  })

  it('drops the canonical and adds noindex on private pages', () => {
    go('/cita/abc')
    const { unmount } = renderHook(() => useDocumentTitle('Tu cita', { noindex: true }))
    expect(document.title).toBe('Tu cita · Havana Barbería')
    expect(head('link[rel="canonical"]', 'href')).toBeNull()
    expect(head('meta[name="robots"]')).toBe('noindex')
    unmount()
    expect(head('meta[name="robots"]')).toBeNull()
  })
})
