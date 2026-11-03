/**
 * Google reviews shown on the home marquee.
 *
 * BLOCKING TODO(reviews): the client has not delivered real Google reviews yet.
 * Everything below is a PLACEHOLDER, clearly marked, never shown as a real
 * customer's words. Replace with real reviews (text + first name as published
 * on Google) and set `isPlaceholder: false`.
 */
export interface Review {
  id: string
  author: string
  text: string
  /** Stars as published on Google (1–5). */
  rating: 1 | 2 | 3 | 4 | 5
  isPlaceholder: boolean
}

const placeholder = (n: number): Review => ({
  id: `placeholder-${n}`,
  author: `Ejemplo ${n}`,
  text: 'Reseña de ejemplo: reemplazar por reseña real de Google. Este texto solo marca el lugar y el largo aproximado de una reseña.',
  rating: 5,
  isPlaceholder: true,
})

export const reviews: Review[] = Array.from({ length: 8 }, (_, i) => placeholder(i + 1))
