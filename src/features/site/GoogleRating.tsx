import { Star } from 'lucide-react'
import { business } from '@/config/business'

/** Google rating badge (static data from configuration). Stars use Google's yellow, not the Havana accent. */
export function GoogleRating() {
  return (
    <a
      href={business.reviewsHref}
      target="_blank"
      rel="noreferrer"
      className="inline-flex min-h-tap items-center gap-1.5 rounded-full text-sm text-gray-200 underline-offset-4 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-aqua-400"
    >
      <Star className="size-4 text-google-star" fill="currentColor" strokeWidth={1.5} aria-hidden />
      <span className="tabular font-semibold text-white">{business.rating.value.toFixed(1)}</span>
      <span className="tabular">({business.rating.count} reseñas en Google)</span>
    </a>
  )
}

export function Stars({ className = 'size-4' }: { className?: string }) {
  return (
    <span className="flex gap-0.5 text-google-star" role="img" aria-label="5 de 5 estrellas">
      {Array.from({ length: 5 }, (_, i) => (
        <Star key={i} className={className} fill="currentColor" strokeWidth={1.5} aria-hidden />
      ))}
    </span>
  )
}
