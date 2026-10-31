import { Link } from 'react-router-dom'
import { Compass } from 'lucide-react'
import { SimpleHeader } from '@/components/layout/SimpleHeader'
import { SiteFooter } from '@/components/layout/SiteFooter'
import { CenteredState } from '@/components/layout/CenteredState'
import { buttonClass } from '@/components/ui/buttonClass'
import { routes } from '@/app/routes'
import { useDocumentTitle } from '@/app/useDocumentTitle'

export default function NotFound() {
  useDocumentTitle('Página no encontrada', { noindex: true })
  return (
    <div className="flex min-h-dvh flex-col bg-page">
      <SimpleHeader />
      <main className="mx-auto w-full max-w-booking flex-1 px-4">
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
      <SiteFooter tone="light" />
    </div>
  )
}
