import { useNavigate, Link } from 'react-router-dom'
import { CalendarCheck, MapPin, Navigation, Phone, Star } from 'lucide-react'
import heroUrl from '@/assets/images/hero.jpg'
import local1 from '@/assets/images/local-1.jpg'
import local2 from '@/assets/images/local-2.jpg'
import team1 from '@/assets/images/team-1.jpg'
import team2 from '@/assets/images/team-2.jpg'
import { Logo } from '@/components/Logo'
import { Badge } from '@/components/ui/Badge'
import { buttonClass } from '@/components/ui/buttonClass'
import { Alert } from '@/components/ui/Alert'
import { Skeleton, LoadingRegion } from '@/components/ui/Skeleton'
import { ServiceCard } from '@/components/booking/ServiceCard'
import { SiteFooter } from '@/components/layout/SiteFooter'
import { useCatalog } from '@/app/queries'
import { useNow } from '@/app/useNow'
import { routes } from '@/app/routes'
import { business } from '@/config/business'
import { cn } from '@/lib/cn'
import { formatDay, formatTime12, localDate, openState, weekdayOf } from '@/lib/time'

const WEEK = [1, 2, 3, 4, 5, 6, 0]
const DAY_NAMES = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado']

const photos = [
  {
    src: local1,
    w: 382,
    h: 510,
    alt: 'Interior de Havana Barbería con sillones de barbero dorados y luces hexagonales',
  },
  { src: team1, w: 340, h: 510, alt: 'Barbero haciendo un corte de cabello a un cliente' },
  { src: team2, w: 382, h: 510, alt: 'Barbero perfilando la barba de un cliente' },
  { src: local2, w: 287, h: 510, alt: 'Luces hexagonales en el techo de la barbería' },
]

function OpenBadge() {
  const now = useNow()
  const s = openState(business.hours, now)
  if (s.open) return <Badge tone="accent">Abierto ahora · cierra a las {formatTime12(s.closesAt!)}</Badge>
  if (!s.next) return <Badge tone="onDark">Cerrado</Badge>
  const when = s.next.isToday ? '' : s.next.isTomorrow ? 'mañana ' : `el ${formatDay(s.next.date, 'EEEE')} `
  return (
    <Badge tone="onDark">
      Cerrado · abre {when}a las {formatTime12(s.next.time)}
    </Badge>
  )
}

function Rating() {
  return (
    <a
      href={business.reviewsHref}
      target="_blank"
      rel="noreferrer"
      className="inline-flex min-h-tap items-center gap-1.5 rounded-full text-sm text-gray-300 underline-offset-4 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-focus"
    >
      <Star className="size-4 text-aqua-500" fill="currentColor" strokeWidth={1.5} aria-hidden />
      <span className="tabular font-semibold text-white">{business.rating.value.toFixed(1)}</span>
      <span className="tabular">({business.rating.count} reseñas en Google)</span>
    </a>
  )
}

function Hero() {
  return (
    <section className="mx-auto grid max-w-5xl gap-6 px-4 pb-12 pt-4 md:grid-cols-[1fr_auto] md:items-center md:gap-12 md:px-6 md:pb-20 md:pt-10">
      {/* Photo is 382×510: never rendered wider than that. */}
      <div className="relative mx-auto w-full max-w-[382px] overflow-hidden rounded-xl md:order-2 md:w-[382px]">
        <img
          src={heroUrl}
          alt="Interior de Havana Barbería: sillones de barbero dorados bajo luces hexagonales"
          width={382}
          height={510}
          {...{ fetchpriority: 'high' }}
          decoding="async"
          className="aspect-[4/3] w-full object-cover md:aspect-[382/510]"
        />
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-1 bg-gradient-to-r from-aqua-700 via-aqua-400 to-aqua-500" />
      </div>
      <div className="grid justify-items-start gap-5">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <OpenBadge />
        </div>
        <div className="grid gap-3">
          <h1 className="t-display">Reserva tu cita</h1>
          <p className="t-body-lg max-w-[34ch] text-gray-300">
            {business.tagline}. Elige servicio, barbero y horario en menos de un minuto.
          </p>
        </div>
        <Rating />
        <div className="grid w-full gap-3 sm:flex sm:w-auto">
          <Link
            to={routes.book()}
            className={buttonClass({ variant: 'accent', size: 'lg', block: true, className: 'sm:w-auto' })}
          >
            <CalendarCheck className="size-5" strokeWidth={1.75} aria-hidden />
            Reservar cita
          </Link>
          <a
            href="#servicios"
            className={buttonClass({ variant: 'secondary', size: 'lg', block: true, className: 'sm:w-auto' })}
          >
            Ver servicios
          </a>
        </div>
      </div>
    </section>
  )
}

function Services() {
  const { data, isPending, isError, refetch } = useCatalog()
  const navigate = useNavigate()
  return (
    <section
      id="servicios"
      aria-labelledby="servicios-title"
      className="scroll-mt-20 border-t border-ink-800 bg-ink-900"
    >
      <div className="mx-auto grid max-w-5xl gap-8 px-4 py-12 md:px-6 md:py-16">
        <div className="grid gap-2">
          <h2 id="servicios-title" className="t-h2">
            Servicios
          </h2>
          <p className="text-gray-300">Precios en pesos mexicanos. Puedes elegir más de uno en tu reserva.</p>
        </div>
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
            <div className="grid gap-3 md:grid-cols-2">
              {Array.from({ length: 6 }, (_, i) => (
                <Skeleton key={i} className="h-[132px] rounded-lg bg-white/[0.06]" />
              ))}
            </div>
          </LoadingRegion>
        ) : (
          data.categories.map((cat) => {
            const items = data.services.filter((s) => s.categoryId === cat.id)
            if (items.length === 0) return null
            return (
              <div key={cat.id} className="grid gap-3">
                <h3 className="t-overline text-aqua-400">{cat.name}</h3>
                <div className="grid gap-3 md:grid-cols-2">
                  {items.map((s) => (
                    <ServiceCard
                      key={s.id}
                      service={s}
                      tone="dark"
                      selected={false}
                      onToggle={() => navigate(routes.book(s.id))}
                    />
                  ))}
                </div>
              </div>
            )
          })
        )}
      </div>
    </section>
  )
}

function About() {
  const today = weekdayOf(localDate(new Date(), business.hours.timeZone))
  const link =
    'inline-flex min-h-tap items-center gap-2 underline-offset-4 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-focus rounded-sm'
  return (
    <section aria-labelledby="nosotros-title" className="border-t border-ink-800">
      <div className="mx-auto grid max-w-5xl gap-10 px-4 py-12 md:px-6 md:py-16">
        <div className="grid gap-2">
          <h2 id="nosotros-title" className="t-h2">
            Nosotros
          </h2>
          <p className="max-w-[60ch] text-gray-300">
            Una barbería profesional en Las Plazas, Querétaro: cortes, barba y cuidado facial con calma y atención al
            detalle.
          </p>
        </div>

        <ul className="grid grid-cols-2 gap-3 md:grid-cols-4" aria-label="Fotos de la barbería">
          {photos.map((p) => (
            <li key={p.src} className="overflow-hidden rounded-lg bg-ink-800">
              <img
                src={p.src}
                alt={p.alt}
                width={p.w}
                height={p.h}
                loading="lazy"
                decoding="async"
                className="aspect-[3/4] w-full object-cover"
              />
            </li>
          ))}
        </ul>

        <div className="grid gap-10 md:grid-cols-2">
          <div className="grid content-start gap-4">
            <h3 className="t-h3">Horario</h3>
            <table className="w-full text-left">
              <caption className="sr-only">Horario de atención por día</caption>
              <tbody>
                {WEEK.map((wd) => {
                  const ranges = business.hours.weekly[wd] ?? []
                  const isToday = wd === today
                  return (
                    <tr key={wd} className={cn('border-b border-ink-800', isToday && 'text-white')}>
                      <th scope="row" className={cn('py-3 font-normal', isToday ? 'font-semibold' : 'text-gray-300')}>
                        {DAY_NAMES[wd]}
                        {isToday && <span className="ml-2 text-xs font-semibold text-aqua-400">Hoy</span>}
                      </th>
                      <td className={cn('tabular py-3 text-right', isToday ? 'font-semibold' : 'text-gray-300')}>
                        {ranges.length === 0
                          ? 'Cerrado'
                          : ranges.map((r) => `${formatTime12(r.start)} – ${formatTime12(r.end)}`).join(', ')}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          <div className="grid content-start gap-4">
            <h3 className="t-h3">Visítanos</h3>
            <address className="grid gap-1 not-italic text-gray-300">
              <span className="flex items-start gap-2">
                <MapPin className="mt-0.5 size-5 shrink-0 text-aqua-400" strokeWidth={1.75} aria-hidden />
                <span>
                  {business.addressLines[0]}
                  <br />
                  {business.addressLines[1]}
                </span>
              </span>
            </address>
            <div className="flex flex-wrap gap-3">
              <a
                href={business.directionsHref}
                target="_blank"
                rel="noreferrer"
                className={buttonClass({ variant: 'secondary' })}
              >
                <Navigation className="size-5" strokeWidth={1.75} aria-hidden />
                Cómo llegar
              </a>
              <a href={business.phoneHref} className={buttonClass({ variant: 'ghost' })}>
                <Phone className="size-5" strokeWidth={1.75} aria-hidden />
                <span className="tabular">{business.phoneDisplay}</span>
              </a>
            </div>
            <a href={business.reviewsHref} target="_blank" rel="noreferrer" className={cn(link, 'text-gray-300')}>
              <Star className="size-4 text-aqua-500" fill="currentColor" strokeWidth={1.5} aria-hidden />
              Lee las {business.rating.count} reseñas en Google
            </a>
          </div>
        </div>
      </div>
    </section>
  )
}

export default function Home() {
  return (
    <div data-theme="dark" className="min-h-dvh bg-page text-fg">
      <header className="sticky top-0 z-sticky border-b border-ink-800 bg-ink-950/90 backdrop-blur supports-[backdrop-filter]:bg-ink-950/75">
        <div className="mx-auto flex h-16 max-w-5xl items-center justify-between gap-4 px-4 md:px-6">
          <Link
            to={routes.home}
            aria-label="Havana Barbería, inicio"
            className="rounded-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-focus"
          >
            <Logo tone="onDark" className="w-[84px]" />
          </Link>
          <Link to={routes.book()} className={buttonClass({ variant: 'secondary', size: 'sm' })}>
            Reservar
          </Link>
        </div>
      </header>
      <main>
        <Hero />
        <Services />
        <About />
      </main>
      <SiteFooter />
    </div>
  )
}
