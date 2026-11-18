import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { createSeed } from '@/data/mock/seed'
import type { Appointment } from '@/domain/types'
import { zonedInstant } from '@/lib/time'
import { TICKET_WIDTH_MM, ticketFromAppointment, ticketPdf, ticketTotals } from './ticket'

const seed = createSeed(zonedInstant('2026-11-01', '09:00', 'America/Mexico_City'))
const at = '2026-11-02T18:00:00.000Z'
const appt = {
  id: 'appt-abc123xyz',
  customer: { name: 'Ana Ríos', phone: '', email: '' },
  serviceIds: ['corte-adulto', 'bigote'],
  payment: { method: 'card', amount: 150, tip: 50, tipMethod: 'cash', paidAt: at, rewardServiceId: 'corte-adulto' },
} as unknown as Appointment

describe('ticket', () => {
  it('lists the services, the free cut and the tip', () => {
    const t = ticketFromAppointment(appt, seed.services, 'Isaac Fuentes', { stamps: 0, goal: 10 })
    expect(t.folio).toBe('BC123XYZ')
    expect(t.items.map((i) => i.price)).toEqual([280, 150])
    expect(t.discounts).toEqual([{ label: 'Corte gratis (lealtad)', amount: 280 }])
    expect(ticketTotals(t)).toEqual({ subtotal: 430, charged: 150, total: 200 })
  })

  it('builds a 50 mm PDF for the 58 mm thermal printer, with the logo', async () => {
    const logo = new Uint8Array(readFileSync(resolve(__dirname, '../assets/brand/logo-ticket.png')))
    const t = ticketFromAppointment(appt, seed.services, 'Isaac Fuentes', { stamps: 3, goal: 10 })
    const doc = await ticketPdf(t, { logo })
    expect(Math.round(doc.internal.pageSize.getWidth())).toBe(TICKET_WIDTH_MM)
    expect(TICKET_WIDTH_MM).toBe(50)
    // As tall as the content: a short ticket stays well under the 33 cm test page.
    expect(doc.internal.pageSize.getHeight()).toBeLessThan(200)
    expect(doc.output('arraybuffer').byteLength).toBeGreaterThan(5000)
  })

  it('still builds without the logo (shop name instead)', async () => {
    const doc = await ticketPdf(ticketFromAppointment(appt, seed.services), { logo: null })
    expect(Math.round(doc.internal.pageSize.getWidth())).toBe(50)
  })
})
