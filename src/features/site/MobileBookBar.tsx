import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { buttonClass } from '@/components/ui/buttonClass'
import { routes } from '@/app/routes'
import { cn } from '@/lib/cn'
import { useOpenStatus } from './useOpenStatus'

/**
 * Phones/tablets: fixed booking bar that appears once the hero (#inicio) is out
 * of view. Respects the iPhone safe area; the footer reserves space for it.
 */
export function MobileBookBar({ watchId = 'inicio' }: { watchId?: string }) {
  const status = useOpenStatus()
  const [show, setShow] = useState(false)
  useEffect(() => {
    const el = document.getElementById(watchId)
    if (!el || typeof IntersectionObserver === 'undefined') {
      setShow(true)
      return
    }
    const io = new IntersectionObserver(([e]) => setShow(!e?.isIntersecting), { rootMargin: '0px 0px -40% 0px' })
    io.observe(el)
    return () => io.disconnect()
  }, [watchId])
  return (
    <div
      data-testid="mobile-book-bar"
      aria-hidden={!show}
      className={cn(
        'fixed inset-x-0 bottom-0 z-sticky border-t border-white/10 bg-ink-950/90 backdrop-blur-md transition-transform duration-base ease-brand lg:hidden',
        show ? 'translate-y-0' : 'pointer-events-none translate-y-full',
      )}
    >
      <div className="pb-safe mx-auto flex max-w-xl items-center justify-between gap-4 px-4 pt-3">
        <p className="flex items-center gap-2 text-[13px] text-gray-300">
          <span className={cn('size-2 rounded-full', status.open ? 'bg-aqua-400' : 'bg-gray-500')} aria-hidden />
          <span className="tabular">{status.short}</span>
        </p>
        <Link
          to={routes.book()}
          tabIndex={show ? 0 : -1}
          className={buttonClass({ variant: 'accent', size: 'md', className: 'px-6' })}
        >
          Reservar cita
        </Link>
      </div>
    </div>
  )
}
