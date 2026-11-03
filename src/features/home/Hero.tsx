import { Link } from 'react-router-dom'
import { CalendarCheck } from 'lucide-react'
import type { CSSProperties } from 'react'
import { buttonClass } from '@/components/ui/buttonClass'
import { useCatalog } from '@/app/queries'
import { routes } from '@/app/routes'
import { business } from '@/config/business'
import { Stars } from '@/features/site/GoogleRating'
import { useOpenStatus } from '@/features/site/useOpenStatus'
import { money } from '@/lib/time'
import { HeroBarberPicker } from './HeroBarberPicker'

const delay = (ms: number) => ({ '--d': `${ms}ms` }) as CSSProperties

/** "Corte $280 · Corte y barba $500 · Abre hoy a las 10:00" — prices from the catalog, status from the hours. */
function InfoLine() {
  const { data } = useCatalog()
  const status = useOpenStatus()
  const prices = business.heroPrices.map((p) => ({
    ...p,
    price: data?.services.find((s) => s.id === p.serviceId)?.price,
  }))
  return (
    <p className="grid gap-1 text-[15px] text-gray-200 sm:flex sm:flex-wrap sm:items-center sm:gap-x-2.5 md:text-base">
      <span className="flex flex-wrap items-center gap-x-2.5">
        {prices.map((p, i) => (
          <span key={p.serviceId} className="whitespace-nowrap">
            {i > 0 && (
              <span className="mr-2.5 text-gray-400" aria-hidden>
                ·
              </span>
            )}
            {p.label}{' '}
            <span className="tabular font-semibold text-white">{p.price === undefined ? '—' : money(p.price)}</span>
          </span>
        ))}
      </span>
      <span className="whitespace-nowrap">
        <span className="mr-2.5 hidden text-gray-400 sm:inline" aria-hidden>
          ·
        </span>
        <span className="tabular">{status.chip}</span>
      </span>
    </p>
  )
}

/**
 * Full-height hero. Video and mask live in <HeroBackdrop> (fixed behind the page).
 * Content sits at the bottom so the video leads; one filled accent button only.
 */
export function Hero() {
  const { value, count } = business.rating
  return (
    <section
      id="inicio"
      aria-labelledby="hero-title"
      className="relative flex min-h-[100svh] flex-col justify-end text-white"
    >
      <div className="mx-auto grid w-full max-w-7xl gap-10 px-4 pb-8 pt-32 md:px-8 md:pb-14 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end lg:gap-12 lg:pb-16">
        <div className="grid max-w-[46rem] justify-items-start gap-4 md:gap-6">
          <a
            href={business.reviewsHref}
            target="_blank"
            rel="noreferrer"
            className="hero-in inline-flex min-h-tap items-center gap-2.5 rounded-full text-[13px] text-white underline-offset-4 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-aqua-400 md:text-sm"
            style={delay(0)}
          >
            <Stars />
            <span>
              <span className="tabular font-semibold text-white">{value.toFixed(1)}</span> ·{' '}
              <span className="tabular">{count}</span> reseñas en Google
            </span>
          </a>
          <h1
            id="hero-title"
            className="hero-in text-[clamp(2.25rem,9.2vw,5.75rem)] font-semibold leading-[1] tracking-[-0.04em]"
            style={delay(90)}
          >
            <span className="block whitespace-nowrap">Donde el corte</span>{' '}
            <span className="block whitespace-nowrap font-light italic tracking-[-0.03em]">se vuelve oficio.</span>
          </h1>
          {/* Phones: only rating, headline and the CTA, so the video leads. */}
          <div className="hero-in hidden md:block" style={delay(170)}>
            <InfoLine />
          </div>
          <div className="hero-in flex w-full flex-wrap items-center gap-x-7 gap-y-3" style={delay(240)}>
            <Link
              to={routes.book()}
              className={buttonClass({ variant: 'accent', size: 'lg', className: 'w-full sm:w-auto sm:px-8' })}
            >
              <CalendarCheck className="size-5" strokeWidth={1.75} aria-hidden />
              Reservar cita
            </Link>
            <Link
              to={routes.services}
              className="hidden min-h-tap items-center rounded-sm text-base font-semibold text-white underline decoration-white/40 underline-offset-[6px] transition-colors hover:decoration-aqua-400 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-aqua-400 md:inline-flex"
            >
              Ver servicios
            </Link>
          </div>
        </div>

        {/* Below 1024px the picker moves right under the hero (see Home). */}
        <div className="hero-in hidden lg:block" style={delay(320)}>
          <HeroBarberPicker />
        </div>
      </div>
    </section>
  )
}
