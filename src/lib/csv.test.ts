import { describe, expect, it } from 'vitest'
import { toCsv } from './csv'

describe('toCsv', () => {
  it('adds the BOM and quotes values with commas, quotes or line breaks', () => {
    expect(toCsv([['Cliente', 'Total'], ['Ríos, Ana', 280], ['Dijo "hola"', 0]])).toBe(
      '﻿Cliente,Total\r\n"Ríos, Ana",280\r\n"Dijo ""hola""",0',
    )
  })
})
