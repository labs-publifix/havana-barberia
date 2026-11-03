import { useEffect, useState } from 'react'

export function useMediaQuery(query: string, fallback = false) {
  const get = () => (typeof window !== 'undefined' && window.matchMedia ? window.matchMedia(query).matches : fallback)
  const [matches, setMatches] = useState(get)
  useEffect(() => {
    if (!window.matchMedia) return
    const mq = window.matchMedia(query)
    const on = () => setMatches(mq.matches)
    on()
    mq.addEventListener('change', on)
    return () => mq.removeEventListener('change', on)
  }, [query])
  return matches
}

export const useReducedMotion = () => useMediaQuery('(prefers-reduced-motion: reduce)')

/** Data saver (Save-Data header / Network Information API), when the browser exposes it. */
export function useSaveData() {
  const [save] = useState(() => {
    const c = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection
    return Boolean(c?.saveData)
  })
  return save
}
