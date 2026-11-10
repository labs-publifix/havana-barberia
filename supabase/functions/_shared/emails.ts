// What each e-mail says. Pure functions (no Deno or network), tested with Vitest
// from src/test/emails.test.ts. Contact details mirror src/config/business.ts.

export type EmailKind =
  'confirmation' | 'reschedule' | 'cancellation' | 'reminder_24h' | 'reminder_2h' | 'team_new' | 'team_cancel'

export interface EmailFacts {
  kind: EmailKind
  customerName: string
  staffName: string
  services: string[]
  startsAt: string
  durationMin: number
  totalPrice: number
  timeZone: string
  toleranceMin: number
  changeCutoffMin: number
  /** Link to change or cancel; null while online booking is not open. */
  manageUrl: string | null
  /** The barber's notice links to the panel agenda. */
  panelUrl: string
}

export interface Email {
  subject: string
  html: string
  text: string
}

export const shop = {
  name: 'Havana Barbería',
  address: 'Prol. Av. Zaragoza 46, Las Plazas, 76180 Santiago de Querétaro, Qro.',
  phone: '442 537 7844',
  whatsapp: 'https://wa.me/524425377844',
  maps: `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(
    'Havana Barbería, Prol. Av. Zaragoza 46, Las Plazas, 76180 Santiago de Querétaro, Qro.',
  )}`,
}

export const isCustomerEmail = (k: EmailKind) => k !== 'team_new' && k !== 'team_cancel'

const esc = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)

const money = (n: number) => `$${n.toLocaleString('es-MX')}`

const hours = (min: number) => (min % 60 === 0 ? `${min / 60} h` : `${min} min`)

export function when(iso: string, timeZone: string): { day: string; time: string } {
  const d = new Date(iso)
  const day = new Intl.DateTimeFormat('es-MX', { timeZone, weekday: 'long', day: 'numeric', month: 'long' }).format(d)
  const time = new Intl.DateTimeFormat('es-MX', { timeZone, hour: 'numeric', minute: '2-digit', hour12: true })
    .format(d)
    .replace(/\s/g, ' ')
  return { day, time }
}

const firstName = (name: string) => name.trim().split(/\s+/)[0] ?? name

export function compose(f: EmailFacts): Email {
  const { day, time } = when(f.startsAt, f.timeZone)
  const name = firstName(f.customerName)
  const services = f.services.join(' + ')

  const head: Record<EmailKind, { subject: string; title: string; intro: string }> = {
    confirmation: {
      subject: `Tu cita está confirmada · ${day}, ${time}`,
      title: 'Tu cita está confirmada',
      intro: `Hola, ${name}. Te esperamos con ${f.staffName}.`,
    },
    reschedule: {
      subject: `Cambió tu cita · ${day}, ${time}`,
      title: 'Tu cita tiene nuevo horario',
      intro: `Hola, ${name}. Estos son los datos actualizados.`,
    },
    cancellation: {
      subject: `Tu cita se canceló · ${day}, ${time}`,
      title: 'Tu cita se canceló',
      intro: `Hola, ${name}. Cancelamos esta cita. Cuando quieras, agenda otra.`,
    },
    reminder_24h: {
      subject: `Te esperamos mañana · ${time}`,
      title: 'Te esperamos mañana',
      intro: `Hola, ${name}. Te recordamos tu cita con ${f.staffName}.`,
    },
    reminder_2h: {
      subject: `Tu cita es hoy a las ${time}`,
      title: 'Tu cita es en un rato',
      intro: `Hola, ${name}. Te esperamos hoy con ${f.staffName}.`,
    },
    team_new: {
      subject: `Nueva cita en línea · ${f.customerName} · ${day}, ${time}`,
      title: 'Nueva cita en línea',
      intro: `${f.customerName} agendó contigo.`,
    },
    team_cancel: {
      subject: `Cita cancelada · ${f.customerName} · ${day}, ${time}`,
      title: 'Se canceló una cita',
      intro: `${f.customerName} canceló su cita contigo.`,
    },
  }
  const h = head[f.kind]
  const customer = isCustomerEmail(f.kind)
  const cancelled = f.kind === 'cancellation' || f.kind === 'team_cancel'

  const rows: [string, string][] = [
    ['Cuándo', `${day}, ${time}`],
    ['Con', f.staffName],
    ['Servicios', `${services} · ${hours(f.durationMin)}`],
    ...(cancelled ? [] : ([['Total', `${money(f.totalPrice)} (pagas en la barbería)`]] as [string, string][])),
    ...(customer && !cancelled ? ([['Dónde', shop.address]] as [string, string][]) : []),
  ]

  const notes: string[] = []
  if (customer && !cancelled) {
    notes.push(`Llega a tiempo: tenemos ${f.toleranceMin} minutos de tolerancia.`)
    notes.push(
      f.manageUrl
        ? `Puedes cambiar o cancelar hasta ${hours(f.changeCutoffMin)} antes.`
        : `Para cambiar o cancelar, escríbenos o llámanos al ${shop.phone} (hasta ${hours(f.changeCutoffMin)} antes).`,
    )
  }
  if (customer && cancelled) notes.push(`¿Dudas? Escríbenos o llámanos al ${shop.phone}.`)

  const actions: [string, string][] = customer
    ? cancelled
      ? [['Escríbenos por WhatsApp', shop.whatsapp]]
      : [
          ...(f.manageUrl ? ([['Cambiar o cancelar', f.manageUrl]] as [string, string][]) : []),
          ['Cómo llegar', shop.maps],
        ]
    : [['Ver agenda', f.panelUrl]]

  const text = [
    h.title,
    '',
    h.intro,
    '',
    ...rows.map(([k, v]) => `${k}: ${v}`),
    ...(notes.length ? ['', ...notes] : []),
    '',
    ...actions.map(([k, v]) => `${k}: ${v}`),
    '',
    `${shop.name} · ${shop.address} · ${shop.phone}`,
  ].join('\n')

  const html = `<!doctype html>
<html lang="es-MX"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(h.title)}</title></head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:Helvetica,Arial,sans-serif;color:#0a0a0b">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;padding:24px 12px"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border-radius:16px;overflow:hidden">
<tr><td style="background:#0a0a0b;padding:20px 24px;color:#ffffff;font-size:15px;font-weight:700;letter-spacing:0.18em">HAVANA BARBERÍA</td></tr>
<tr><td style="padding:28px 24px 8px">
<h1 style="margin:0 0 8px;font-size:22px;line-height:1.3">${esc(h.title)}</h1>
<p style="margin:0 0 20px;font-size:16px;line-height:1.5;color:#3f3f46">${esc(h.intro)}</p>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-top:1px solid #e4e4e7">
${rows
  .map(
    ([k, v]) =>
      `<tr><td style="padding:12px 0;border-bottom:1px solid #e4e4e7;font-size:14px;color:#71717a;width:96px;vertical-align:top">${esc(k)}</td><td style="padding:12px 0;border-bottom:1px solid #e4e4e7;font-size:16px;${cancelled ? 'text-decoration:line-through;color:#71717a' : ''}">${esc(v)}</td></tr>`,
  )
  .join('\n')}
</table>
${notes.map((n) => `<p style="margin:16px 0 0;font-size:14px;line-height:1.5;color:#3f3f46">${esc(n)}</p>`).join('\n')}
</td></tr>
<tr><td style="padding:20px 24px 28px">
${actions
  .map(
    ([k, v], i) =>
      `<a href="${esc(v)}" style="display:inline-block;margin:0 8px 8px 0;padding:12px 20px;border-radius:999px;font-size:15px;font-weight:600;text-decoration:none;${i === 0 ? 'background:#0a0a0b;color:#ffffff' : 'border:1px solid #d4d4d8;color:#0a0a0b'}">${esc(k)}</a>`,
  )
  .join('\n')}
</td></tr>
<tr><td style="padding:16px 24px;background:#fafafa;font-size:12px;line-height:1.5;color:#71717a">${esc(shop.name)} · ${esc(shop.address)} · ${esc(shop.phone)}</td></tr>
</table>
</td></tr></table>
</body></html>`

  return { subject: h.subject, html, text }
}
