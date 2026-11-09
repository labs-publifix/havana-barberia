import { Link } from 'react-router-dom'
import { CalendarClock } from 'lucide-react'
import { SiteNav } from '@/features/site/SiteNav'
import { SiteFooter } from '@/features/site/SiteFooter'
import { SkipLink } from '@/features/site/SkipLink'
import { CenteredState } from '@/components/layout/CenteredState'
import { buttonClass } from '@/components/ui/buttonClass'
import { business } from '@/config/business'
import { routes } from '@/app/routes'
import { useDocumentTitle } from '@/app/useDocumentTitle'

/** Shown instead of the booking flow until online booking opens on the real system. */
export default function BookingSoon() {
  useDocumentTitle('Reserva en línea', { noindex: true })
  return (
    <div data-theme="dark" className="flex min-h-dvh flex-col bg-page text-fg">
      <SkipLink />
      <SiteNav startFloating />
      <main id="contenido" tabIndex={-1} className="mx-auto w-full max-w-booking flex-1 px-4 pt-24 outline-none">
        <CenteredState
          icon={CalendarClock}
          title="La reserva en línea abre muy pronto"
          actions={
            <>
              <a href={business.whatsappHref} className={buttonClass({ size: 'lg', block: true })}>
                Escríbenos por WhatsApp
              </a>
              <a href={business.phoneHref} className={buttonClass({ variant: 'secondary', size: 'lg', block: true })}>
                Llamar al {business.phoneDisplay}
              </a>
              <Link to={routes.home} className={buttonClass({ variant: 'ghost', size: 'lg', block: true })}>
                Ir al inicio
              </Link>
            </>
          }
        >
          Mientras tanto, agenda tu cita por WhatsApp o por teléfono.
        </CenteredState>
      </main>
      <SiteFooter />
    </div>
  )
}
