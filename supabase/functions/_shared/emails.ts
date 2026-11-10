// What each e-mail says and how it looks. Pure functions (no Deno or network),
// tested with Vitest from src/test/emails.test.ts. Contact details mirror
// src/config/business.ts; colors are tokens v2 (docs/design/havana-tokens-v2.css):
// black base, white type, aqua only on the one main button.

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
  /** Where the site's public files live (the logo is `${assetBase}/email/logo-white.png`). */
  assetBase: string
}

export interface Email {
  subject: string
  html: string
  text: string
}

/** The site's public files today; it changes with the domain at launch. */
export const DEFAULT_SITE = 'https://havanabarberia.com'

export const shop = {
  name: 'Havana Barbería',
  address: 'Prol. Av. Zaragoza 46, Las Plazas, 76180 Santiago de Querétaro, Qro.',
  phone: '442 537 7844',
  phoneHref: 'tel:+524425377844',
  whatsapp: 'https://wa.me/524425377844',
  instagram: 'https://www.instagram.com/havana.barberia/',
  maps: `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(
    'Havana Barbería, Prol. Av. Zaragoza 46, Las Plazas, 76180 Santiago de Querétaro, Qro.',
  )}`,
}

/** Tokens v2 (e-mail clients need literal colors). */
export const c = {
  page: '#0A0A0B', // ink-950
  card: '#121214', // ink-900
  raised: '#1B1B1F', // ink-800
  line: '#2A2A30', // ink-700
  lineStrong: '#3C3C44', // ink-600
  text: '#FFFFFF',
  muted: '#C6C6CE', // gray-300
  subtle: '#9A9AA5', // gray-400
  accent: '#14DDB6', // aqua-500: only the main button, on dark
}

const FONT = "'Geist','Geist Sans',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif"

export const isCustomerEmail = (k: EmailKind) => k !== 'team_new' && k !== 'team_cancel'

const esc = (s: string) =>
  s.replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]!)

const money = (n: number) => `$${n.toLocaleString('es-MX')}`

/** Non-breaking spaces keep "1 h" and the phone number on one line. */
const nb = (s: string) => s.replace(/ /g, '\u00a0')
const hours = (min: number) => nb(min % 60 === 0 ? `${min / 60} h` : `${min} min`)
const phone = nb('442 537 7844')

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

export function when(iso: string, timeZone: string): { day: string; time: string } {
  const d = new Date(iso)
  const day = new Intl.DateTimeFormat('es-MX', { timeZone, weekday: 'long', day: 'numeric', month: 'long' }).format(d)
  const time = new Intl.DateTimeFormat('es-MX', { timeZone, hour: 'numeric', minute: '2-digit', hour12: true })
    .format(d)
    .replace(/\s/g, ' ')
  return { day, time }
}

const firstName = (name: string) => name.trim().split(/\s+/)[0] ?? name

// ── Shared frame ────────────────────────────────────────────────────────────
export interface Frame {
  assetBase: string
  /** Inbox preview line (hidden in the body). */
  preheader: string
  eyebrow?: string
  title: string
  intro: string
  /** Trusted HTML between the intro and the buttons. */
  body?: string
  /** First one is the main (aqua) button; the rest are outlined. */
  actions: [label: string, href: string][]
  /** Small print under the buttons. */
  notes?: string[]
}

const button = (label: string, href: string, main: boolean) =>
  `<a href="${esc(href)}" style="display:inline-block;margin:0 8px 10px 0;padding:14px 24px;border-radius:999px;font-family:${FONT};font-size:15px;line-height:20px;font-weight:600;text-decoration:none;${
    main
      ? `background:${c.accent};color:${c.page};border:1px solid ${c.accent}`
      : `background:transparent;color:${c.text};border:1px solid ${c.lineStrong}`
  }">${esc(label)}</a>`

export function frame(f: Frame): string {
  const logo = `${f.assetBase.replace(/\/$/, '')}/email/logo-white.png`
  return `<!doctype html>
<html lang="es-MX" style="color-scheme:dark;supported-color-schemes:dark">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="dark">
<meta name="supported-color-schemes" content="dark">
<title>${esc(f.title)}</title>
<link href="https://fonts.googleapis.com/css2?family=Geist:wght@400;500;600;700&display=swap" rel="stylesheet">
<style>
  body,table,td,a{font-family:${FONT}}
  .tabular{font-variant-numeric:tabular-nums}
  @media (max-width:520px){.px{padding-left:24px!important;padding-right:24px!important}.when-time{font-size:30px!important;line-height:36px!important}}
</style>
</head>
<body style="margin:0;padding:0;background:${c.page};color:${c.text};-webkit-text-size-adjust:100%">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:${c.page}">${esc(f.preheader)}&#8203;&nbsp;&#8203;&nbsp;&#8203;&nbsp;&#8203;&nbsp;</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${c.page}">
<tr><td align="center" style="padding:32px 12px 40px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px">
<tr><td align="center" style="padding:0 0 28px"><img src="${logo}" width="132" height="84" alt="Havana Barbería" style="display:block;width:132px;height:auto;border:0"></td></tr>
<tr><td style="background:${c.card};border:1px solid ${c.line};border-radius:24px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
<tr><td class="px" style="padding:40px 40px 8px">
${f.eyebrow ? `<p style="margin:0 0 12px;font-size:13px;line-height:18px;font-weight:600;letter-spacing:0.12em;text-transform:uppercase;color:${c.subtle}">${esc(f.eyebrow)}</p>` : ''}
<h1 style="margin:0 0 12px;font-size:28px;line-height:34px;font-weight:600;letter-spacing:-0.02em;color:${c.text}">${esc(f.title)}</h1>
<p style="margin:0;font-size:16px;line-height:24px;color:${c.muted}">${esc(f.intro)}</p>
</td></tr>
${f.body ? `<tr><td class="px" style="padding:24px 40px 0">${f.body}</td></tr>` : ''}
<tr><td class="px" style="padding:28px 40px ${f.notes?.length ? '8px' : '32px'}">
${f.actions.map(([label, href], i) => button(label, href, i === 0)).join('\n')}
</td></tr>
${
  f.notes?.length
    ? `<tr><td class="px" style="padding:0 40px 36px">${f.notes
        .map((n) => `<p style="margin:8px 0 0;font-size:14px;line-height:21px;color:${c.subtle}">${esc(n)}</p>`)
        .join('')}</td></tr>`
    : ''
}
</table>
</td></tr>
<tr><td align="center" style="padding:28px 24px 0;font-size:13px;line-height:20px;color:${c.subtle}">
<p style="margin:0 0 6px;color:${c.muted};font-weight:600">${esc(shop.name)}</p>
<p style="margin:0">${esc(shop.address)}</p>
<p style="margin:6px 0 0"><a href="${shop.phoneHref}" style="color:${c.muted};text-decoration:none" class="tabular">${esc(shop.phone)}</a> &nbsp;·&nbsp; <a href="${shop.whatsapp}" style="color:${c.muted};text-decoration:underline">WhatsApp</a> &nbsp;·&nbsp; <a href="${shop.instagram}" style="color:${c.muted};text-decoration:underline">Instagram</a></p>
</td></tr>
</table>
</td></tr>
</table>
</body>
</html>`
}

// ── Appointment e-mails ────────────────────────────────────────────────────
export function compose(f: EmailFacts): Email {
  const { day, time } = when(f.startsAt, f.timeZone)
  const name = firstName(f.customerName)
  const services = f.services.join(' + ')

  const head: Record<EmailKind, { subject: string; eyebrow: string; title: string; intro: string }> = {
    confirmation: {
      subject: `Tu cita está confirmada · ${day}, ${time}`,
      eyebrow: 'Cita confirmada',
      title: `Listo, ${name}. Te esperamos.`,
      intro: `Tu lugar con ${f.staffName} está apartado.`,
    },
    reschedule: {
      subject: `Cambió tu cita · ${day}, ${time}`,
      eyebrow: 'Nuevo horario',
      title: `${name}, tu cita cambió de horario`,
      intro: 'Estos son los datos actualizados.',
    },
    cancellation: {
      subject: `Tu cita se canceló · ${day}, ${time}`,
      eyebrow: 'Cita cancelada',
      title: `${name}, cancelamos tu cita`,
      intro: 'Cuando quieras, agenda otra: aquí estaremos.',
    },
    reminder_24h: {
      subject: `Te esperamos mañana · ${time}`,
      eyebrow: 'Recordatorio',
      title: `Mañana es tu cita, ${name}`,
      intro: `Te esperamos con ${f.staffName}.`,
    },
    reminder_2h: {
      subject: `Tu cita es hoy a las ${time}`,
      eyebrow: 'Hoy',
      title: `Nos vemos en un rato, ${name}`,
      intro: `Tu cita con ${f.staffName} es hoy.`,
    },
    team_new: {
      subject: `Nueva cita en línea · ${f.customerName} · ${day}, ${time}`,
      eyebrow: 'Nueva cita en línea',
      title: `${f.customerName} agendó contigo`,
      intro: 'Ya aparece en tu agenda.',
    },
    team_cancel: {
      subject: `Cita cancelada · ${f.customerName} · ${day}, ${time}`,
      eyebrow: 'Cita cancelada',
      title: `${f.customerName} canceló su cita`,
      intro: 'Ese horario quedó libre en tu agenda.',
    },
  }
  const h = head[f.kind]
  const customer = isCustomerEmail(f.kind)
  const cancelled = f.kind === 'cancellation' || f.kind === 'team_cancel'

  const rows: [string, string][] = [
    ['Con', f.staffName],
    ['Servicios', `${services} · ${hours(f.durationMin)}`],
    ...(cancelled ? [] : ([['Total', `${money(f.totalPrice)} · pagas en la barbería`]] as [string, string][])),
    ...(customer && !cancelled ? ([['Dónde', shop.address]] as [string, string][]) : []),
  ]

  const notes: string[] = []
  if (customer && !cancelled) {
    notes.push(`Tenemos ${f.toleranceMin} minutos de tolerancia; llega a tiempo para aprovechar tu servicio completo.`)
    notes.push(
      f.manageUrl
        ? `Puedes cambiar o cancelar hasta ${hours(f.changeCutoffMin)} antes.`
        : `Para cambiar o cancelar, escríbenos por WhatsApp o llámanos al ${phone}, hasta ${hours(f.changeCutoffMin)} antes.`,
    )
  }
  if (customer && cancelled) notes.push(`¿Fue un error? Escríbenos por WhatsApp o llámanos al ${phone}.`)

  const actions: [string, string][] = customer
    ? cancelled
      ? [['Escríbenos por WhatsApp', shop.whatsapp]]
      : [['Cómo llegar', shop.maps], f.manageUrl ? ['Cambiar o cancelar', f.manageUrl] : ['WhatsApp', shop.whatsapp]]
    : [['Ver agenda', f.panelUrl]]

  const strike = cancelled ? `text-decoration:line-through;color:${c.subtle};` : ''
  const body = `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${c.raised};border:1px solid ${c.line};border-radius:16px">
<tr><td style="padding:24px 24px 20px;border-bottom:1px solid ${c.line}">
<p style="margin:0 0 4px;font-size:15px;line-height:22px;color:${c.muted};${strike}">${esc(capitalize(day))}</p>
<p class="when-time tabular" style="margin:0;font-size:36px;line-height:42px;font-weight:600;letter-spacing:-0.02em;color:${c.text};${strike}">${esc(time)}</p>
</td></tr>
<tr><td style="padding:8px 24px 12px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
${rows
  .map(
    ([k, v], i) =>
      `<tr><td valign="top" style="padding:12px 16px 12px 0;${i ? `border-top:1px solid ${c.line};` : ''}font-size:14px;line-height:21px;color:${c.subtle};width:84px">${esc(k)}</td><td valign="top" class="tabular" style="padding:12px 0;${i ? `border-top:1px solid ${c.line};` : ''}font-size:15px;line-height:22px;color:${c.text};${cancelled ? `color:${c.muted};` : ''}">${esc(v)}</td></tr>`,
  )
  .join('\n')}
</table>
</td></tr>
</table>`

  const html = frame({
    assetBase: f.assetBase,
    preheader: `${capitalize(day)}, ${time} · ${f.staffName} · ${services}`,
    eyebrow: h.eyebrow,
    title: h.title,
    intro: h.intro,
    body,
    actions,
    notes,
  })

  const text = [
    h.title,
    h.intro,
    '',
    `Cuándo: ${capitalize(day)}, ${time}${cancelled ? ' (cancelada)' : ''}`,
    ...rows.map(([k, v]) => `${k}: ${v}`),
    ...(notes.length ? ['', ...notes] : []),
    '',
    ...actions.map(([k, v]) => `${k}: ${v}`),
    '',
    `${shop.name} · ${shop.address} · ${shop.phone}`,
  ].join('\n')

  return { subject: h.subject, html, text }
}

// ── Account e-mails sent by Supabase Auth ──────────────────────────────────
// Pasted into Supabase › Authentication › Emails (files in supabase/templates/,
// kept in sync by src/test/emails.test.ts). {{ .ConfirmationURL }} is filled by Supabase.
export function authTemplate(kind: 'invite' | 'recovery', assetBase = DEFAULT_SITE): { subject: string; html: string } {
  const t =
    kind === 'invite'
      ? {
          subject: 'Te damos acceso al panel de Havana Barbería',
          preheader: 'Crea tu contraseña para entrar al panel.',
          eyebrow: 'Panel de la barbería',
          title: 'Ya tienes acceso al panel',
          intro: 'Crea tu contraseña para entrar. Después entras con este correo y esa contraseña.',
          action: 'Crear mi contraseña',
        }
      : {
          subject: 'Crea una contraseña nueva para el panel',
          preheader: 'Elige una contraseña nueva para entrar al panel.',
          eyebrow: 'Panel de la barbería',
          title: 'Crea una contraseña nueva',
          intro: 'Pediste entrar de nuevo al panel. Elige una contraseña nueva con este botón.',
          action: 'Crear contraseña nueva',
        }
  return {
    subject: t.subject,
    html: frame({
      assetBase,
      preheader: t.preheader,
      eyebrow: t.eyebrow,
      title: t.title,
      intro: t.intro,
      actions: [[t.action, '{{ .ConfirmationURL }}']],
      notes: [
        'El enlace dura una hora y sirve una sola vez. Si venció, en la pantalla de entrada usa «¿Olvidaste tu contraseña?» y te llega otro.',
        'Si no esperabas este correo, ignóralo.',
      ],
    }),
  }
}

/**
 * Who gets an e-mail. Test mode (`live` false) holds back only customers'
 * e-mails: they go to the review copy marked «Prueba». Team notices always go
 * to the barber plus the shop's notice list, with the review copy in BCC.
 */
export function routeEmail(opts: {
  forCustomer: boolean
  live: boolean
  to: string
  also: string[]
  reviewCopy: string | null
}): { to: string[]; bcc: string[]; test: boolean } {
  const real = opts.live || !opts.forCustomer
  if (!real) return { to: opts.reviewCopy ? [opts.reviewCopy] : [], bcc: [], test: true }
  const to = [...new Set([opts.to, ...opts.also].map((e) => e.trim().toLowerCase()).filter(Boolean))]
  const copy = opts.reviewCopy?.trim().toLowerCase()
  return { to, bcc: copy && !to.includes(copy) ? [copy] : [], test: false }
}
