import { describe, expect, it } from 'vitest'
import { createSeed } from '@/data/mock/seed'
import type { Appointment } from '@/domain/types'
import { zonedInstant } from '@/lib/time'
import { ticketFromAppointment, ticketPdf, ticketTotals } from './ticket'

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
    expect(t.discount).toEqual({ label: 'Corte gratis (lealtad)', amount: 280 })
    expect(ticketTotals(t)).toEqual({ subtotal: 430, charged: 150, total: 200 })
  })

  it('builds an 80 mm PDF', async () => {
    const doc = await ticketPdf(ticketFromAppointment(appt, seed.services, 'Isaac Fuentes'))
    expect(Math.round(doc.internal.pageSize.getWidth())).toBe(80)
    expect(doc.output('arraybuffer').byteLength).toBeGreaterThan(1000)
  })
})
