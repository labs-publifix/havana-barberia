import { describe, expect, it } from 'vitest'
import type { Appointment, Customer } from '@/domain/types'
import type { CustomerSummary } from './model'
import { leftToday, whatsappText, whatsappUrl, winbackRows, type InviteState } from './winback'

const now = new Date('2026-12-15T18:00:00Z')
const daysAgo = (n: number) => new Date(now.getTime() - n * 86400000).toISOString()

const summary = (
  id: string,
  extra: Partial<CustomerSummary> = {},
  customer: Partial<Customer> = {},
): CustomerSummary => ({
  customer: {
    id,
    name: `Cliente ${id}`,
    phone: '4421112233',
    email: `${id}@x.test`,
    createdAt: daysAgo(300),
    ...customer,
  },
  visits: 2,
  noShows: 0,
  recentNoShows: 0,
  cancellations: 0,
  lastVisit: daysAgo(50),
  nextAppointment: null,
  totalSpent: 0,
  loyalty: null,
  favoriteStaffId: 'leonardo',
  ...extra,
})

const state: InviteState = { last: {}, sentToday: 0, dailyLimit: 30, days: 40 }

describe('Por recuperar', () => {
  it('customers away more than the configured days, without an upcoming appointment', () => {
    const rows = winbackRows(
      [
        summary('lejos'),
        summary('reciente', { lastVisit: daysAgo(10) }),
        summary('con-cita', { nextAppointment: { id: 'a' } as Appointment }),
        summary('baja', {}, { marketingOptOut: true }),
        summary('nunca', { visits: 0, lastVisit: null }),
      ],
      state,
      'winback',
      now,
    )
    expect(rows.map((r) => r.summary.customer.id)).toEqual(['lejos'])
    expect(rows[0]).toMatchObject({ daysAway: 50, canEmail: true, canWhatsapp: true, waitDays: 0 })
    // Changing the setting changes the list.
    expect(winbackRows([summary('lejos')], { ...state, days: 60 }, 'winback', now)).toHaveLength(0)
  })

  it('imported customers without a visit in the new system go in their own list', () => {
    const rows = winbackRows(
      [
        summary('imp', { visits: 0, lastVisit: null }, { notes: 'Importado de AgendaPro' }),
        summary('imp-vino', { visits: 1 }, { notes: 'Importado de AgendaPro' }),
        summary('nuevo', { visits: 0, lastVisit: null }),
      ],
      state,
      'new_system',
      now,
    )
    expect(rows.map((r) => r.summary.customer.id)).toEqual(['imp'])
  })

  it('once every 30 days per customer, by e-mail or WhatsApp; no e-mail means WhatsApp only', () => {
    const rows = winbackRows(
      [summary('invitado'), summary('sin-correo', {}, { email: '' })],
      { ...state, last: { invitado: { at: daysAgo(12), channel: 'whatsapp', kind: 'winback' } } },
      'winback',
      now,
    )
    const invited = rows.find((r) => r.summary.customer.id === 'invitado')!
    expect(invited).toMatchObject({ waitDays: 18, canEmail: false })
    expect(rows.find((r) => r.summary.customer.id === 'sin-correo')).toMatchObject({
      canEmail: false,
      canWhatsapp: true,
    })
  })

  it('most valuable first: more visits, then closer to the free cut', () => {
    const rows = winbackRows(
      [
        summary('una', { visits: 1 }),
        summary('cerca', { visits: 4, loyalty: { stamps: 9, goal: 10 } as CustomerSummary['loyalty'] }),
        summary('lejos', { visits: 4, loyalty: { stamps: 2, goal: 10 } as CustomerSummary['loyalty'] }),
      ],
      state,
      'winback',
      now,
    )
    expect(rows.map((r) => r.summary.customer.id)).toEqual(['cerca', 'lejos', 'una'])
  })

  it('daily e-mail quota', () => {
    expect(leftToday({ ...state, sentToday: 28 })).toBe(2)
    expect(leftToday({ ...state, sentToday: 40 })).toBe(0)
  })

  it('WhatsApp message with weeks away, stamps and the booking link with the barber', () => {
    const [row] = winbackRows(
      [summary('ana', { loyalty: { stamps: 3, goal: 10 } as CustomerSummary['loyalty'] }, { name: 'Ana Ríos' })],
      state,
      'winback',
      now,
    )
    const text = whatsappText(row!, 'winback', {
      site: 'https://havanabarberia.com',
      barberName: 'Leonardo',
      barberId: 'leonardo',
    })
    expect(text).toBe(
      'Hola Ana, te saluda Havana Barbería. Ya pasaron 7 semanas desde tu último corte con Leonardo. ' +
        'Llevas 3 de 10 sellos para tu corte gratis. ¿Te apartamos tu lugar? Agenda aquí: https://havanabarberia.com/reservar?barbero=leonardo',
    )
    expect(whatsappUrl('442 111 2233', 'Hola')).toBe('https://wa.me/524421112233?text=Hola')
  })
})
