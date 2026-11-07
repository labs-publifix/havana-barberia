import { business } from '@/config/business'
import type { Appointment, PaymentMethod, Service } from '@/domain/types'
import { capitalize, formatDateLong, formatTime12, localDate, localTime, money } from '@/lib/time'
import { methodLabels } from './cash'
import type { ProductSale } from './finance'

/**
 * Printable sale ticket, 80 mm wide (the standard thermal roll; it also prints
 * fine on letter paper). Not a tax receipt. jsPDF is loaded only when a ticket
 * is generated, so it never weighs on the panel.
 */
export interface TicketData {
  folio: string
  at: string
  customer?: string
  staff?: string
  items: { name: string; qty: number; price: number }[]
  discount?: { label: string; amount: number }
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
  const items = a.serviceIds.map((id) => {
    const s = services.find((x) => x.id === id)
    return { name: s?.name ?? 'Servicio', qty: 1, price: s?.price ?? 0 }
  })
  const reward = p.rewardServiceId ? services.find((s) => s.id === p.rewardServiceId) : undefined
  return {
    folio: folioOf(a.id),
    at: p.paidAt,
    customer: a.customer.name,
    staff: staffName,
    items,
    discount: reward ? { label: 'Corte gratis (lealtad)', amount: reward.price } : undefined,
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
  const charged = subtotal - (t.discount?.amount ?? 0)
  return { subtotal, charged, total: charged + t.tip }
}

const WIDTH = 80
const M = 5

/** Build the PDF (80 mm wide, as tall as the content). */
export async function ticketPdf(t: TicketData) {
  const { jsPDF } = await import('jspdf')
  // Measure first on a tall page, then lay out again on a page cut to fit.
  const draw = (doc: InstanceType<typeof jsPDF>) => {
    let y = 8
    const inner = WIDTH - M * 2
    const center = (text: string, size: number, bold = false) => {
      doc.setFont('helvetica', bold ? 'bold' : 'normal').setFontSize(size)
      for (const line of doc.splitTextToSize(text, inner) as string[]) {
        doc.text(line, WIDTH / 2, y, { align: 'center' })
        y += size * 0.42
      }
    }
    const row = (left: string, right: string, size = 8.5, bold = false) => {
      doc.setFont('helvetica', bold ? 'bold' : 'normal').setFontSize(size)
      const lines = doc.splitTextToSize(left, inner - 22) as string[]
      lines.forEach((line, i) => {
        doc.text(line, M, y)
        if (i === 0) doc.text(right, WIDTH - M, y, { align: 'right' })
        y += size * 0.45
      })
    }
    const rule = () => {
      y += 1
      doc
        .setLineDashPattern([0.8, 0.8], 0)
        .setLineWidth(0.2)
        .line(M, y, WIDTH - M, y)
      y += 4
    }

    center(business.name.toUpperCase(), 13, true)
    y += 1
    for (const line of business.addressLines) center(line, 7.5)
    center(`Tel. ${business.phoneDisplay}`, 7.5)
    rule()
    const date = capitalize(formatDateLong(localDate(t.at, tz)))
    row(`Ticket ${t.folio}`, formatTime12(localTime(t.at, tz)), 8.5, true)
    row(date, '', 8)
    if (t.customer) row(`Cliente: ${t.customer}`, '', 8)
    if (t.staff) row(`Atendió: ${t.staff}`, '', 8)
    rule()
    for (const i of t.items) row(i.qty > 1 ? `${i.qty} × ${i.name}` : i.name, money(i.price * i.qty))
    if (t.discount) row(t.discount.label, `-${money(t.discount.amount)}`)
    rule()
    const totals = ticketTotals(t)
    if (t.discount || t.tip) row('Subtotal', money(totals.charged))
    if (t.tip) row(`Propina (${methodLabels[t.tipMethod].toLowerCase()})`, money(t.tip))
    y += 0.5
    row('TOTAL', money(totals.total), 11, true)
    y += 0.5
    row(`Pago: ${methodLabels[t.method]}`, '', 8)
    if (t.loyalty) {
      rule()
      center(`Tarjeta de lealtad: ${t.loyalty.stamps} de ${t.loyalty.goal} sellos`, 8, true)
    }
    rule()
    center('¡Gracias por tu visita!', 9, true)
    center('Agenda tu próxima cita en línea.', 7.5)
    y += 1
    center('Este ticket no es un comprobante fiscal.', 6.5)
    return y + 6
  }
  const probe = new jsPDF({ unit: 'mm', format: [WIDTH, 400] })
  const height = Math.max(90, Math.ceil(draw(probe)))
  const doc = new jsPDF({ unit: 'mm', format: [WIDTH, height] })
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
