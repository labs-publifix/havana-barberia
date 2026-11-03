import { useEffect, useState, type RefObject } from 'react'

/** True while the element intersects the viewport (with optional root margin). */
export function useInView(ref: RefObject<Element | null>, options: IntersectionObserverInit = {}, initial = true) {
  const [inView, setInView] = useState(initial)
  const { root, rootMargin, threshold } = options
  useEffect(() => {
    const el = ref.current
    if (!el || typeof IntersectionObserver === 'undefined') return
    const io = new IntersectionObserver(([e]) => setInView(Boolean(e?.isIntersecting)), { root, rootMargin, threshold })
    io.observe(el)
    return () => io.disconnect()
  }, [ref, root, rootMargin, threshold])
  return inView
}
