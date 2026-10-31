import { describe, expect, it } from 'vitest'
import { buildIcs } from './ics'

describe('buildIcs', () => {
  it('produces a valid UTC event with escaped text and CRLF lines', () => {
    const ics = buildIcs({
      uid: 'abc',
      startsAt: '2026-11-02T16:00:00.000Z',
      endsAt: '2026-11-02T17:00:00.000Z',
      title: 'Havana Barbería: corte, barba',
      location: 'Prol. Av. Zaragoza 46; Querétaro',
      description: 'Línea 1\nLínea 2',
      now: new Date('2026-11-01T00:00:00.000Z'),
    })
    expect(ics).toContain('DTSTART:20261102T160000Z')
    expect(ics).toContain('DTEND:20261102T170000Z')
    expect(ics).toContain('SUMMARY:Havana Barbería: corte\\, barba')
    expect(ics).toContain('LOCATION:Prol. Av. Zaragoza 46\\; Querétaro')
    expect(ics).toContain('DESCRIPTION:Línea 1\\nLínea 2')
    expect(ics.split('\r\n').every((l) => l.length <= 75)).toBe(true)
    expect(ics.startsWith('BEGIN:VCALENDAR\r\n')).toBe(true)
  })
})
