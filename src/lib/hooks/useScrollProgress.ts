import { useEffect } from 'react'

/**
 * Writes the scroll progress over the first viewport height (0 → 1) to a CSS
 * variable on <html>. One passive listener, coalesced with requestAnimationFrame;
 * every visual effect (backdrop blur, veil) is pure CSS reading the variable.
 */
export function useScrollProgress(variable = '--hero-progress') {
  useEffect(() => {
    const root = document.documentElement
    let frame = 0
    const update = () => {
      frame = 0
      const h = window.innerHeight || 1
      const p = Math.min(1, Math.max(0, window.scrollY / h))
      root.style.setProperty(variable, p.toFixed(3))
    }
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(update)
    }
    update()
    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', onScroll, { passive: true })
    return () => {
      cancelAnimationFrame(frame)
      window.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', onScroll)
      root.style.removeProperty(variable)
    }
  }, [variable])
}
