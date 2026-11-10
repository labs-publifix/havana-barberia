import { Link } from 'react-router-dom'
import { Logo } from '@/components/Logo'
import { routes } from '@/app/routes'
import { business } from '@/config/business'
import { formatTime12 } from '@/lib/time'
import { NAV_SECTIONS } from './nav'
import { useBusinessHours } from '@/app/queries'

const DAY = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb']
const link =
  'inline-flex min-h-tap items-center rounded-sm text-gray-300 underline-offset-4 hover:text-white hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-aqua-400'

/** Dark footer of the public site (home, /servicios, legal, 404). */
export function SiteFooter() {
  const shop = useBusinessHours()
  const hours = [1, 2, 3, 4, 5, 6, 0].map((wd) => {
    const r = shop.weekly[wd] ?? []
    return {
      wd,
      text: r.length ? r.map((x) => `${formatTime12(x.start)} – ${formatTime12(x.end)}`).join(', ') : 'Cerrado',
    }
  })
  return (
    <footer className="border-t border-white/10 bg-ink-950 pb-24 text-sm text-gray-300 lg:pb-0">
      <div className="mx-auto grid max-w-6xl gap-10 px-4 py-16 sm:grid-cols-2 md:px-8 lg:grid-cols-[1.2fr_1fr_1fr_1.3fr]">
        <div className="grid content-start gap-4">
          <Logo variant="white" className="w-[132px]" />
          <p className="max-w-[28ch] text-gray-400">{business.tagline}.</p>
        </div>
        <nav aria-label="Pie de página" className="grid content-start">
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.2em] text-gray-400">Explora</p>
          {NAV_SECTIONS.map((s) => (
            <Link key={s.id} to={{ pathname: '/', hash: `#${s.id}` }} className={link}>
              {s.label}
            </Link>
          ))}
          <Link to={routes.services} className={link}>
            Todos los servicios
          </Link>
        </nav>
        <div className="grid content-start">
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.2em] text-gray-400">Contacto</p>
          <a href={business.phoneHref} className={`${link} tabular`}>
            {business.phoneDisplay}
          </a>
          <a href={business.directionsHref} target="_blank" rel="noreferrer" className={link}>
            Cómo llegar
          </a>
          {business.instagramUrl && (
            <a href={business.instagramUrl} target="_blank" rel="noreferrer" className={link}>
              Instagram
            </a>
          )}
          <address className="mt-2 not-italic leading-relaxed text-gray-400">
            {business.addressLines[0]}
            <br />
            {business.addressLines[1]}
          </address>
        </div>
        <div className="grid content-start">
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.2em] text-gray-400">Horario</p>
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5">
            {hours.map((h) => (
              <div key={h.wd} className="contents">
                <dt className="text-gray-400">{DAY[h.wd]}</dt>
                <dd className="tabular whitespace-nowrap">{h.text}</dd>
              </div>
            ))}
          </dl>
        </div>
      </div>
      <div className="border-t border-white/10">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-5 text-[13px] text-gray-400 md:px-8">
          <p>
            © {new Date().getFullYear()} {business.name}
          </p>
          <nav aria-label="Legal" className="flex gap-5">
            <Link to={routes.policies} className={link}>
              Políticas de reserva
            </Link>
            <Link to={routes.privacy} className={link}>
              Aviso de privacidad
            </Link>
          </nav>
        </div>
      </div>
    </footer>
  )
}
