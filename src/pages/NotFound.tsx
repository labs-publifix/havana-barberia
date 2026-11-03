import { Link } from 'react-router-dom'
import { Compass } from 'lucide-react'
import { SiteNav } from '@/features/site/SiteNav'
import { SiteFooter } from '@/features/site/SiteFooter'
import { SkipLink } from '@/features/site/SkipLink'
import { CenteredState } from '@/components/layout/CenteredState'
import { buttonClass } from '@/components/ui/buttonClass'
import { routes } from '@/app/routes'
import { useDocumentTitle } from '@/app/useDocumentTitle'

export default function NotFound() {
  useDocumentTitle('Página no encontrada', { noindex: true })
  return (
    <div data-theme="dark" className="flex min-h-dvh flex-col bg-page text-fg">
      <SkipLink />
      <SiteNav startFloating />
      <main id="contenido" tabIndex={-1} className="mx-auto w-full max-w-booking flex-1 px-4 pt-24 outline-none">
        <CenteredState
          icon={Compass}
          title="Esta página no existe"
          actions={
            <>
              <Link to={routes.book()} className={buttonClass({ size: 'lg', block: true })}>
                Reservar cita
              </Link>
              <Link to={routes.home} className={buttonClass({ variant: 'ghost', size: 'lg', block: true })}>
                Ir al inicio
              </Link>
            </>
          }
        >
          Puede que el enlace esté incompleto o que la página haya cambiado. Tu reserva está a un toque.
        </CenteredState>
      </main>
      <SiteFooter />
    </div>
  )
}
