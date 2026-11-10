// Online booking from the public site: create (with Turnstile), cancel and
// reschedule (with the private token from the customer's link). Requests are
// limited per IP; the times accepted are exactly the ones the site offers
// (_shared/booking.ts uses the site's own availability engine).
import { createClient } from 'npm:@supabase/supabase-js@2.118.0'
import { cors } from '../_shared/cors.ts'
import {
  changeAllowed,
  cleanRequest,
  dayBounds,
  fail,
  isFailure,
  pickSlot,
  priceOf,
  slotsFor,
  timeZoneOf,
  type Busy,
  type Catalog,
  type Failure,
} from '../_shared/booking.ts'
import { nearestAvailable } from '../_shared/engine.js'

const LIMITS = { create: [6, 3600], change: [20, 3600] } as const
const NO_SHOW_LIMIT = 3

Deno.serve(async (req) => {
  const headers = { ...cors(req), 'Content-Type': 'application/json' }
  const reply = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers })
  const refuse = (f: Failure, status = f.code === 'not_found' ? 404 : f.code === 'invalid_request' ? 400 : 409) =>
    reply(status, f)
  if (req.method === 'OPTIONS') return new Response('ok', { headers })
  if (req.method !== 'POST') return reply(405, fail.invalid('Método no permitido.'))

  // deno-lint-ignore no-explicit-any
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let body: any
  try {
    body = await req.json()
  } catch {
    return refuse(fail.invalid('Solicitud inválida.'))
  }
  const action = body?.action
  if (action !== 'create' && action !== 'cancel' && action !== 'reschedule')
    return refuse(fail.invalid('Acción inválida.'))

  const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { persistSession: false },
  })

  // Requests per IP.
  const ip = (req.headers.get('x-forwarded-for') ?? '').split(',')[0]!.trim() || 'unknown'
  const [max, windowSec] = action === 'create' ? LIMITS.create : LIMITS.change
  const { data: allowed } = await db.rpc('rate_limit', {
    p_key: `${action === 'create' ? 'create' : 'change'}:${ip}`,
    p_max: max,
    p_window_sec: windowSec,
  })
  if (allowed === false)
    return reply(429, fail.invalid('Hiciste muchos intentos seguidos. Espera un rato o escríbenos por WhatsApp.'))

  const now = new Date()
  const catalog = await loadCatalog()
  if (!catalog) return reply(500, fail.invalid('No pudimos cargar la agenda. Intenta de nuevo.'))
  const tz = timeZoneOf(catalog.settings)

  async function loadCatalog(): Promise<Catalog | null> {
    const [settings, staff, links, services] = await Promise.all([
      db.from('settings').select('*').eq('id', 1).single(),
      db.from('staff').select('*').order('sort'),
      db.from('staff_services').select('staff_id, service_id'),
      db.from('services').select('*').order('sort'),
    ])
    if (settings.error || staff.error || links.error || services.error) return null
    return { settings: settings.data, staff: staff.data, links: links.data, services: services.data }
  }

  async function busyOn(iso: string): Promise<Busy[]> {
    const { from, to } = dayBounds(iso, tz)
    const { data } = await db.rpc('busy_slots', { from_at: from, to_at: to })
    return (data ?? []) as Busy[]
  }

  const APPT =
    'id, token, customer_id, staff_id, service_ids, starts_at, ends_at, duration_min, total_price, status, notes, created_at, loyalty_token, source, customers(name, phone, email)'
  // deno-lint-ignore no-explicit-any
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const toAppointment = (a: any) => {
    const c = Array.isArray(a.customers) ? a.customers[0] : a.customers
    return {
      id: a.id,
      token: a.token,
      customerId: a.customer_id,
      customer: { name: c?.name ?? '', phone: c?.phone ?? '', email: c?.email ?? '' },
      staffId: a.staff_id,
      serviceIds: a.service_ids,
      startsAt: new Date(a.starts_at).toISOString(),
      endsAt: new Date(a.ends_at).toISOString(),
      durationMin: a.duration_min,
      totalPrice: a.total_price,
      status: a.status,
      notes: a.notes,
      createdAt: a.created_at,
      loyaltyToken: a.loyalty_token,
      source: a.source,
    }
  }

  // ── Create ──────────────────────────────────────────────────────────────
  if (action === 'create') {
    const secret = Deno.env.get('TURNSTILE_SECRET_KEY')
    if (!secret) return reply(503, fail.invalid('La reserva en línea no está disponible. Escríbenos por WhatsApp.'))
    const check = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      body: new URLSearchParams({ secret, response: String(body.turnstileToken ?? ''), remoteip: ip }),
    })
      .then((r) => r.json())
      .catch(() => ({ success: false }))
    if (!check.success)
      return refuse(fail.invalid('No pudimos confirmar que eres una persona. Recarga la página e intenta de nuevo.'))

    const clean = cleanRequest(body)
    if (isFailure(clean)) return refuse(clean)
    const slot = pickSlot(catalog, await busyOn(clean.startsAt), clean, now)
    if (isFailure(slot)) return refuse(slot)

    // The customer: same phone or e-mail is the same person.
    const { phone, email, name } = clean.customer
    const { data: found } = await db
      .from('customers')
      .select('id, email')
      .or(`phone.eq."${phone}",email.eq."${email.replace(/"/g, '')}"`)
      .limit(1)
    let customerId: string | undefined = found?.[0]?.id
    if (customerId && !found![0].email) await db.from('customers').update({ email }).eq('id', customerId)
    if (!customerId) {
      const { data: created, error } = await db.from('customers').insert({ name, phone, email }).select('id').single()
      if (error || !created) return reply(500, fail.invalid('No pudimos guardar tus datos. Intenta de nuevo.'))
      customerId = created.id
    }

    // Too many no-shows lately: the shop wants a word first.
    const since = new Date(now.getTime() - 90 * 86400000).toISOString()
    const { count: noShows } = await db
      .from('appointments')
      .select('id', { count: 'exact', head: true })
      .eq('customer_id', customerId)
      .eq('status', 'no_show')
      .gte('starts_at', since)
    if ((noShows ?? 0) >= NO_SHOW_LIMIT)
      return refuse(fail.invalid('Para agendar, escríbenos por WhatsApp o llámanos al 442 537 7844.'))

    const limit = Number(catalog.settings.max_active_per_customer ?? 2)
    const { count: upcoming } = await db
      .from('appointments')
      .select('id', { count: 'exact', head: true })
      .eq('customer_id', customerId)
      .in('status', ['booked', 'confirmed'])
      .gt('starts_at', now.toISOString())
    if ((upcoming ?? 0) >= limit) return refuse(fail.limit(limit))

    await db.from('loyalty_cards').upsert(
      { customer_id: customerId, goal: catalog.settings.loyalty_goal ?? 10 },
      {
        onConflict: 'customer_id',
        ignoreDuplicates: true,
      },
    )
    const { data: card } = await db.from('loyalty_cards').select('token').eq('customer_id', customerId).maybeSingle()

    const { durationMin, totalPrice } = priceOf(catalog, clean.serviceIds)
    const { data: appt, error } = await db
      .from('appointments')
      .insert({
        customer_id: customerId,
        staff_id: slot.staffId,
        service_ids: clean.serviceIds,
        starts_at: slot.startsAt,
        ends_at: slot.endsAt,
        duration_min: durationMin,
        total_price: totalPrice,
        status: 'confirmed',
        source: 'online',
        notes: clean.notes,
        loyalty_token: card?.token ?? null,
      })
      .select(APPT)
      .single()
    if (error?.code === '23P01') {
      const { date } = dayBounds(clean.startsAt, tz)
      const slots = slotsFor(catalog, await busyOn(clean.startsAt), { ...clean, date }, now)
      return refuse(fail.slot(nearestAvailable(slots, clean.startsAt)))
    }
    if (error || !appt) return reply(500, fail.invalid('No pudimos guardar tu cita. Intenta de nuevo.'))
    return reply(200, { appointment: toAppointment(appt) })
  }

  // ── Cancel or reschedule (by the private token) ─────────────────────────
  const token = typeof body.token === 'string' && body.token.length >= 16 ? body.token : ''
  if (!token) return refuse(fail.notFound())
  const { data: a } = await db.from('appointments').select(APPT).eq('token', token).maybeSingle()
  if (!a) return refuse(fail.notFound())
  const closed = changeAllowed(a, catalog.settings, now)
  if (closed) return refuse(closed)

  if (action === 'cancel') {
    const { error } = await db
      .from('appointments')
      .update({ status: 'cancelled' })
      .eq('id', a.id)
      .in('status', ['booked', 'confirmed'])
    if (error) return reply(500, fail.invalid('No pudimos cancelar. Intenta de nuevo.'))
    return reply(200, { ok: true })
  }

  const startsAt = typeof body.startsAt === 'string' && !Number.isNaN(Date.parse(body.startsAt)) ? body.startsAt : ''
  if (!startsAt) return refuse(fail.invalid('Elige un horario.'))
  const { date } = dayBounds(startsAt, tz)
  const busy = await busyOn(startsAt)
  const slots = slotsFor(
    catalog,
    busy,
    { serviceIds: a.service_ids, staffId: a.staff_id, date, excludeAppointmentId: a.id },
    now,
  )
  const target = slots.find((s) => s.startsAt === new Date(startsAt).toISOString())
  if (!target?.available) return refuse(fail.slot(nearestAvailable(slots, startsAt)))
  const { data: moved, error } = await db
    .from('appointments')
    .update({ starts_at: target.startsAt, ends_at: target.endsAt, status: 'confirmed' })
    .eq('id', a.id)
    .select(APPT)
    .single()
  if (error?.code === '23P01') return refuse(fail.slot(nearestAvailable(slots, startsAt)))
  if (error || !moved) return reply(500, fail.invalid('No pudimos cambiar tu cita. Intenta de nuevo.'))
  return reply(200, { appointment: toAppointment(moved) })
})
