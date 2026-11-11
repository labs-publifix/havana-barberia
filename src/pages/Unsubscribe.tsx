import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { BellOff, CircleAlert } from 'lucide-react'
import { SiteNav } from '@/features/site/SiteNav'
import { SiteFooter } from '@/features/site/SiteFooter'
import { SkipLink } from '@/features/site/SkipLink'
import { CenteredState } from '@/components/layout/CenteredState'
import { buttonClass } from '@/components/ui/buttonClass'
import { routes } from '@/app/routes'
import { useDocumentTitle } from '@/app/useDocumentTitle'
import { useRepository } from '@/app/RepositoryContext'

/**
 * "Darme de baja": the link at the bottom of the invitations to come back. It
 * stops those invitations only; appointment e-mails keep coming.
 */
export default function Unsubscribe() {
  useDocumentTitle('Invitaciones', { noindex: true })
  const { token = '' } = useParams()
  const repo = useRepository()
  const [state, setState] = useState<{ status: 'working' | 'done' | 'invalid'; name?: string }>({ status: 'working' })

  useEffect(() => {
    let alive = true
    repo
      .unsubscribe(token)
      .then((name) => alive && setState(name === null ? { status: 'invalid' } : { status: 'done', name }))
      .catch(() => alive && setState({ status: 'invalid' }))
    return () => {
      alive = false
    }
  }, [repo, token])

  return (
    <div data-theme="dark" className="flex min-h-dvh flex-col bg-page text-fg">
      <SkipLink />
      <SiteNav startFloating />
      <main id="contenido" tabIndex={-1} className="mx-auto w-full max-w-booking flex-1 px-4 pt-24 outline-none">
        {state.status === 'working' ? (
          <p className="py-24 text-center text-fg-muted" role="status">
            Un momento…
          </p>
        ) : state.status === 'done' ? (
          <CenteredState
            icon={BellOff}
            title={state.name ? `Listo, ${state.name}` : 'Listo'}
            actions={
              <Link to={routes.book()} className={buttonClass({ size: 'lg', block: true })}>
                Reservar cita
              </Link>
            }
          >
            Ya no te enviaremos invitaciones. Seguirás recibiendo los correos de tus citas: confirmación, recordatorios y tu
            ticket.
          </CenteredState>
        ) : (
          <CenteredState
            icon={CircleAlert}
            title="No encontramos este enlace"
            actions={
              <Link to={routes.home} className={buttonClass({ variant: 'ghost', size: 'lg', block: true })}>
                Ir al inicio
              </Link>
            }
          >
            Puede que esté incompleto. Si quieres dejar de recibir invitaciones, escríbenos por WhatsApp.
          </CenteredState>
        )}
      </main>
      <SiteFooter />
    </div>
  )
}
