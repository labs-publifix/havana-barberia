import logoUrl from '@/assets/brand/logo-ticket.png'
import { business } from '@/config/business'
import type { Appointment, PaymentMethod, Service } from '@/domain/types'
import { formatTime12, localDate, localTime, money } from '@/lib/time'
import { methodLabels } from './cash'
import type { ProductSale } from './finance'

/**
 * Printable sale ticket for the shop's 58 mm thermal printer (5 cm roll).
 * Not a tax receipt. jsPDF is loaded only when a ticket
 * is generated, so it never weighs on the panel.
 */
export interface TicketData {
  folio: string
  at: string
  customer?: string
  staff?: string
  items: { name: string; qty: number; price: number }[]
  /** Free cut, authorized discount… shown as negative lines. */
  discounts?: { label: string; amount: number }[]
  /** Mixed payment, when it was split. */
  splits?: { method: PaymentMethod; amount: number }[]
  tip: number
  method: PaymentMethod
  tipMethod: PaymentMethod
  /** Loyalty card after this visit. */
  loyalty?: { stamps: number; goal: number }
}

const tz = business.hours.timeZone
const folioOf = (id: string) =>
  id
    .replace(/^[a-z]+-/, '')
    .slice(-8)
    .toUpperCase()

export function ticketFromAppointment(
  a: Appointment,
  services: Service[],
  staffName?: string,
  loyalty?: { stamps: number; goal: number } | null,
): TicketData {
  const p = a.payment!
  const items = [
    // The same service twice (e.g. two haircuts) is one line with quantity 2.
    ...[...new Set(a.serviceIds)].map((id) => {
      const s = services.find((x) => x.id === id)
      return { name: s?.name ?? 'Servicio', qty: a.serviceIds.filter((x) => x === id).length, price: s?.price ?? 0 }
    }),
    ...(p.products ?? []).map((i) => ({ name: i.name, qty: i.qty, price: i.price })),
  ]
  const reward = p.rewardServiceId ? services.find((s) => s.id === p.rewardServiceId) : undefined
  const discounts = [
    ...(reward ? [{ label: 'Corte gratis (lealtad)', amount: p.rewardAmount ?? reward.price }] : []),
    ...(p.discount ? [{ label: `Descuento: ${p.discount.reason}`, amount: p.discount.amount }] : []),
  ]
  return {
    folio: folioOf(a.id),
    at: p.paidAt,
    customer: a.customer.name,
    staff: staffName,
    items,
    discounts: discounts.length ? discounts : undefined,
    splits: p.splits,
    tip: p.tip,
    method: p.method,
    tipMethod: p.tipMethod,
    loyalty: loyalty ?? undefined,
  }
}

export function ticketFromSale(s: ProductSale, staffName?: string): TicketData {
  return {
    folio: folioOf(s.id),
    at: s.at,
    staff: staffName,
    items: s.items.map((i) => ({ name: i.name, qty: i.qty, price: i.price })),
    tip: 0,
    method: s.method,
    tipMethod: s.method,
  }
}

/** Totals shown on the ticket. */
export function ticketTotals(t: TicketData) {
  const subtotal = t.items.reduce((sum, i) => sum + i.price * i.qty, 0)
  const charged = subtotal - (t.discounts ?? []).reduce((sum, d) => sum + d.amount, 0)
  return { subtotal, charged, total: charged + t.tip }
}

/**
 * Page size: the shop prints on a POS-58 thermal printer whose roll is 5 cm
 * wide (48 mm printable). The page is 50 mm wide with 6 mm margins (a test
 * print on the shop's printer clipped ~3 mm on the left with 3 mm margins), and
 * as tall as the content, so no paper is wasted. Sizes are 8–13 pt and glyphs
 * get a thin outline so they come out dark on thermal paper.
 */
export const TICKET_WIDTH_MM = 50
const WIDTH = TICKET_WIDTH_MM
const M = 6
const LOGO_W = 32
const LOGO_RATIO = 306 / 480
/** Outline added to every glyph (mm). */
const INK = 0.1

const dmy = (d: string) => d.split('-').reverse().join('/')
const handle = (url: string | null) => (url ? `@${url.replace(/\/+$/, '').split('/').pop()}` : null)

/** The black logo as PNG bytes (jsPDF can't embed WebP); null if it can't be loaded. */
async function loadLogo(): Promise<Uint8Array | null> {
  try {
    const res = await fetch(logoUrl)
    return res.ok ? new Uint8Array(await res.arrayBuffer()) : null
  } catch {
    return null
  }
}

/** Build the PDF (50 mm wide, as tall as the content). */
export async function ticketPdf(t: TicketData, opts: { logo?: Uint8Array | null } = {}) {
  const { jsPDF } = await import('jspdf')
  const logo = opts.logo === undefined ? await loadLogo() : opts.logo
  const inner = WIDTH - M * 2
  // Measure first on a tall page, then lay out again on a page cut to fit.
  const draw = (doc: InstanceType<typeof jsPDF>) => {
    let y = 4
    doc.setTextColor(0)
    const lh = (size: number) => size * 0.4
    /** Filled and outlined: thermal heads print thin Helvetica too faint. */
    const put = (text: string, x: number, at: number, align?: 'center' | 'right') => {
      doc.setLineWidth(INK)
      doc.text(text, x, at, { align, renderingMode: 'fillThenStroke' })
    }
    const center = (text: string, size: number, bold = false) => {
      doc.setFont('helvetica', bold ? 'bold' : 'normal').setFontSize(size)
      for (const line of doc.splitTextToSize(text, inner) as string[]) {
        y += lh(size)
        put(line, WIDTH / 2, y, 'center')
      }
      y += 0.6
    }
    /** Text on the left (wraps), amount on the right of its first line. */
    const row = (left: string, right = '', size = 9, bold = false) => {
      doc.setFont('helvetica', bold ? 'bold' : 'normal').setFontSize(size)
      const room = right ? inner - doc.getTextWidth(right) - 2 : inner
      const lines = doc.splitTextToSize(left, room) as string[]
      lines.forEach((line, i) => {
        y += lh(size)
        put(line, M, y)
        if (i === 0 && right) put(right, WIDTH - M, y, 'right')
        y += 0.7
      })
    }
    /** "Label: value" with the label in bold. */
    const field = (label: string, value: string, size = 9) => {
      doc.setFont('helvetica', 'bold').setFontSize(size)
      const lw = doc.getTextWidth(`${label} `)
      doc.setFont('helvetica', 'normal')
      const lines = doc.splitTextToSize(value, inner - lw) as string[]
      lines.forEach((line, i) => {
        y += lh(size)
        if (i === 0) {
          doc.setFont('helvetica', 'bold')
          put(label, M, y)
          doc.setFont('helvetica', 'normal')
        }
        put(line, M + lw, y)
        y += 0.7
      })
    }
    const rule = (solid = false) => {
      y += 1.4
      doc.setLineWidth(solid ? 0.5 : 0.35)
      doc.setLineDashPattern(solid ? [] : [0.8, 0.8], 0)
      doc.line(M, y, WIDTH - M, y)
      doc.setLineDashPattern([], 0)
      y += 1.2
    }

    // Header: logo and contact details.
    if (logo) {
      const h = LOGO_W * LOGO_RATIO
      doc.addImage(logo, 'PNG', (WIDTH - LOGO_W) / 2, y, LOGO_W, h)
      y += h + 1.5
    } else {
      center(business.name.toUpperCase(), 12, true)
    }
    for (const line of business.ticketAddressLines) center(line, 8)
    center('Tel. y WhatsApp', 8)
    center(business.phoneDisplay, 9, true)
    center(business.website.replace(/^https?:\/\//, ''), 8)
    const ig = handle(business.instagramUrl)
    if (ig) center(ig, 8)
    rule(true)

    // Sale data.
    center('TICKET DE VENTA', 11, true)
    y += 0.4
    field('Folio:', t.folio)
    field('Fecha:', dmy(localDate(t.at, tz)))
    field('Hora:', formatTime12(localTime(t.at, tz)))
    if (t.customer) field('Cliente:', t.customer)
    if (t.staff) field('Atendió:', t.staff)
    rule()

    // Items: description and amount; quantity × unit price underneath.
    row('Descripción', 'Importe', 8, true)
    y += 0.3
    for (const i of t.items) {
      row(i.name, money(i.price * i.qty), 9)
      if (i.qty > 1) row(`   ${i.qty} x ${money(i.price)}`, '', 8)
    }
    for (const d of t.discounts ?? []) row(d.label, `-${money(d.amount)}`, 9)
    rule()

    // Totals and payment.
    const totals = ticketTotals(t)
    const off = totals.subtotal - totals.charged
    row('Subtotal', money(totals.subtotal))
    if (off) row('Descuentos', `-${money(off)}`)
    if (t.tip) row(`Propina (${methodLabels[t.tipMethod].toLowerCase()})`, money(t.tip))
    y += 0.6
    row('TOTAL', money(totals.total), 13, true)
    y += 0.4
    if (t.splits?.length) {
      row('Forma de pago:', '', 9, true)
      for (const x of t.splits) row(`   ${methodLabels[x.method]}`, money(x.amount), 9)
    } else field('Forma de pago:', methodLabels[t.method], 9)

    if (t.loyalty) {
      rule()
      center('TARJETA DE LEALTAD', 9, true)
      center(`${t.loyalty.stamps} de ${t.loyalty.goal} sellos`, 9)
      const left = t.loyalty.goal - t.loyalty.stamps
      center(
        left > 0
          ? `Te ${left === 1 ? 'falta 1 sello' : `faltan ${left} sellos`} para tu corte gratis.`
          : '¡Tu próximo corte es gratis!',
        8,
      )
    }
    rule(true)
    center('¡Gracias por tu visita!', 10, true)
    center(`Agenda tu próxima cita en ${business.website.replace(/^https?:\/\//, '')}`, 8)
    y += 0.6
    center('Este ticket no es un comprobante fiscal.', 7.5)
    return y + 5
  }
  const probe = new jsPDF({ unit: 'mm', format: [WIDTH, 600] })
  const height = Math.ceil(draw(probe))
  const doc = new jsPDF({ unit: 'mm', format: [WIDTH, height], orientation: 'portrait' })
  draw(doc)
  doc.setProperties({ title: `Ticket ${t.folio} · ${business.name}` })
  return doc
}

/** Download the ticket as a PDF file. */
export async function downloadTicket(t: TicketData) {
  const doc = await ticketPdf(t)
  doc.save(`ticket-${t.folio.toLowerCase()}.pdf`)
}

/** Open the ticket in a new tab with the print dialog ready. */
export async function printTicket(t: TicketData) {
  const doc = await ticketPdf(t)
  doc.autoPrint()
  const url = doc.output('bloburl')
  const w = window.open(url, '_blank')
  // Pop-up blocked: fall back to downloading it.
  if (!w) doc.save(`ticket-${t.folio.toLowerCase()}.pdf`)
}
