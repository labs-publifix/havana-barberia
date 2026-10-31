import { Link, useParams } from 'react-router-dom'
import { useDocumentTitle } from '@/app/useDocumentTitle'
import { Gift, SearchX } from 'lucide-react'
import { SimpleHeader } from '@/components/layout/SimpleHeader'
import { SiteFooter } from '@/components/layout/SiteFooter'
import { CenteredState } from '@/components/layout/CenteredState'
import { LoyaltyCard } from '@/components/booking/LoyaltyCard'
import { buttonClass } from '@/components/ui/buttonClass'
import { LoadingRegion, Skeleton } from '@/components/ui/Skeleton'
import { useLoyalty } from '@/app/queries'
import { routes } from '@/app/routes'
import { business } from '@/config/business'

export default function Loyalty() {
  const { token } = useParams()
  useDocumentTitle('Tarjeta de lealtad', { noindex: true })
  const { data: card, isPending } = useLoyalty(token)
  const { loyaltyGoal, rewardValidityDays } = business.policy

  return (
    <div className="min-h-dvh bg-page">
      <SimpleHeader />
      <main className="mx-auto grid max-w-booking gap-6 px-4 pb-12 pt-6">
        {isPending ? (
          <LoadingRegion label="Cargando tu tarjeta…">
            <Skeleton className="h-9 w-2/3" />
            <Skeleton className="mt-4 h-72 rounded-xl" />
          </LoadingRegion>
        ) : !card ? (
          <CenteredState
            icon={SearchX}
            title="No encontramos esta tarjeta"
            actions={
              <Link to={routes.book()} className={buttonClass({ size: 'lg', block: true })}>
                Reservar una cita
              </Link>
            }
          >
            Revisa que el enlace esté completo. Tu tarjeta se crea con tu primera reserva.
          </CenteredState>
        ) : (
          <>
            <div className="grid gap-2">
              <h1 className="t-h1">Hola, {card.customerFirstName}</h1>
              <p className="text-fg-muted">
                {card.stamps >= card.goal
                  ? 'Completaste tu tarjeta. Tu próximo corte va por nuestra cuenta.'
                  : `Llevas ${card.stamps} de ${card.goal} sellos. Sigue así.`}
              </p>
            </div>

            <div>
              <div
                className="mb-3 h-2 overflow-hidden rounded-full bg-gray-200"
                role="progressbar"
                aria-label="Progreso de tu tarjeta"
                aria-valuemin={0}
                aria-valuemax={card.goal}
                aria-valuenow={card.stamps}
              >
                <div
                  className="h-full rounded-full bg-gradient-to-r from-aqua-700 via-aqua-400 to-aqua-500 transition-[width] duration-slow"
                  style={{ width: `${Math.min(100, (card.stamps / card.goal) * 100)}%` }}
                />
              </div>
              <LoyaltyCard card={card} />
            </div>

            <section
              aria-labelledby="como-funciona"
              className="grid gap-3 rounded-lg border border-line bg-surface p-5"
            >
              <h2 id="como-funciona" className="t-h4 flex items-center gap-2">
                <Gift className="size-5 text-fg-accent" strokeWidth={1.75} aria-hidden />
                Cómo funciona
              </h2>
              <ul className="grid list-disc gap-2 pl-5 text-sm leading-[1.5] text-fg-muted marker:text-fg-accent">
                <li>Ganas un sello cada vez que completas una cita de corte (no al reservar).</li>
                <li>Usa el mismo teléfono o correo al reservar para que se sumen.</li>
                <li>
                  Con {loyaltyGoal} sellos, tu siguiente corte es gratis. El premio vale {rewardValidityDays} días a
                  partir de que lo ganas.
                </li>
              </ul>
            </section>

            <Link to={routes.book()} className={buttonClass({ size: 'lg', block: true })}>
              Reservar mi próxima cita
            </Link>
          </>
        )}
      </main>
      <SiteFooter tone="light" />
    </div>
  )
}
