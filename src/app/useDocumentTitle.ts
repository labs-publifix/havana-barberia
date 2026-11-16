import { useEffect } from 'react'
import { SEO_PAGES, canonicalUrl } from '@/config/seo'

const SUFFIX = 'Havana Barbería'

/** The app path of the current URL (without the base), e.g. '/servicios'. */
function currentPath() {
  const base = import.meta.env.BASE_URL.replace(/\/$/, '')
  const path = window.location.pathname.slice(base.length).replace(/\/+$/, '').replace(/\.html$/, '')
  return path || '/'
}

function setTag(selector: string, create: () => HTMLElement, attr: string, value: string | null) {
  let el = document.head.querySelector<HTMLElement>(selector)
  if (value === null) return el?.remove()
  if (!el) {
    el = create()
    document.head.appendChild(el)
  }
  el.setAttribute(attr, value)
}

const meta = (attr: 'name' | 'property', id: string, value: string) =>
  setTag(
    `meta[${attr}="${id}"]`,
    () => {
      const m = document.createElement('meta')
      m.setAttribute(attr, id)
      return m
    },
    'content',
    value,
  )

/**
 * Keeps the head in step with the page on client-side navigation: the tab
 * title (announced by screen readers on route change) and, for the public
 * pages in src/config/seo.ts, description, canonical and Open Graph. The
 * static HTML of each page already starts with the same tags.
 */
export function useDocumentTitle(title: string | null, opts: { noindex?: boolean } = {}) {
  useEffect(() => {
    const page = opts.noindex ? undefined : SEO_PAGES[currentPath()]
    document.title = page?.title ?? (title ? `${title} · ${SUFFIX}` : `${SUFFIX} · Reserva tu cita en Querétaro`)
    if (page) {
      const url = canonicalUrl(currentPath())
      meta('name', 'description', page.description)
      setTag('link[rel="canonical"]', () => Object.assign(document.createElement('link'), { rel: 'canonical' }), 'href', url)
      meta('property', 'og:url', url)
      meta('property', 'og:title', page.title)
      meta('property', 'og:description', page.description)
      meta('name', 'twitter:title', page.title)
      meta('name', 'twitter:description', page.description)
    } else {
      // Pages that are not in the index don't claim a canonical URL.
      setTag('link[rel="canonical"]', () => document.createElement('link'), 'href', null)
    }
    if (!opts.noindex) return
    const robots = document.createElement('meta')
    robots.name = 'robots'
    robots.content = 'noindex'
    document.head.appendChild(robots)
    return () => robots.remove()
  }, [title, opts.noindex])
}
