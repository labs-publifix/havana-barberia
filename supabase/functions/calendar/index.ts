// The subscribed calendar a phone reads: GET /functions/v1/calendar?t=<private token>.
// The token comes from public.calendar_feed (the panel's "Conectar a mi calendario").
// It stops working when the person loses panel access or makes a new link.
import { createClient } from 'npm:@supabase/supabase-js@2.118.0'
import { buildFeed } from '../_shared/calendar.ts'
import { shop } from '../_shared/emails.ts'

const DESK = ['owner', 'developer', 'manager', 'reception']
const DAY = 86400000

type One<T> = T | T[] | null
const one = <T>(x: One<T>): T | null => (Array.isArray(x) ? (x[0] ?? null) : x)

Deno.serve(async (req) => {
  const notFound = () =>
    new Response('No encontrado', { status: 404, headers: { 'Content-Type': 'text/plain; charset=utf-8' } })
  if (req.method !== 'GET' && req.method !== 'HEAD') return new Response('Método no permitido', { status: 405 })
  const token = new URL(req.url).searchParams.get('t') ?? ''
  if (!/^[0-9a-f]{48}$/.test(token)) return notFound()

  const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { persistSession: false },
  })
  const { data: feed } = await db
    .from('calendar_feeds')
    .select('staff_id, profiles(active, role, staff_id)')
    .eq('token', token)
    .maybeSingle()
  const profile = one((feed?.profiles ?? null) as One<{ active: boolean; role: string; staff_id: string | null }>)
  if (!feed || !profile?.active) return notFound()
  // Access is checked on every refresh: a role change takes effect right away.
  const allowed = DESK.includes(profile.role) || (feed.staff_id !== null && feed.staff_id === profile.staff_id)
  if (!allowed) return notFound()

  const now = Date.now()
  let q = db
    .from('appointments')
    .select('id, starts_at, ends_at, status, service_ids, total_price, notes, customers(name, phone), staff(name)')
    .in('status', ['booked', 'confirmed', 'completed'])
    .gte('starts_at', new Date(now - 30 * DAY).toISOString())
    .lte('starts_at', new Date(now + 90 * DAY).toISOString())
    .order('starts_at')
  if (feed.staff_id) q = q.eq('staff_id', feed.staff_id)
  const [{ data: rows }, { data: services }, { data: barber }] = await Promise.all([
    q,
    db.from('services').select('id, name'),
    feed.staff_id
      ? db.from('staff').select('name').eq('id', feed.staff_id).maybeSingle()
      : Promise.resolve({ data: null }),
  ])
  const serviceName = new Map((services ?? []).map((s) => [s.id as string, s.name as string]))

  const site = (Deno.env.get('SITE_URL') || 'https://havanabarberia.com').replace(/\/$/, '')
  const ics = buildFeed({
    name: feed.staff_id ? `Havana · ${(barber as { name: string } | null)?.name ?? 'Agenda'}` : 'Havana · Agenda',
    showStaff: !feed.staff_id,
    address: shop.address,
    panelUrl: `${site}/admin/agenda`,
    appointments: (rows ?? []).map((a) => {
      const c = one(a.customers as One<{ name: string; phone: string }>)
      const s = one(a.staff as One<{ name: string }>)
      return {
        id: a.id,
        startsAt: a.starts_at,
        endsAt: a.ends_at,
        status: a.status,
        customerName: c?.name ?? '',
        customerPhone: c?.phone ?? '',
        staffName: s?.name ?? '',
        services: (a.service_ids as string[]).map((id) => serviceName.get(id) ?? id),
        totalPrice: a.total_price,
        notes: a.notes ?? '',
      }
    }),
  })
  return new Response(req.method === 'HEAD' ? null : ics, {
    headers: {
      'Content-Type': 'text/calendar; charset=utf-8',
      'Content-Disposition': 'inline; filename="havana-agenda.ics"',
      'Cache-Control': 'private, max-age=300',
    },
  })
})
