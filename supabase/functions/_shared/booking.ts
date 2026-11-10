// Booking decisions for the Edge Function `booking`: pure (no network), tested
// with Vitest from src/test/booking-server.test.ts. Uses the same engine as the
// site (engine.js, bundled from src/lib), so the server accepts exactly the
// times the site offers.
import {
  computeSlots,
  localDate,
  nearestAvailable,
  normalizeMxPhone,
  staffForServices,
  toPolicy,
  toService,
  toStaff,
  totalDuration,
  zonedInstant,
  addDays,
} from './engine.js'

// Loose row shapes (the engine maps them to domain types).
// deno-lint-ignore no-explicit-any
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = any

export interface Catalog {
  settings: Row
  staff: Row[]
  links: { staff_id: string; service_id: string }[]
  services: Row[]
}

export interface Busy {
  id: string
  staff_id: string | null
  starts_at: string
  ends_at: string
  is_block: boolean
}

export type Slot = ReturnType<typeof computeSlots>[number]

export type Failure =
  | { code: 'invalid_request'; message: string }
  | { code: 'slot_unavailable'; message: string; alternatives: Slot[] }
  | { code: 'booking_limit'; message: string; limit: number }
  | { code: 'change_window_closed'; message: string; cutoffHours: number }
  | { code: 'not_found'; message: string }

export const fail = {
  invalid: (message: string): Failure => ({ code: 'invalid_request', message }),
  slot: (alternatives: Slot[]): Failure => ({
    code: 'slot_unavailable',
    message: 'Ese horario ya no está disponible.',
    alternatives,
  }),
  limit: (limit: number): Failure => ({
    code: 'booking_limit',
    message: `Ya tienes ${limit} citas próximas. Para agendar otra, cancela o espera a que pase una de ellas.`,
    limit,
  }),
  window: (cutoffHours: number): Failure => ({
    code: 'change_window_closed',
    message: `Solo puedes cancelar o reprogramar hasta ${cutoffHours} horas antes de tu cita.`,
    cutoffHours,
  }),
  notFound: (): Failure => ({ code: 'not_found', message: 'No encontramos esa cita.' }),
}

export const timeZoneOf = (settings: Row): string => settings.time_zone ?? 'America/Mexico_City'

/** The local day of `iso`, as the instants that bound it (to load busy times). */
export function dayBounds(iso: string, timeZone: string): { date: string; from: string; to: string } {
  const date = localDate(iso, timeZone)
  return {
    date,
    from: zonedInstant(date, '00:00', timeZone).toISOString(),
    to: zonedInstant(addDays(date, 1), '00:00', timeZone).toISOString(),
  }
}

/** Slots of one day exactly as the site computes them. */
export function slotsFor(
  catalog: Catalog,
  busy: Busy[],
  q: { serviceIds: string[]; staffId: string; date: string; excludeAppointmentId?: string },
  now: Date,
): Slot[] {
  const services = catalog.services.map(toService).filter((s: Row) => s.active && q.serviceIds.includes(s.id))
  if (!services.length || services.length !== q.serviceIds.length) return []
  const staff = catalog.staff.map((r) => toStaff(r, catalog.links)).filter((s: Row) => s.active)
  const candidates = staffForServices(staff, q.serviceIds)
  return computeSlots({
    date: q.date,
    durationMin: totalDuration(services),
    staff: q.staffId === 'any' ? candidates : candidates.filter((s: Row) => s.id === q.staffId),
    hours: { timeZone: timeZoneOf(catalog.settings), weekly: catalog.settings.business_hours },
    policy: toPolicy(catalog.settings),
    appointments: busy
      .filter((b) => !b.is_block)
      .map((b) => ({
        id: b.id,
        staffId: b.staff_id ?? '',
        startsAt: b.starts_at,
        endsAt: b.ends_at,
        status: 'confirmed' as const,
      })),
    blocks: busy
      .filter((b) => b.is_block)
      .map((b) => ({ id: b.id, staffId: b.staff_id, startsAt: b.starts_at, endsAt: b.ends_at, reason: '' })),
    now,
    excludeAppointmentId: q.excludeAppointmentId,
  })
}

export interface BookingRequest {
  serviceIds: string[]
  staffId: string
  startsAt: string
  customer: { name: string; phone: string; email: string }
  notes: string
  privacyAccepted: boolean
}

export interface CleanRequest extends BookingRequest {
  customer: { name: string; phone: string; email: string }
}

/** Checks and normalizes what the site sent. */
export function cleanRequest(body: Row): CleanRequest | Failure {
  if (!body || typeof body !== 'object') return fail.invalid('Solicitud inválida.')
  if (body.privacyAccepted !== true) return fail.invalid('Acepta el aviso de privacidad para continuar.')
  const ids = Array.isArray(body.serviceIds) ? body.serviceIds.filter((x: unknown) => typeof x === 'string') : []
  if (!ids.length || ids.length > 6 || new Set(ids).size !== ids.length) return fail.invalid('Elige tus servicios.')
  const staffId = typeof body.staffId === 'string' && body.staffId ? body.staffId : 'any'
  const startsAt = typeof body.startsAt === 'string' && !Number.isNaN(Date.parse(body.startsAt)) ? body.startsAt : ''
  if (!startsAt) return fail.invalid('Elige un horario.')
  const name = String(body.customer?.name ?? '')
    .trim()
    .replace(/\s+/g, ' ')
  const phone = normalizeMxPhone(String(body.customer?.phone ?? ''))
  const email = String(body.customer?.email ?? '')
    .trim()
    .toLowerCase()
  if (!name || name.length > 80 || !phone || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 120)
    return fail.invalid('Revisa tu nombre, teléfono y correo.')
  const notes = String(body.notes ?? '')
    .trim()
    .slice(0, 500)
  return { serviceIds: ids, staffId, startsAt, customer: { name, phone, email }, notes, privacyAccepted: true }
}

/** The slot for this request, or why not (with the nearest alternatives). */
export function pickSlot(catalog: Catalog, busy: Busy[], req: CleanRequest, now: Date): Slot | Failure {
  const { date } = dayBounds(req.startsAt, timeZoneOf(catalog.settings))
  const slots = slotsFor(catalog, busy, { serviceIds: req.serviceIds, staffId: req.staffId, date }, now)
  if (
    !slots.length &&
    catalog.services.filter((s) => s.active && req.serviceIds.includes(s.id)).length !== req.serviceIds.length
  )
    return fail.invalid('Alguno de los servicios ya no está disponible.')
  const slot = slots.find((s) => s.startsAt === new Date(req.startsAt).toISOString())
  if (!slot?.available || !slot.staffId) return fail.slot(nearestAvailable(slots, req.startsAt))
  return slot
}

/** Totals of the chosen services. */
export function priceOf(catalog: Catalog, serviceIds: string[]): { durationMin: number; totalPrice: number } {
  const chosen = catalog.services.filter((s) => serviceIds.includes(s.id))
  return {
    durationMin: chosen.reduce((t, s) => t + s.duration_min, 0),
    totalPrice: chosen.reduce((t, s) => t + s.price, 0),
  }
}

/** Customers may change or cancel until `change_cutoff_min` before; only active, future visits. */
export function changeAllowed(a: { status: string; starts_at: string }, settings: Row, now: Date): Failure | null {
  if (a.status !== 'booked' && a.status !== 'confirmed') return fail.invalid('Esta cita ya no se puede modificar.')
  const cutoff = Number(settings.change_cutoff_min ?? 240)
  if (Date.parse(a.starts_at) - now.getTime() < cutoff * 60000) return fail.window(cutoff / 60)
  return null
}

export const isFailure = (x: unknown): x is Failure => !!x && typeof x === 'object' && 'code' in x && 'message' in x
