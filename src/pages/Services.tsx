import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { CalendarCheck, Clock, Plus } from 'lucide-react'
import { buttonClass } from '@/components/ui/buttonClass'
import { LoadingRegion, Skeleton } from '@/components/ui/Skeleton'
import { Alert } from '@/components/ui/Alert'
import { useCatalog } from '@/app/queries'
import { routes } from '@/app/routes'
import { useDocumentTitle } from '@/app/useDocumentTitle'
import { serviceBadges } from '@/config/serviceBadges'
import { SiteNav } from '@/features/site/SiteNav'
import { SiteFooter } from '@/features/site/SiteFooter'
import { SkipLink } from '@/features/site/SkipLink'
import { Eyebrow, Light } from '@/features/site/Section'
import { useHashScroll } from '@/features/site/useHashScroll'
import { cn } from '@/lib/cn'
import { durationLabel, money } from '@/lib/time'

/** /servicios — every service from the catalog, filterable by category. "Agendar" behaves as before. */
export default function Services() {
  useDocumentTitle('Servicios y precios')
  const { data, isPending, isError, refetch } = useCatalog()
  const navigate = useNavigate()
  const [category, setCategory] = useState<string | null>(null)
  useHashScroll(Boolean(data))

  const categories = data?.categories ?? []
  const visible = categories.filter((c) => !category || c.id === category)

  return (
    <div data-theme="dark" className="min-h-dvh bg-ink-950 text-white">
      <SkipLink />
      <SiteNav startFloating />
      <main id="contenido" tabIndex={-1} className="outline-none">
        <header className="mx-auto grid max-w-6xl gap-4 px-4 pb-10 pt-36 md:px-8 md:pt-44">
          <Eyebrow>Servicios y precios</Eyebrow>
          <h1 className="text-[clamp(2.5rem,6.5vw,5rem)] font-semibold leading-[1] tracking-[-0.04em]">
            Todo lo que hacemos, <Light>sin letras chiquitas.</Light>
          </h1>
          <p className="t-body-lg max-w-[52ch] text-gray-300">
            Precios en pesos mexicanos. Elige uno o varios servicios y aparta tu horario en menos de un minuto.
          </p>
        </header>

        <nav
          aria-label="Categorías"
          className="sticky top-[76px] z-dropdown border-y border-white/10 bg-ink-950/85 backdrop-blur-md md:top-[84px]"
        >
          <ul className="no-scrollbar mx-auto flex max-w-6xl gap-2 overflow-x-auto px-4 py-3 md:px-8">
            {[
              { id: null as string | null, name: 'Todos' },
              ...categories.map((c) => ({ id: c.id as string | null, name: c.name })),
            ].map((c) => (
              <li key={c.name}>
                <button
                  type="button"
                  aria-pressed={category === c.id}
                  onClick={() => setCategory(c.id)}
                  className={cn(
                    'inline-flex h-btn-sm min-h-tap items-center whitespace-nowrap rounded-full border px-4 text-sm font-semibold transition-colors duration-fast focus-visible:outline focus-visible:outline-2 focus-visible:outline-aqua-400',
                    category === c.id
                      ? 'border-aqua-500 bg-aqua-500 text-ink-950'
                      : 'border-white/20 text-gray-200 hover:border-white/40',
                  )}
                >
                  {c.name}
                </button>
              </li>
            ))}
          </ul>
        </nav>

        <div className="mx-auto grid max-w-6xl gap-14 px-4 py-14 md:px-8">
          {isError ? (
            <Alert
              tone="danger"
              title="No pudimos cargar los servicios."
              action={
                <button className={buttonClass({ variant: 'secondary', size: 'sm' })} onClick={() => refetch()}>
                  Intentar de nuevo
                </button>
              }
            >
              Revisa tu conexión e inténtalo de nuevo.
            </Alert>
          ) : isPending ? (
            <LoadingRegion label="Cargando servicios…">
              <div className="grid gap-3">
                {Array.from({ length: 6 }, (_, i) => (
                  <Skeleton key={i} className="h-24 rounded-lg bg-white/[0.06]" />
                ))}
              </div>
            </LoadingRegion>
          ) : (
            visible.map((cat) => {
              const items = data.services.filter((s) => s.categoryId === cat.id)
              if (!items.length) return null
              return (
                <section key={cat.id} aria-labelledby={`cat-${cat.id}`}>
                  <h2
                    id={`cat-${cat.id}`}
                    className="mb-4 text-xs font-semibold uppercase tracking-[0.22em] text-aqua-400"
                  >
                    {cat.name}
                  </h2>
                  <ul className="divide-y divide-white/10 border-y border-white/10">
                    {items.map((s) => (
                      <li
                        key={s.id}
                        id={s.id}
                        className="grid scroll-mt-40 gap-3 py-5 sm:grid-cols-[1fr_auto] sm:items-center sm:gap-8"
                      >
                        <div className="min-w-0">
                          <h3 className="flex flex-wrap items-center gap-2 text-xl font-semibold tracking-[-0.02em]">
                            {s.name}
                            {serviceBadges[s.id] && (
                              <span className="rounded-full border border-aqua-500 px-2 py-0.5 text-[11px] font-semibold text-aqua-400">
                                {serviceBadges[s.id]}
                              </span>
                            )}
                          </h3>
                          <p className="mt-1 text-gray-300">{s.description}</p>
                          <p className="tabular mt-2 inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.18em] text-gray-400">
                            <Clock className="size-3.5" strokeWidth={2} aria-hidden /> {durationLabel(s.durationMin)}
                          </p>
                        </div>
                        <div className="flex items-center justify-between gap-5 sm:justify-end">
                          <p className="tabular text-2xl font-semibold tracking-[-0.02em]">{money(s.price)}</p>
                          <button
                            type="button"
                            onClick={() => navigate(routes.book(s.id))}
                            className={buttonClass({ variant: 'accent', size: 'md' })}
                            aria-label={`Agendar ${s.name}`}
                          >
                            <Plus className="size-4" strokeWidth={2.25} aria-hidden /> Agendar
                          </button>
                        </div>
                      </li>
                    ))}
                  </ul>
                </section>
              )
            })
          )}
        </div>

        <section aria-labelledby="servicios-cta" className="border-t border-white/10 py-20 text-center">
          <h2
            id="servicios-cta"
            className="mx-auto max-w-[20ch] text-[clamp(1.75rem,4vw,3rem)] font-semibold leading-tight tracking-[-0.03em]"
          >
            ¿Listo? <Light>Aparta tu lugar.</Light>
          </h2>
          <Link to={routes.book()} className={buttonClass({ variant: 'accent', size: 'lg', className: 'mt-8 px-10' })}>
            <CalendarCheck className="size-5" strokeWidth={1.75} aria-hidden /> Reservar cita
          </Link>
        </section>
      </main>
      <SiteFooter />
    </div>
  )
}
