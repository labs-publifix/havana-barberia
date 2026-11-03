import { useEffect, useRef, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import * as Dialog from '@radix-ui/react-dialog'
import { Menu, X } from 'lucide-react'
import { Logo } from '@/components/Logo'
import { buttonClass } from '@/components/ui/buttonClass'
import { routes } from '@/app/routes'
import { cn } from '@/lib/cn'
import { useOpenStatus } from './useOpenStatus'
import { NAV_SECTIONS, FLOAT_AFTER } from './nav'

/**
 * One navbar with two states and no layout jump:
 * - transparent, full width, over the hero;
 * - floating: a centered glass pill (one 300 ms transition).
 * `startFloating` makes inner pages start in the floating state.
 */
export function SiteNav({ startFloating = false }: { startFloating?: boolean }) {
  const { pathname } = useLocation()
  const onHome = pathname === '/'
  const [scrolled, setScrolled] = useState(false)
  const [active, setActive] = useState<string | null>(null)
  const [deep, setDeep] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const sentinel = useRef<HTMLDivElement>(null)
  const status = useOpenStatus()

  // Floating state: a sentinel FLOAT_AFTER px below the top of the document.
  useEffect(() => {
    const el = sentinel.current
    if (!el || typeof IntersectionObserver === 'undefined') return
    const io = new IntersectionObserver(([e]) => setScrolled(!e?.isIntersecting))
    io.observe(el)
    return () => io.disconnect()
  }, [])

  // Active section (home only) and "past the hero" (stronger blur).
  useEffect(() => {
    if (!onHome || typeof IntersectionObserver === 'undefined') return
    const visible = new Map<string, number>()
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) visible.set(e.target.id, e.isIntersecting ? e.intersectionRatio : 0)
        const best = [...visible.entries()].sort((a, b) => b[1] - a[1])[0]
        setActive(best && best[1] > 0 ? best[0] : null)
      },
      { rootMargin: '-35% 0px -55% 0px', threshold: [0, 0.25, 0.5, 1] },
    )
    for (const s of NAV_SECTIONS) {
      const el = document.getElementById(s.id)
      if (el) io.observe(el)
    }
    const hero = document.getElementById('inicio')
    const heroIo = hero
      ? new IntersectionObserver(([e]) => setDeep(!e?.isIntersecting), { rootMargin: '-80px 0px 0px 0px' })
      : null
    if (hero) heroIo?.observe(hero)
    return () => {
      io.disconnect()
      heroIo?.disconnect()
    }
  }, [onHome])

  const floating = startFloating || scrolled
  const href = (id: string) => ({ pathname: '/', hash: `#${id}` })

  const links = NAV_SECTIONS.map((s) => (
    <Link
      key={s.id}
      to={href(s.id)}
      aria-current={onHome && active === s.id ? 'true' : undefined}
      className="nav-link whitespace-nowrap rounded-sm py-2 text-[12px] font-semibold uppercase tracking-[0.18em] text-gray-300 transition-colors duration-fast hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-aqua-400 aria-[current=true]:text-white"
    >
      {s.label}
    </Link>
  ))

  return (
    <>
      <div
        ref={sentinel}
        aria-hidden
        className="pointer-events-none absolute left-0 top-0 h-px w-px"
        style={{ top: FLOAT_AFTER }}
      />
      <header className="fixed inset-x-0 top-0 z-sticky flex justify-center px-3 md:px-4" data-floating={floating}>
        <nav
          aria-label="Principal"
          data-testid="site-nav"
          data-state={floating ? 'floating' : 'top'}
          className={cn(
            'site-nav__bar flex w-full items-center justify-between gap-6 border',
            floating
              ? cn(
                  'mt-3 max-w-[var(--nav-float-w)] rounded-full border-glass-border bg-glass py-2 pl-5 pr-2 shadow-lg backdrop-blur-md',
                  deep && 'backdrop-blur-xl',
                )
              : 'mt-0 max-w-[1440px] rounded-none border-transparent bg-transparent px-2 py-5 md:px-6',
          )}
          style={{ ['--nav-float-w' as string]: 'min(100%, 940px)' }}
        >
          <Link
            to="/"
            aria-label="Havana Barbería, inicio"
            className="shrink-0 rounded-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-aqua-400"
          >
            <Logo
              variant="white"
              priority
              className={cn('site-nav__logo', floating ? 'w-[64px] md:w-[72px]' : 'w-[96px] md:w-[124px]')}
            />
          </Link>

          <div className="hidden items-center gap-7 lg:flex">{links}</div>

          <div className="flex items-center gap-2">
            <Link
              to={routes.book()}
              className={buttonClass({
                variant: floating ? 'accent' : 'secondary',
                size: 'sm',
                className: cn('px-5', !floating && 'border-white text-white hover:bg-white/10'),
              })}
            >
              Reservar
            </Link>
            <Dialog.Root open={menuOpen} onOpenChange={setMenuOpen}>
              <Dialog.Trigger
                className="grid size-tap place-items-center rounded-full text-white hover:bg-white/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-aqua-400 lg:hidden"
                aria-label="Abrir menú"
              >
                <Menu className="size-6" strokeWidth={1.75} />
              </Dialog.Trigger>
              <Dialog.Portal>
                <Dialog.Content
                  data-theme="dark"
                  className="pb-safe fixed inset-0 z-modal flex flex-col bg-ink-950 px-6 pt-6 text-white data-[state=open]:animate-[fade-in_200ms_ease-out]"
                >
                  <div className="flex items-center justify-between">
                    <Logo variant="white" className="w-[84px]" />
                    <Dialog.Close
                      className="grid size-tap place-items-center rounded-full hover:bg-white/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-aqua-400"
                      aria-label="Cerrar menú"
                    >
                      <X className="size-6" strokeWidth={1.75} />
                    </Dialog.Close>
                  </div>
                  <Dialog.Title className="sr-only">Menú</Dialog.Title>
                  <Dialog.Description className="sr-only">Secciones de Havana Barbería</Dialog.Description>
                  <nav aria-label="Menú" className="mt-12 grid gap-2">
                    {NAV_SECTIONS.map((s, i) => (
                      <Link
                        key={s.id}
                        to={href(s.id)}
                        onClick={() => setMenuOpen(false)}
                        className="flex items-baseline gap-4 rounded-md py-3 text-[clamp(2rem,9vw,2.75rem)] font-semibold tracking-[-0.03em] focus-visible:outline focus-visible:outline-2 focus-visible:outline-aqua-400"
                      >
                        <span className="tabular text-sm font-medium text-gray-400">0{i + 1}</span>
                        {s.label}
                      </Link>
                    ))}
                    <Link
                      to={routes.services}
                      onClick={() => setMenuOpen(false)}
                      className="mt-2 rounded-md py-3 text-lg text-gray-300 underline-offset-4 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-aqua-400"
                    >
                      Todos los servicios
                    </Link>
                  </nav>
                  <div className="mt-auto grid gap-3 pb-4">
                    <p className="text-sm text-gray-300">{status.label}</p>
                    <Link
                      to={routes.book()}
                      onClick={() => setMenuOpen(false)}
                      className={buttonClass({ variant: 'accent', size: 'lg', block: true })}
                    >
                      Reservar cita
                    </Link>
                  </div>
                </Dialog.Content>
              </Dialog.Portal>
            </Dialog.Root>
          </div>
        </nav>
      </header>
    </>
  )
}
