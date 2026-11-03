import { useEffect, useRef, type CSSProperties, type ElementType, type ReactNode } from 'react'
import { cn } from '@/lib/cn'

let observer: IntersectionObserver | null = null
function getObserver() {
  if (observer || typeof IntersectionObserver === 'undefined') return observer
  observer = new IntersectionObserver(
    (entries) => {
      for (const e of entries) {
        if (e.isIntersecting) {
          e.target.classList.add('is-visible')
          observer?.unobserve(e.target)
        }
      }
    },
    { rootMargin: '0px 0px -10% 0px', threshold: 0.1 },
  )
  return observer
}

/**
 * Fade + slight rise when the element enters the viewport (one shared
 * IntersectionObserver, CSS transitions). Respects prefers-reduced-motion.
 */
export function Reveal({
  as: Tag = 'div',
  delay = 0,
  className,
  children,
  ...rest
}: {
  as?: ElementType
  delay?: number
  className?: string
  children: ReactNode
  id?: string
}) {
  const ref = useRef<HTMLElement>(null)
  useEffect(() => {
    const el = ref.current
    const io = getObserver()
    if (!el) return
    if (!io) {
      el.classList.add('is-visible')
      return
    }
    io.observe(el)
    return () => io.unobserve(el)
  }, [])
  return (
    <Tag
      ref={ref}
      data-reveal=""
      className={cn(className)}
      style={{ '--reveal-delay': `${delay}ms` } as CSSProperties}
      {...rest}
    >
      {children}
    </Tag>
  )
}
