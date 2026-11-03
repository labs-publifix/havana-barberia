import { useState, type CSSProperties } from 'react'
import { Pause, Play } from 'lucide-react'
import { reviews, type Review } from '@/config/reviews'
import { business } from '@/config/business'
import { useReducedMotion } from '@/lib/hooks/useMediaQuery'
import { Stars } from '@/features/site/GoogleRating'
import { DisplayHeading, Eyebrow, Light } from '@/features/site/Section'
import { Reveal } from '@/features/site/Reveal'

function GoogleG() {
  return (
    <svg viewBox="0 0 48 48" className="size-5" role="img" aria-label="Google">
      <path
        fill="#EA4335"
        d="M24 9.5c3.5 0 6.6 1.2 9.1 3.6l6.8-6.8C35.8 2.4 30.3 0 24 0 14.6 0 6.6 5.4 2.7 13.3l7.9 6.1C12.5 13.6 17.8 9.5 24 9.5z"
      />
      <path
        fill="#4285F4"
        d="M46.1 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.4c-.5 2.9-2.2 5.3-4.6 6.9l7.3 5.7c4.3-3.9 7-9.8 7-17.1z"
      />
      <path
        fill="#FBBC05"
        d="M10.6 28.6c-.5-1.4-.8-3-.8-4.6s.3-3.2.8-4.6l-7.9-6.1C1 16.6 0 20.2 0 24s1 7.4 2.7 10.7l7.9-6.1z"
      />
      <path
        fill="#34A853"
        d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.3-5.7c-2.2 1.5-5 2.3-8.6 2.3-6.2 0-11.5-4.1-13.4-9.9l-7.9 6.1C6.6 42.6 14.6 48 24 48z"
      />
    </svg>
  )
}

export function ReviewCard({ review }: { review: Review }) {
  return (
    <figure className="flex h-full w-[280px] shrink-0 flex-col rounded-lg bg-white p-5 text-left shadow-md">
      <Stars />
      <blockquote
        className="mt-3 line-clamp-5 flex-1 text-[15px] leading-[1.5] text-ink-700 [mask-image:linear-gradient(180deg,#000_70%,transparent)]"
        lang="es-MX"
      >
        {review.text}
      </blockquote>
      <figcaption className="mt-4 flex items-center gap-3 border-t border-gray-200 pt-4">
        <span
          aria-hidden
          className="grid size-9 shrink-0 place-items-center rounded-full bg-ink-950 text-sm font-semibold text-white"
        >
          {review.author.charAt(0)}
        </span>
        <span className="min-w-0 flex-1 truncate text-sm font-semibold text-ink-950">
          {review.author}
          {review.isPlaceholder && <span className="ml-2 text-xs font-normal text-gray-500">(marcador)</span>}
        </span>
        <GoogleG />
      </figcaption>
    </figure>
  )
}

function Row({
  items,
  direction,
  seconds,
  paused,
}: {
  items: Review[]
  direction: 'left' | 'right'
  seconds: number
  paused: boolean
}) {
  return (
    <div className="marquee overflow-hidden py-2" data-paused={paused}>
      <ul
        className="marquee__track flex w-max gap-5"
        style={
          {
            '--marquee-name': direction === 'left' ? 'marquee-left' : 'marquee-right',
            '--marquee-duration': `${seconds}s`,
          } as CSSProperties
        }
      >
        {/* Content duplicated for a seamless loop; the copy is hidden from assistive tech. */}
        {[...items, ...items].map((r, i) => (
          <li key={`${r.id}-${i}`} aria-hidden={i >= items.length || undefined}>
            <ReviewCard review={r} />
          </li>
        ))}
      </ul>
    </div>
  )
}

/**
 * Two-row marquee (left at ~60 s, right at ~70 s). Pauses on hover, on focus and
 * with the visible button. With prefers-reduced-motion it becomes a manually
 * scrollable list.
 */
export function ReviewsMarquee() {
  const reduced = useReducedMotion()
  const [paused, setPaused] = useState(false)
  const half = Math.ceil(reviews.length / 2)
  const top = reviews.slice(0, half)
  const bottom = reviews.slice(half)

  if (reduced) {
    return (
      <ul
        data-testid="reviews-list"
        className="flex snap-x gap-5 overflow-x-auto px-4 pb-4 md:px-8"
        aria-label="Reseñas"
      >
        {reviews.map((r) => (
          <li key={r.id} className="snap-start">
            <ReviewCard review={r} />
          </li>
        ))}
      </ul>
    )
  }

  return (
    <div data-testid="reviews-marquee" className="grid gap-4">
      <Row items={top} direction="left" seconds={60} paused={paused} />
      <Row items={bottom} direction="right" seconds={70} paused={paused} />
      <div className="mx-auto flex w-full max-w-6xl justify-end px-4 md:px-8">
        <button
          type="button"
          onClick={() => setPaused((p) => !p)}
          aria-pressed={paused}
          className="inline-flex min-h-tap items-center gap-2 rounded-full border border-white/20 px-4 text-sm text-gray-200 hover:bg-white/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-aqua-400"
        >
          {paused ? <Play className="size-4" aria-hidden /> : <Pause className="size-4" aria-hidden />}
          {paused ? 'Reanudar reseñas' : 'Pausar reseñas'}
        </button>
      </div>
    </div>
  )
}

export function Reviews() {
  const { value, count } = business.rating
  return (
    <section id="resenas" aria-labelledby="resenas-title" className="relative scroll-mt-24 py-24 md:py-32">
      <div className="mx-auto grid max-w-6xl gap-4 px-4 md:px-8">
        <Reveal>
          <Eyebrow index="01">Lo que dice Querétaro</Eyebrow>
        </Reveal>
        <Reveal delay={80}>
          <DisplayHeading id="resenas-title">
            <span className="tabular">{value.toFixed(1)}</span> en Google, <Light>{count} reseñas</Light>
          </DisplayHeading>
        </Reveal>
        <Reveal delay={140}>
          <p className="text-sm font-semibold uppercase tracking-[0.3em] text-gray-300">
            <span className="tabular">{value.toFixed(1)}</span> <span className="text-google-star">★</span> en Google
          </p>
        </Reveal>
      </div>
      <Reveal delay={200} className="mt-12">
        <ReviewsMarquee />
      </Reveal>
    </section>
  )
}
