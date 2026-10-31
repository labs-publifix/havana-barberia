import { Star } from 'lucide-react'
import type { LoyaltyCard as Card } from '@/domain/types'
import { cn } from '@/lib/cn'
import { formatDateLong, localDate } from '@/lib/time'
import { businessHours } from '@/config/business'

/** Dark 10-stamp card from the design tokens: earned = aqua, pending = dashed, reward = star. */
export function LoyaltyCard({ card, className }: { card: Card; className?: string }) {
  const remaining = Math.max(card.goal - card.stamps, 0)
  const full = remaining === 0
  return (
    <section
      aria-label="Tarjeta de lealtad"
      className={cn('rounded-xl border border-ink-700 bg-ink-950 p-5 text-white shadow-lg sm:p-6', className)}
    >
      <p className="t-overline text-gray-400">Tarjeta de lealtad · {card.goal} sellos</p>
      <h3 className="t-h3 mt-1">{full ? '¡Tu corte gratis está listo!' : 'Tu corte gratis'}</h3>
      <p className="tabular mt-1 text-sm text-gray-300">
        {card.stamps} de {card.goal} sellos
        {full ? '' : ` · te faltan ${remaining} ${remaining === 1 ? 'visita' : 'visitas'}`}
      </p>
      <ol className="mt-5 grid grid-cols-5 gap-2.5 sm:gap-3" aria-label={`${card.stamps} de ${card.goal} sellos`}>
        {Array.from({ length: card.goal }, (_, i) => {
          const n = i + 1
          const earned = n <= card.stamps
          const reward = n === card.goal
          return (
            <li
              key={n}
              aria-label={
                reward ? (earned ? 'Premio ganado' : 'Premio') : earned ? `Sello ${n} ganado` : `Sello ${n} pendiente`
              }
              className={cn(
                'tabular grid aspect-square place-items-center rounded-full text-sm font-semibold',
                earned
                  ? 'bg-aqua-500 text-ink-950'
                  : reward
                    ? 'border-[1.5px] border-aqua-500 text-aqua-500'
                    : 'border-[1.5px] border-dashed border-ink-600 text-gray-400',
              )}
            >
              {reward ? <Star className="size-4" fill="currentColor" strokeWidth={1.75} aria-hidden /> : n}
            </li>
          )
        })}
      </ol>
      {full && card.rewardExpiresAt ? (
        <p className="mt-4 text-sm text-aqua-300">
          Canjéalo antes del {formatDateLong(localDate(card.rewardExpiresAt, businessHours.timeZone))}.
        </p>
      ) : null}
    </section>
  )
}
