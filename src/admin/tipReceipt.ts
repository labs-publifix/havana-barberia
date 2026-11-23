import logoUrl from '@/assets/brand/logo-ticket.png'
import { business } from '@/config/business'
import { formatTime12, localDate, localTime, money } from '@/lib/time'
import { methodLabels } from './cash'
import { TICKET_WIDTH_MM } from './ticket'
import type { TipPayout } from './tips'

/**
 * Tip payout receipt for the barber to sign, on the shop's 58 mm thermal
 * printer: same page and type sizes as the sale ticket (src/admin/ticket.ts).
 * Two copies (barber and shop) come as two pages of the same PDF.
 */

const WIDTH = TICKET_WIDTH_MM
const M = 6
const LOGO_W = 32
const LOGO_RATIO = 306 / 480
const INK = 0.1
const tz = business.hours.timeZone

const dmy = (d: string) => d.split('-').reverse().join('/')
export const tipFolio = (n: number) => `P-${String(n).padStart(5, '0')}`

async function loadLogo(): Promise<Uint8Array | null> {
  try {
    const res = await fetch(logoUrl)
    return res.ok ? new Uint8Array(await res.arrayBuffer()) : null
  } catch {
    return null
  }
}

export type ReceiptCopy = 'barbero' | 'barbería'

/** Build the receipt PDF: one page per copy, each as tall as its content. */
export async function tipReceiptPdf(p: TipPayout, opts: { copies?: ReceiptCopy[]; logo?: Uint8Array | null } = {}) {
  const { jsPDF } = await import('jspdf')
  const logo = opts.logo === undefined ? await loadLogo() : opts.logo
  const copies = opts.copies ?? ['barbero', 'barbería']
  const inner = WIDTH - M * 2

  const draw = (doc: InstanceType<typeof jsPDF>, copy: ReceiptCopy) => {
    let y = 4
    doc.setTextColor(0)
    const lh = (size: number) => size * 0.4
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

    if (logo) {
      const h = LOGO_W * LOGO_RATIO
      doc.addImage(logo, 'PNG', (WIDTH - LOGO_W) / 2, y, LOGO_W, h)
      y += h + 1.5
    } else {
      center(business.name.toUpperCase(), 12, true)
    }
    for (const line of business.ticketAddressLines) center(line, 8)
    center(`Tel. ${business.phoneDisplay}`, 8)
    rule(true)

    center('RECIBO DE PAGO', 11, true)
    center('DE PROPINAS', 11, true)
    if (p.voided) center('*** ANULADO ***', 11, true)
    y += 0.4
    field('Folio:', tipFolio(p.folio))
    field('Fecha:', dmy(localDate(p.paidAt, tz)))
    field('Hora:', formatTime12(localTime(p.paidAt, tz)))
    field('Barbero:', p.staffName)
    field(
      'Periodo:',
      p.firstDate === p.lastDate ? dmy(p.firstDate) : `${dmy(p.firstDate).slice(0, 5)} al ${dmy(p.lastDate)}`,
    )
    field('Pagó:', p.paidBy)
    rule()

    row('Detalle', 'Importe', 8, true)
    y += 0.3
    for (const l of p.lines) {
      row(`${dmy(l.date).slice(0, 5)} ${l.customer}`, money(l.amount), 8)
      if (l.fee) row(`   ${methodLabels[l.method]} ${money(l.tip)} - ${money(l.fee)} terminal`, '', 7.5)
      else if (l.method !== 'cash') row(`   ${methodLabels[l.method]}`, '', 7.5)
    }
    rule()

    row('Efectivo', money(p.byMethod.cash))
    row('Tarjeta', money(p.byMethod.card))
    row('Transferencia', money(p.byMethod.transfer))
    row('Propinas recibidas', money(p.gross))
    if (p.fee) row('Descuento terminal', `-${money(p.fee)}`)
    y += 0.6
    row('PAGADO', money(p.amount), 12, true)
    y += 0.4
    field('Pago:', 'Efectivo de caja', 9)
    if (p.voided) {
      y += 0.6
      center(`Anulado por ${p.voided.by}: ${p.voided.reason}`, 8)
    }
    rule(true)

    // Signature.
    center('Recibí de conformidad la cantidad de', 8)
    center(`${money(p.amount)} por concepto de propinas.`, 8, true)
    y += 16
    doc.setLineWidth(0.4)
    doc.line(M + 2, y, WIDTH - M - 2, y)
    y += 1
    center('Firma', 8)
    center(p.staffName, 9, true)
    y += 1
    center(`Copia ${copy}`, 7.5)
    return y + 6
  }

  const probe = new jsPDF({ unit: 'mm', format: [WIDTH, 1200] })
  const heights = copies.map((c) => Math.ceil(draw(probe, c)))
  const doc = new jsPDF({ unit: 'mm', format: [WIDTH, heights[0]!], orientation: 'portrait' })
  copies.forEach((c, i) => {
    if (i > 0) doc.addPage([WIDTH, heights[i]!], 'portrait')
    draw(doc, c)
  })
  doc.setProperties({ title: `Recibo de propinas ${tipFolio(p.folio)} · ${p.staffName}` })
  return doc
}

/** Open the receipt with the print dialog ready (download if pop-ups are blocked). */
export async function printTipReceipt(p: TipPayout, copies?: ReceiptCopy[]) {
  const doc = await tipReceiptPdf(p, { copies })
  doc.autoPrint()
  const url = doc.output('bloburl')
  const w = window.open(url, '_blank')
  if (!w) doc.save(`recibo-propinas-${tipFolio(p.folio).toLowerCase()}.pdf`)
}

export async function downloadTipReceipt(p: TipPayout) {
  const doc = await tipReceiptPdf(p)
  doc.save(`recibo-propinas-${tipFolio(p.folio).toLowerCase()}.pdf`)
}
