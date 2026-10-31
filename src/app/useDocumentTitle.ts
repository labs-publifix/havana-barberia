import { useEffect } from 'react'

const SUFFIX = 'Havana Barbería'

/** Sets the tab title (announced by screen readers on route change) and optional robots meta. */
export function useDocumentTitle(title: string | null, opts: { noindex?: boolean } = {}) {
  useEffect(() => {
    document.title = title ? `${title} · ${SUFFIX}` : `${SUFFIX} · Reserva tu cita en Querétaro`
    if (!opts.noindex) return
    const meta = document.createElement('meta')
    meta.name = 'robots'
    meta.content = 'noindex'
    document.head.appendChild(meta)
    return () => meta.remove()
  }, [title, opts.noindex])
}
