import { describe, expect, it } from 'vitest'
import { formatMxPhone, normalizeMxPhone } from './phone'

describe('normalizeMxPhone', () => {
  it.each([
    ['442 123 4567', '4421234567'],
    ['(442) 123-4567', '4421234567'],
    ['+52 442 123 4567', '4421234567'],
    ['52 4421234567', '4421234567'],
    ['+521 442 123 4567', '4421234567'],
  ])('%s -> %s', (input, out) => expect(normalizeMxPhone(input)).toBe(out))

  it.each(['', '12345', '442 123 456', '442 123 45678'])('rejects %s', (input) =>
    expect(normalizeMxPhone(input)).toBeNull(),
  )

  it('formats for display', () => expect(formatMxPhone('4421234567')).toBe('442 123 4567'))
})
