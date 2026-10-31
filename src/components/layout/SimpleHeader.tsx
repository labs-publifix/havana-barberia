import { Link } from 'react-router-dom'
import { ChevronLeft } from 'lucide-react'
import { Logo } from '@/components/Logo'
import { routes } from '@/app/routes'

/** Light header for secondary pages: optional back action + logo. */
export function SimpleHeader({ onBack, backLabel = 'Atrás' }: { onBack?: () => void; backLabel?: string }) {
  return (
    <header className="sticky top-0 z-sticky border-b border-line bg-page/95 backdrop-blur supports-[backdrop-filter]:bg-page/85">
      <div className="mx-auto flex h-16 max-w-booking items-center justify-between gap-3 px-4">
        {onBack ? (
          <button
            type="button"
            onClick={onBack}
            className="-ml-2 inline-flex h-tap items-center gap-1 rounded-full pl-1 pr-3 text-sm font-semibold hover:bg-fg/5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-focus"
          >
            <ChevronLeft className="size-5" strokeWidth={1.75} aria-hidden />
            {backLabel}
          </button>
        ) : (
          <span />
        )}
        <Link
          to={routes.home}
          aria-label="Havana Barbería, inicio"
          className="rounded-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-focus"
        >
          <Logo className="w-[92px]" />
        </Link>
      </div>
    </header>
  )
}
