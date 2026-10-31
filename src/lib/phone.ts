/**
 * Mexican phone normalization to the national 10-digit format.
 * Accepts spaces, dashes, parentheses and +52 / 52 / 1 prefixes.
 */
export function normalizeMxPhone(input: string): string | null {
  let digits = input.replace(/\D/g, '')
  if (digits.length === 12 && digits.startsWith('52')) digits = digits.slice(2)
  else if (digits.length === 13 && digits.startsWith('521')) digits = digits.slice(3)
  return digits.length === 10 ? digits : null
}

/** "4425377844" -> "442 537 7844" */
export const formatMxPhone = (digits: string) =>
  digits.length === 10 ? `${digits.slice(0, 3)} ${digits.slice(3, 6)} ${digits.slice(6)}` : digits
