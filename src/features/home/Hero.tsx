import { Link } from 'react-router-dom'
import { ArrowDown, CalendarCheck, Clock, MapPin, Phone, ShieldCheck, UserRound } from 'lucide-react'
import type { CSSProperties, ReactNode } from 'react'
import { buttonClass } from '@/components/ui/buttonClass'
import { routes } from '@/app/routes'
import { business } from '@/config/business'
import { GoogleRating } from '@/features/site/GoogleRating'
import { useOpenStatus } from '@/features/site/useOpenStatus'
import { QuickBookPanel } from './QuickBookPanel'

const delay = (ms: number) => ({ '--d': `${ms}ms` }) as CSSProperties

function Chip({ icon: Icon, children }: { icon: typeof Clock; children: ReactNode }) {
  return (
    <li className="inline-flex min-h-[36px] items-center gap-2 rounded-full border border-white/15 bg-white/[0.06] px-3.5 text-[13px] font-medium text-gray-200 backdrop-blur-sm">
      <Icon className="size-4 shrink-0 text-aqua-400" strokeWidth={1.75} aria-hidden />
      {children}
    </li>
  )
}

/** Full-height hero. The video and mask live in <HeroBackdrop>, fixed behind the page. */
export function Hero() {
  const status = useOpenStatus()
  const cutoffH = business.policy.changeCutoffMin / 60
  return (
    <section id="inicio" aria-labelledby="hero-title" className="relative flex min-h-[100svh] flex-col text-white">
      <div className="mx-auto grid w-full max-w-7xl flex-1 items-end gap-10 px-4 pb-10 pt-28 md:px-8 lg:grid-cols-[minmax(0,1fr)_380px] lg:items-center lg:pb-16 lg:pt-32">
        <div className="grid max-w-[44rem] justify-items-start gap-6">
          <p className="hero-in text-xs font-semibold uppercase tracking-[0.24em] text-gray-200" style={delay(0)}>
            Barbería profesional <span className="text-aqua-400">·</span> Querétaro
          </p>
          <h1
            id="hero-title"
            className="hero-in text-[clamp(2.75rem,8.5vw,6rem)] font-semibold leading-[0.98] tracking-[-0.04em]"
            style={delay(90)}
          >
            Donde el corte <span className="font-light italic tracking-[-0.03em] text-gray-200">se vuelve</span>{' '}
            <span className="text-aqua-400">oficio.</span>
          </h1>
          <p className="hero-in t-body-lg max-w-[38ch] text-gray-200" style={delay(180)}>
            Fades limpios, barbas al detalle y el ritual de la navaja caliente. Reserva en menos de un minuto y siéntate
            con quien sabe lo que hace.
          </p>
          <div className="hero-in grid w-full gap-3 sm:flex sm:w-auto" style={delay(260)}>
            <Link
              to={routes.book()}
              className={buttonClass({ variant: 'accent', size: 'lg', block: true, className: 'sm:w-auto' })}
            >
              <CalendarCheck className="size-5" strokeWidth={1.75} aria-hidden />
              Reservar cita
            </Link>
            <Link
              to={routes.services}
              className={buttonClass({
                variant: 'secondary',
                size: 'lg',
                block: true,
                className: 'border-white text-white hover:bg-white/10 sm:w-auto',
              })}
            >
              Ver servicios
            </Link>
          </div>
          <div className="hero-in" style={delay(320)}>
            <GoogleRating />
          </div>
          <ul className="hero-in flex flex-wrap gap-2" style={delay(380)} aria-label="Por qué reservar aquí">
            <Chip icon={Clock}>
              <span className="tabular">{status.chip}</span>
            </Chip>
            <Chip icon={UserRound}>Reserva sin cuenta</Chip>
            <Chip icon={ShieldCheck}>Cancelación gratis hasta {cutoffH} h antes</Chip>
          </ul>
        </div>

        <div className="hero-in hidden lg:block" style={delay(300)}>
          <QuickBookPanel />
        </div>
      </div>

      <div className="mx-auto flex w-full max-w-7xl items-center justify-between gap-4 border-t border-white/10 px-4 py-4 text-[13px] text-gray-300 md:px-8">
        <div className="flex flex-wrap items-center gap-x-6 gap-y-1">
          <span className="inline-flex items-center gap-2">
            <MapPin className="size-4 text-gray-400" strokeWidth={1.75} aria-hidden />
            {business.addressLines[0]}
          </span>
          <a
            href={business.phoneHref}
            className="tabular inline-flex min-h-tap items-center gap-2 rounded-sm hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-aqua-400"
          >
            <Phone className="size-4 text-gray-400" strokeWidth={1.75} aria-hidden />
            {business.phoneDisplay}
          </a>
        </div>
        <a
          href="#resenas"
          className="hidden min-h-tap items-center gap-2 rounded-full text-xs uppercase tracking-[0.2em] text-gray-300 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-aqua-400 sm:inline-flex"
        >
          Descubre
          <ArrowDown className="size-4 motion-safe:animate-bounce" strokeWidth={1.75} aria-hidden />
        </a>
      </div>
    </section>
  )
}
