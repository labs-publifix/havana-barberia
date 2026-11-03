import { Link } from 'react-router-dom'
import { ArrowRight } from 'lucide-react'
import { buttonClass } from '@/components/ui/buttonClass'
import { Skeleton } from '@/components/ui/Skeleton'
import { useCatalog } from '@/app/queries'
import { routes } from '@/app/routes'
import { business } from '@/config/business'
import { serviceBadges } from '@/config/serviceBadges'
import { DisplayHeading, Eyebrow, Light } from '@/features/site/Section'
import { Reveal } from '@/features/site/Reveal'
import { durationLabel, money } from '@/lib/time'
import { servicePhotos } from './media'

/** Home teaser: four signature services with photos. Name, duration and price come from the catalog. */
export function Treatments() {
  const { data } = useCatalog()
  const items = business.featuredServiceIds.map((id) => data?.services.find((s) => s.id === id))

  return (
    <section id="tratamientos" aria-labelledby="tratamientos-title" className="relative scroll-mt-24 py-24 md:py-32">
      <div className="mx-auto grid max-w-6xl gap-4 px-4 md:px-8">
        <Reveal>
          <Eyebrow index="02">Tratamientos</Eyebrow>
        </Reveal>
        <Reveal delay={80}>
          <DisplayHeading id="tratamientos-title">
            Del fade al ritual <Light>de toalla caliente.</Light>
          </DisplayHeading>
        </Reveal>
        <Reveal delay={140}>
          <p className="t-body-lg text-gray-300">Cuatro de nuestros servicios más pedidos.</p>
        </Reveal>
      </div>

      <ul
        className="no-scrollbar mx-auto mt-12 flex max-w-6xl snap-x snap-mandatory scroll-px-4 gap-4 overflow-x-auto px-4 pb-2 md:grid md:grid-cols-4 md:gap-5 md:overflow-visible md:px-8"
        aria-label="Tratamientos destacados"
      >
        {business.featuredServiceIds.map((id, i) => {
          const s = items[i]
          const photo = servicePhotos[id]
          const badge = serviceBadges[id]
          return (
            <Reveal as="li" key={id} delay={i * 90} className="w-[68%] shrink-0 snap-start sm:w-[44%] md:w-auto">
              {!s || !photo ? (
                <Skeleton className="aspect-[3/4] rounded-xl bg-white/[0.06]" />
              ) : (
                <Link
                  to={`${routes.services}#${s.id}`}
                  className="group relative block aspect-[3/4] overflow-hidden rounded-xl border border-white/10 bg-ink-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-aqua-400"
                >
                  <img
                    src={photo.src}
                    srcSet={photo.srcSet}
                    sizes="(min-width: 1152px) 360px, (min-width: 768px) 32vw, 90vw"
                    alt={photo.alt}
                    width={photo.width}
                    height={photo.height}
                    loading="lazy"
                    decoding="async"
                    className="absolute inset-0 h-full w-full object-cover transition-transform duration-slow ease-brand group-hover:scale-[1.04] motion-reduce:transition-none motion-reduce:group-hover:scale-100"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-ink-950 via-ink-950/40 to-transparent" />
                  {badge && (
                    <span className="absolute left-4 top-4 inline-flex h-7 items-center rounded-full bg-aqua-500 px-3 text-xs font-semibold text-ink-950">
                      {badge}
                    </span>
                  )}
                  <div className="absolute inset-x-0 bottom-0 grid gap-3 p-5">
                    <h3 className="text-[clamp(1.2rem,1.7vw,1.45rem)] font-semibold leading-tight tracking-[-0.02em] text-white">
                      <span className="hover-underline relative">{s.name}</span>
                    </h3>
                    <div className="flex items-end justify-between gap-3 border-t border-white/15 pt-3">
                      <p className="tabular text-[11px] font-semibold uppercase tracking-[0.2em] text-gray-300">
                        {durationLabel(s.durationMin)}
                      </p>
                      <p className="tabular text-[1.4rem] font-semibold leading-none tracking-[-0.02em] text-white">
                        {money(s.price)}
                      </p>
                    </div>
                  </div>
                </Link>
              )}
            </Reveal>
          )
        })}
      </ul>

      <Reveal className="mx-auto mt-10 flex max-w-6xl px-4 md:px-8">
        <Link
          to={routes.services}
          className={buttonClass({
            variant: 'secondary',
            size: 'lg',
            className: 'border-white text-white hover:bg-white/10',
          })}
        >
          Ver todos los servicios <ArrowRight className="size-5" strokeWidth={1.75} aria-hidden />
        </Link>
      </Reveal>
    </section>
  )
}
