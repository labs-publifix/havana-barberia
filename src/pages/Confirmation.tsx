import { Link, useParams } from 'react-router-dom'
import { CalendarPlus, Check, MessageCircle, Navigation, SearchX } from 'lucide-react'
import { SimpleHeader } from '@/components/layout/SimpleHeader'
import { SiteFooter } from '@/components/layout/SiteFooter'
import { CenteredState } from '@/components/layout/CenteredState'
import { LoyaltyCard } from '@/components/booking/LoyaltyCard'
import { Alert } from '@/components/ui/Alert'
import { Button } from '@/components/ui/Button'
import { buttonClass } from '@/components/ui/buttonClass'
import { LoadingRegion, Skeleton } from '@/components/ui/Skeleton'
import { AppointmentSummary } from '@/features/appointment/AppointmentSummary'
import { addToCalendar } from '@/features/appointment/calendar'
import { useAppointment, useCatalog, useLoyalty, useStaff } from '@/app/queries'
import { routes } from '@/app/routes'
import { business } from '@/config/business'

export default function Confirmation() {
  const { token } = useParams()
  const appt = useAppointment(token)
  const catalog = useCatalog()
  const staff = useStaff()
  const loyalty = useLoyalty(appt.data?.loyaltyToken)

  const loading = appt.isPending || catalog.isPending || staff.isPending
  const a = appt.data

  return (
    <div className="min-h-dvh bg-page">
      <SimpleHeader />
      <main className="mx-auto grid max-w-booking gap-6 px-4 pb-12 pt-6">
        {loading ? (
          <LoadingRegion label="Cargando tu cita…">
            <div className="grid gap-4">
              <Skeleton className="size-14 rounded-full" />
              <Skeleton className="h-9 w-3/4" />
              <Skeleton className="h-64 rounded-lg" />
            </div>
          </LoadingRegion>
        ) : !a ? (
          <CenteredState
            icon={SearchX}
            title="No encontramos esta cita"
            actions={
              <Link to={routes.book()} className={buttonClass({ size: 'lg', block: true })}>
                Reservar una cita
              </Link>
            }
          >
            Revisa que el enlace esté completo. Si necesitas ayuda, llámanos al {business.phoneDisplay}.
          </CenteredState>
        ) : (
          <>
            <div className="grid justify-items-start gap-4 motion-safe:animate-[rise_320ms_cubic-bezier(.2,.8,.2,1)]">
              <span className="grid size-14 place-items-center rounded-full bg-ink-950 text-aqua-500 shadow-glow">
                <Check className="size-7" strokeWidth={2.5} aria-hidden />
              </span>
              <div className="grid gap-2">
                <h1 className="t-h1">¡Listo! Tu cita está agendada</h1>
                <p className="text-fg-muted">
                  Te esperamos, {a.customer.name.split(' ')[0]}. Guarda esta página para consultar o cambiar tu cita.
                </p>
              </div>
            </div>

            <AppointmentSummary
              appointment={a}
              services={catalog.data?.services ?? []}
              staff={staff.data?.find((s) => s.id === a.staffId)}
            />

            <div className="grid gap-3">
              <Button variant="primary" size="lg" block onClick={() => addToCalendar(a, catalog.data?.services ?? [])}>
                <CalendarPlus className="size-5" strokeWidth={1.75} aria-hidden />
                Agregar al calendario
              </Button>
              <a
                href={business.directionsHref}
                target="_blank"
                rel="noreferrer"
                className={buttonClass({ variant: 'secondary', size: 'lg', block: true })}
              >
                <Navigation className="size-5" strokeWidth={1.75} aria-hidden />
                Cómo llegar
              </a>
            </div>

            <Alert tone="info" title="¿Cambio de planes?">
              Puedes cancelar o reprogramar hasta {business.policy.changeCutoffMin / 60} horas antes.{' '}
              <Link to={routes.manage(a.token)} className="font-semibold underline underline-offset-4">
                Cancelar o reprogramar
              </Link>
            </Alert>

            {loyalty.data && (
              <div className="grid gap-3">
                <LoyaltyCard card={loyalty.data} />
                <p className="text-sm text-fg-muted">
                  Ganas tu sello cuando completes esta cita, no al reservar.{' '}
                  <Link
                    to={routes.loyalty(loyalty.data.token)}
                    className="font-semibold text-fg-accent underline underline-offset-4"
                  >
                    Ver mi tarjeta
                  </Link>
                </p>
              </div>
            )}

            <a
              href={business.whatsappHref}
              target="_blank"
              rel="noreferrer"
              className={buttonClass({ variant: 'ghost', className: 'justify-self-start' })}
            >
              <MessageCircle className="size-5" strokeWidth={1.75} aria-hidden />
              ¿Dudas? Escríbenos por WhatsApp
            </a>
          </>
        )}
      </main>
      <SiteFooter tone="light" />
    </div>
  )
}
