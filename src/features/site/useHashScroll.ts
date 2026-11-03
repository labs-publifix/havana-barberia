import { useEffect } from 'react'
import { useLocation } from 'react-router-dom'

/** Scroll to #hash after navigation (React Router does not do it by itself). */
export function useHashScroll(ready = true) {
  const { hash, pathname } = useLocation()
  useEffect(() => {
    if (!ready || !hash) return
    const id = decodeURIComponent(hash.slice(1))
    const t = window.setTimeout(() => document.getElementById(id)?.scrollIntoView({ block: 'start' }), 50)
    return () => window.clearTimeout(t)
  }, [hash, pathname, ready])
}
