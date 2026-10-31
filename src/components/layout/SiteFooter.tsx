import { Link } from 'react-router-dom'
import { routes } from '@/app/routes'
import { business } from '@/config/business'
import { cn } from '@/lib/cn'

export function SiteFooter({ tone = 'dark' }: { tone?: 'dark' | 'light' }) {
  const dark = tone === 'dark'
  const link = cn(
    'inline-flex min-h-tap items-center underline-offset-4 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-focus',
    dark ? 'text-gray-300' : 'text-fg-muted',
  )
  return (
    <footer
      className={cn(
        'border-t',
        dark ? 'border-ink-700 bg-ink-950 text-gray-400' : 'border-line bg-surface text-fg-muted',
      )}
    >
      <div className="t-caption mx-auto grid max-w-5xl gap-2 px-4 py-8 md:flex md:items-center md:justify-between md:px-6">
        <p>
          © {new Date().getFullYear()} {business.name} · {business.addressLines[1]}
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
    </footer>
  )
}
