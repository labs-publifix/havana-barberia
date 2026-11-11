import type { ID, Instant } from '@/domain/types'
import type { CustomerSummary } from './model'

/**
 * Clientes › Por recuperar (pure; tested in winback.test.ts).
 * - "Sin venir": had at least one visit, the last one more than `days` ago, and
 *   no upcoming appointment.
 * - "Importados": brought from AgendaPro, no visit in the new system yet and no
 *   upcoming appointment (we don't know their last visit there).
 * Customers who opted out never appear. Each one can be invited once every 30 days.
 */

export type InviteKind = 'winback' | 'new_system'
export type InviteChannel = 'email' | 'whatsapp'

export interface LastInvite {
  at: Instant
  channel: InviteChannel
  kind: InviteKind
}

export interface InviteState {
  /** Latest invitation per customer. */
  last: Record<ID, LastInvite>
  /** E-mail invitations already sent today (shop time). */
  sentToday: number
  dailyLimit: number
  /** Days without coming that put a customer on the list (Ajustes). */
  days: number
}

export const INVITE_SPACING_DAYS = 30
export const IMPORTED_MARK = 'Importado de AgendaPro'

export interface WinbackRow {
  summary: CustomerSummary
  /** Whole days since the last visit (null: none in the new system). */
  daysAway: number | null
  lastInvite: LastInvite | null
  /** Days until it can be invited again (0: now). */
  waitDays: number
  canEmail: boolean
  canWhatsapp: boolean
}

const DAY = 86400000

export function winbackRows(
  summaries: CustomerSummary[],
  state: InviteState,
  segment: InviteKind,
  now: Date,
): WinbackRow[] {
  const t = now.getTime()
  return summaries
    .filter((s) => !s.customer.marketingOptOut && !s.nextAppointment)
    .filter((s) =>
      segment === 'winback'
        ? !!s.lastVisit && t - Date.parse(s.lastVisit) > state.days * DAY
        : s.visits === 0 && (s.customer.notes ?? '').includes(IMPORTED_MARK),
    )
    .map((s) => {
      const last = state.last[s.customer.id] ?? null
      // An invitation made seconds after `now` still counts as today.
      const since = last ? Math.max(0, Math.floor((t - Date.parse(last.at)) / DAY)) : Infinity
      const waitDays = since >= INVITE_SPACING_DAYS ? 0 : INVITE_SPACING_DAYS - since
      return {
        summary: s,
        daysAway: s.lastVisit ? Math.floor((t - Date.parse(s.lastVisit)) / DAY) : null,
        lastInvite: last,
        waitDays,
        canEmail: !!s.customer.email && waitDays === 0,
        canWhatsapp: !!s.customer.phone,
      }
    })
    .sort(
      (a, b) =>
        // Most valuable first: more visits, then closer to the free cut, then longer away.
        b.summary.visits - a.summary.visits ||
        stampsLeft(a) - stampsLeft(b) ||
        (b.daysAway ?? 0) - (a.daysAway ?? 0) ||
        a.summary.customer.name.localeCompare(b.summary.customer.name),
    )
}

const stampsLeft = (r: WinbackRow) => (r.summary.loyalty ? r.summary.loyalty.goal - r.summary.loyalty.stamps : 99)

/** E-mail invitations that can still go out today. */
export const leftToday = (s: InviteState) => Math.max(0, s.dailyLimit - s.sentToday)

/** The WhatsApp message, ready to send from the shop's phone. */
export function whatsappText(
  r: WinbackRow,
  kind: InviteKind,
  opts: { site: string; barberName: string | null; barberId: string | null },
): string {
  const first = r.summary.customer.name.trim().split(/\s+/)[0] ?? ''
  const card = r.summary.loyalty
  const book = `${opts.site.replace(/\/$/, '')}/reservar${opts.barberId ? `?barbero=${encodeURIComponent(opts.barberId)}` : ''}`
  const stamps = card
    ? card.stamps >= card.goal
      ? 'Tienes un corte gratis esperándote. '
      : `Llevas ${card.stamps} de ${card.goal} sellos para tu corte gratis. `
    : ''
  if (kind === 'new_system')
    return (
      `Hola ${first}, te saluda Havana Barbería. Estrenamos reservas en línea: eliges barbero, día y hora desde tu celular, ` +
      `y juntas sellos en cada visita (10 = corte gratis). Agenda aquí: ${book}`
    )
  const weeks = r.daysAway ? Math.round(r.daysAway / 7) : null
  return (
    `Hola ${first}, te saluda Havana Barbería. ` +
    `${weeks ? `Ya pasaron ${weeks} semanas desde tu último corte${opts.barberName ? ` con ${opts.barberName}` : ''}. ` : ''}` +
    `${stamps}¿Te apartamos tu lugar? Agenda aquí: ${book}`
  )
}

/** wa.me link for a 10-digit Mexican number. */
export const whatsappUrl = (phone: string, text: string) =>
  `https://wa.me/52${phone.replace(/\D/g, '').slice(-10)}?text=${encodeURIComponent(text)}`
