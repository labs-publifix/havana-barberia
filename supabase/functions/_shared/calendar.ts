// The subscribed calendar (.ics) a phone reads. Pure; tested with Vitest from
// src/test/calendar-feed.test.ts.

export interface FeedAppointment {
  id: string
  startsAt: string
  endsAt: string
  status: string
  customerName: string
  customerPhone: string
  staffName: string
  services: string[]
  totalPrice: number
  notes: string
}

const stamp = (iso: string) =>
  new Date(iso)
    .toISOString()
    .replace(/[-:]/g, '')
    .replace(/\.\d{3}/, '')
const esc = (s: string) =>
  s
    .replace(/\\/g, '\\\\')
    .replace(/\r?\n/g, '\\n')
    .replace(/([,;])/g, '\\$1')

/** RFC 5545 folding: lines of at most 75 octets, continued with a space. */
function fold(line: string): string {
  const bytes = new TextEncoder()
  const out: string[] = []
  let cur = ''
  for (const ch of line) {
    const limit = out.length ? 74 : 75
    if (bytes.encode(cur + ch).length > limit) {
      out.push(cur)
      cur = ch
    } else cur += ch
  }
  out.push(cur)
  return out.join('\r\n ')
}

const phoneLabel = (p: string) => (p.length === 10 ? `${p.slice(0, 3)} ${p.slice(3, 6)} ${p.slice(6)}` : p)

export function buildFeed(opts: {
  name: string
  appointments: FeedAppointment[]
  /** Whole-shop calendar: the barber goes in the title. */
  showStaff: boolean
  address: string
  panelUrl: string
  now?: Date
}): string {
  const now = stamp((opts.now ?? new Date()).toISOString())
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Havana Barberia//Agenda//ES',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${esc(opts.name)}`,
    'X-WR-TIMEZONE:America/Mexico_City',
    // Hints for how often to check again (iPhone and Outlook read them).
    'REFRESH-INTERVAL;VALUE=DURATION:PT15M',
    'X-PUBLISHED-TTL:PT15M',
  ]
  for (const a of opts.appointments) {
    const services = a.services.join(' + ')
    const who = a.customerName || 'Cliente'
    const title = `${opts.showStaff ? `${a.staffName.split(' ')[0]}: ` : ''}${who} · ${services}`
    const description = [
      `Cliente: ${who}`,
      a.customerPhone ? `Teléfono: ${phoneLabel(a.customerPhone)}` : '',
      `Barbero: ${a.staffName}`,
      `Servicios: ${services}`,
      `Total: $${a.totalPrice.toLocaleString('es-MX')}`,
      a.notes ? `Notas: ${a.notes}` : '',
      a.status === 'completed' ? 'Cobrada' : '',
      opts.panelUrl ? `Agenda: ${opts.panelUrl}` : '',
    ]
      .filter(Boolean)
      .join('\n')
    lines.push(
      'BEGIN:VEVENT',
      `UID:${a.id}@havanabarberia.com`,
      `DTSTAMP:${now}`,
      `DTSTART:${stamp(a.startsAt)}`,
      `DTEND:${stamp(a.endsAt)}`,
      `SUMMARY:${esc(title)}`,
      ...(opts.address ? [`LOCATION:${esc(opts.address)}`] : []),
      `DESCRIPTION:${esc(description)}`,
      'STATUS:CONFIRMED',
      'TRANSP:OPAQUE',
      'END:VEVENT',
    )
  }
  lines.push('END:VCALENDAR')
  return lines.map(fold).join('\r\n') + '\r\n'
}
