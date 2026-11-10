import { buildFeed } from '../../supabase/functions/_shared/calendar'

const base = {
  id: 'a1',
  startsAt: '2026-11-12T22:00:00.000Z',
  endsAt: '2026-11-12T22:45:00.000Z',
  status: 'confirmed',
  customerName: 'Ana Ríos',
  customerPhone: '4421112233',
  staffName: 'Leonardo Gómez',
  services: ['Corte adulto', 'Barba'],
  totalPrice: 500,
  notes: 'Fade bajo; trae foto',
}

describe('subscribed calendar (.ics)', () => {
  const ics = buildFeed({
    name: 'Havana · Agenda',
    appointments: [base],
    showStaff: true,
    address: 'Prol. Av. Zaragoza 46, Las Plazas',
    panelUrl: 'https://havanabarberia.com/admin/agenda',
    now: new Date('2026-11-10T00:00:00Z'),
  })
  const unfolded = ics.replace(/\r\n /g, '')

  it('is a valid calendar with one event per appointment, in UTC', () => {
    expect(ics.startsWith('BEGIN:VCALENDAR\r\n')).toBe(true)
    expect(ics.endsWith('END:VCALENDAR\r\n')).toBe(true)
    expect(unfolded).toContain('UID:a1@havanabarberia.com')
    expect(unfolded).toContain('DTSTART:20261112T220000Z')
    expect(unfolded).toContain('DTEND:20261112T224500Z')
    expect(unfolded).toContain('X-WR-CALNAME:Havana · Agenda')
  })

  it('title and details for the barber: who, what, phone and notes', () => {
    expect(unfolded).toContain('SUMMARY:Leonardo: Ana Ríos · Corte adulto + Barba')
    expect(unfolded).toContain('Teléfono: 442 111 2233')
    expect(unfolded).toContain('Notas: Fade bajo\\; trae foto')
    expect(unfolded).toContain('LOCATION:Prol. Av. Zaragoza 46\\, Las Plazas')
  })

  it('folds long lines at 75 bytes', () => {
    for (const line of ics.split('\r\n')) expect(new TextEncoder().encode(line).length).toBeLessThanOrEqual(75)
  })

  it("a barber's own calendar leaves their name out of the title", () => {
    const own = buildFeed({
      name: 'Havana · Leonardo',
      appointments: [base],
      showStaff: false,
      address: '',
      panelUrl: '',
    })
    expect(own.replace(/\r\n /g, '')).toContain('SUMMARY:Ana Ríos · Corte adulto + Barba')
  })
})
