import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { CalendarCheck, Camera, Clock, Plus } from 'lucide-react'
import hero640 from '@/assets/services/servicios-hero-640.webp'
import hero1280 from '@/assets/services/servicios-hero-1280.webp'
import interior from '@/assets/shop/interior.webp'
import sillones from '@/assets/shop/sillones.webp'
import techo from '@/assets/shop/techo.webp'
import { buttonClass } from '@/components/ui/buttonClass'
import { LoadingRegion, Skeleton } from '@/components/ui/Skeleton'
import { Alert } from '@/components/ui/Alert'
import { useCatalog } from '@/app/queries'
import { routes } from '@/app/routes'
import { useDocumentTitle } from '@/app/useDocumentTitle'
import { business } from '@/config/business'
import { serviceBadges } from '@/config/serviceBadges'
import { SiteNav } from '@/features/site/SiteNav'
import { SiteFooter } from '@/features/site/SiteFooter'
import { SkipLink } from '@/features/site/SkipLink'
import { MobileBookBar } from '@/features/site/MobileBookBar'
import { Reveal } from '@/features/site/Reveal'
import { DisplayHeading, Eyebrow, Light } from '@/features/site/Section'
import { useHashScroll } from '@/features/site/useHashScroll'
import { cn } from '@/lib/cn'
import { durationLabel, money } from '@/lib/time'

const shopPhotos = [
  {
    src: interior,
    width: 382,
    height: 510,
    alt: 'Interior de Havana Barbería: sillones de barbero dorados bajo luces hexagonales',
  },
  { src: sillones, width: 382, height: 510, alt: 'Fila de sillones de barbero negros y dorados' },
  { src: techo, width: 287, height: 510, alt: 'Luces hexagonales en el techo de la barbería' },
]

/**
 * /servicios — full-screen photo hero (nav starts transparent and floats on scroll),
 * a sticky glass pill of category filters under the nav, every service from the
 * catalog ("Agendar" preselects it in /reservar, as before) and real shop photos.
 */
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
      <SiteNav />
      <main id="contenido" tabIndex={-1} className="outline-none">
        <section
          id="servicios-hero"
          aria-labelledby="servicios-title"
          className="relative flex min-h-[100svh] flex-col justify-end overflow-hidden"
        >
          <img
            src={hero1280}
            srcSet={`${hero640} 640w, ${hero1280} 1280w`}
            sizes="100vw"
            alt=""
            width={1280}
            height={720}
            {...{ fetchpriority: 'high' }}
            decoding="async"
            className="absolute inset-0 h-full w-full object-cover object-[72%_center] md:object-center"
          />
          <div aria-hidden className="absolute inset-0 bg-[var(--hero-mask-base)]" />
          <div
            aria-hidden
            className="absolute inset-x-0 top-0 h-48 bg-gradient-to-b from-[var(--hero-mask-top)] to-transparent"
          />
          <div
            aria-hidden
            className="absolute inset-x-0 bottom-0 h-[62svh] bg-gradient-to-t from-[var(--hero-mask-bottom)] via-[var(--hero-mask-mid)] to-transparent md:h-[70svh]"
          />
          <div className="relative mx-auto grid w-full max-w-6xl justify-items-start gap-5 px-4 pb-10 md:px-8 md:pb-16">
            <Eyebrow className="hero-in">Servicios y precios</Eyebrow>
            <h1
              id="servicios-title"
              className="hero-in text-[clamp(2.25rem,8vw,5.25rem)] font-semibold leading-[1] tracking-[-0.04em]"
              style={{ ['--d' as string]: '80ms' }}
            >
              <span className="block">Todo lo que hacemos,</span> <Light>sin letras chiquitas.</Light>
            </h1>
            <p
              className="hero-in t-body-lg hidden max-w-[46ch] text-gray-200 md:block"
              style={{ ['--d' as string]: '160ms' }}
            >
              Precios en pesos mexicanos. Elige uno o varios servicios y aparta tu horario en menos de un minuto.
            </p>
            <div
              className="hero-in flex w-full flex-wrap items-center gap-x-7 gap-y-3"
              style={{ ['--d' as string]: '240ms' }}
            >
              <Link
                to={routes.book()}
                className={buttonClass({ variant: 'accent', size: 'lg', className: 'w-full sm:w-auto sm:px-8' })}
              >
                <CalendarCheck className="size-5" strokeWidth={1.75} aria-hidden /> Reservar cita
              </Link>
              <a
                href="#lista"
                className="hidden min-h-tap items-center rounded-sm text-base font-semibold text-white underline decoration-white/40 underline-offset-[6px] hover:decoration-aqua-400 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-aqua-400 sm:inline-flex"
              >
                Ver precios
              </a>
            </div>
          </div>
        </section>

        {/* Glass pill under the floating nav; the black fade behind both hides the list scrolling beneath. */}
        <nav
          aria-label="Categorías"
          id="lista"
          className="sticky top-0 z-[9] flex justify-center bg-gradient-to-b from-ink-950 from-70% to-transparent px-3 pb-6 pt-[86px] md:pt-[88px]"
        >
          <ul className="no-scrollbar flex max-w-full gap-1 overflow-x-auto rounded-full border border-glass-border bg-glass p-1 shadow-lg backdrop-blur-md">
            {[
              { id: null as string | null, name: 'Todos' },
              ...categories.map((c) => ({ id: c.id as string | null, name: c.name })),
            ].map((c) => (
              <li key={c.name} className="shrink-0">
                <button
                  type="button"
                  aria-pressed={category === c.id}
                  onClick={() => setCategory(c.id)}
                  className={cn(
                    'inline-flex min-h-tap items-center whitespace-nowrap rounded-full px-4 text-sm font-semibold transition-colors duration-fast focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-aqua-400',
                    category === c.id ? 'bg-white text-ink-950' : 'text-gray-300 hover:bg-white/10 hover:text-white',
                  )}
                >
                  {c.name}
                </button>
              </li>
            ))}
          </ul>
        </nav>

        <div className="mx-auto grid max-w-5xl gap-14 px-4 py-14 md:px-8">
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
                            className={buttonClass({
                              variant: 'secondary',
                              size: 'md',
                              className: 'border-white/70 text-white hover:border-white hover:bg-white/10',
                            })}
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

        <section aria-labelledby="lugar-title" className="border-t border-white/10 py-20 md:py-28">
          <div className="mx-auto grid max-w-5xl gap-10 px-4 md:px-8">
            <div className="flex flex-wrap items-end justify-between gap-6">
              <div className="grid gap-4">
                <Reveal>
                  <Eyebrow>El lugar</Eyebrow>
                </Reveal>
                <Reveal delay={80}>
                  <DisplayHeading id="lugar-title">
                    Un espacio hecho <Light>para el oficio.</Light>
                  </DisplayHeading>
                </Reveal>
              </div>
              {business.instagramUrl && (
                <a
                  href={business.instagramUrl}
                  target="_blank"
                  rel="noreferrer"
                  className={buttonClass({
                    variant: 'secondary',
                    className: 'border-white text-white hover:bg-white/10',
                  })}
                >
                  <Camera className="size-5" strokeWidth={1.75} aria-hidden /> Síguenos en Instagram
                </a>
              )}
            </div>
            <ul className="grid grid-cols-3 gap-3 md:gap-5" aria-label="Fotos del local">
              {shopPhotos.map((p, i) => (
                <Reveal as="li" key={p.src} delay={i * 90}>
                  <img
                    src={p.src}
                    alt={p.alt}
                    width={p.width}
                    height={p.height}
                    loading="lazy"
                    decoding="async"
                    className="aspect-[3/4] w-full rounded-lg object-cover"
                  />
                </Reveal>
              ))}
            </ul>
          </div>
        </section>

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
      <MobileBookBar watchId="servicios-hero" />
    </div>
  )
}
