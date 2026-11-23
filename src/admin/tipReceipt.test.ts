import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { tipFolio, tipReceiptPdf } from './tipReceipt'
import type { TipPayout } from './tips'

const payout: TipPayout = {
  id: 'p1',
  folio: 7,
  staffId: 'isaac',
  staffName: 'Isaac Fuentes',
  date: '2026-11-21',
  paidAt: '2026-11-22T02:30:00.000Z',
  gross: 175,
  fee: 5,
  amount: 170,
  byMethod: { cash: 50, card: 125, transfer: 0 },
  firstDate: '2026-11-20',
  lastDate: '2026-11-21',
  lines: [
    { appointmentId: 'a1', date: '2026-11-20', customer: 'Ana', method: 'cash', tip: 50, fee: 0, amount: 50 },
    { appointmentId: 'a2', date: '2026-11-21', customer: 'Luis', method: 'card', tip: 100, fee: 5, amount: 95 },
    { appointmentId: 'a3', date: '2026-11-21', customer: 'Beto', method: 'card', tip: 25, fee: 0, amount: 25 },
  ],
  paidBy: 'Leo',
}

describe('tip receipt', () => {
  it('prints two 50 mm copies (barber and shop) to sign', async () => {
    const logo = new Uint8Array(readFileSync(resolve(__dirname, '../assets/brand/logo-ticket.png')))
    const doc = await tipReceiptPdf(payout, { logo })
    expect(doc.getNumberOfPages()).toBe(2)
    expect(Math.round(doc.internal.pageSize.getWidth())).toBe(50)
    expect(tipFolio(7)).toBe('P-00007')
  })
})
