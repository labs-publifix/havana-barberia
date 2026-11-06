/**
 * Pure product numbers (no React). Amounts are whole MXN pesos; cost and
 * commission may be missing (null) until the owner captures them.
 */

export interface Margin {
  /** Price minus cost minus commission (missing parts count as 0). */
  amount: number
  /** Share of the price, rounded; null when the price is 0. */
  pct: number | null
  /** Both cost and commission are captured, so the margin is real. */
  complete: boolean
}

export function productMargin(p: { price: number; cost: number | null; commission: number | null }): Margin {
  const amount = p.price - (p.cost ?? 0) - (p.commission ?? 0)
  return {
    amount,
    pct: p.price > 0 ? Math.round((amount / p.price) * 100) : null,
    complete: p.cost !== null && p.commission !== null,
  }
}

/**
 * Read an amount the way people type it: "$1,250", " 240 " → number; "" → null
 * (not captured). Returns NaN for anything that is not a whole number of pesos.
 */
export function parseMoney(text: string): number | null {
  const clean = text.replace(/[$,\s]/g, '')
  if (clean === '') return null
  return /^\d+$/.test(clean) ? Number(clean) : NaN
}
