// A discount needs the owner's or a manager's OK. When someone else charges,
// the owner/manager types their e-mail and password on that screen; this
// function checks them on the server (they never touch the database from the
// browser) and records a one-time approval for that amount, valid 10 minutes,
// which complete_appointment consumes.
import { createClient } from 'npm:@supabase/supabase-js@2.118.0'
import { cors } from '../_shared/cors.ts'

Deno.serve(async (req) => {
  const headers = { ...cors(req), 'Content-Type': 'application/json' }
  const reply = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers })
  if (req.method === 'OPTIONS') return new Response('ok', { headers })
  if (req.method !== 'POST') return reply(405, { error: 'Método no permitido.' })

  const url = Deno.env.get('SUPABASE_URL')!
  const anonKey = (Deno.env.get('SUPABASE_ANON_KEY') ?? Deno.env.get('SUPABASE_PUBLISHABLE_KEY'))!
  const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } })

  // Only someone signed in to the panel can ask.
  const jwt = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '')
  const { data: caller } = await admin.auth.getUser(jwt)
  if (!caller.user) return reply(401, { error: 'Inicia sesión de nuevo.' })

  let body: { email?: string; password?: string; amount?: number }
  try {
    body = await req.json()
  } catch {
    return reply(400, { error: 'Solicitud inválida.' })
  }
  const amount = Number(body.amount)
  if (!Number.isInteger(amount) || amount <= 0)
    return reply(400, { error: 'Escribe el descuento en pesos, sin centavos.' })

  const invalid = () =>
    reply(403, { error: 'La autorización no es válida: usa el correo y la contraseña del dueño o gerente.' })
  const checker = createClient(url, anonKey, { auth: { persistSession: false } })
  const { data: signed, error } = await checker.auth.signInWithPassword({
    email: (body.email ?? '').trim().toLowerCase(),
    password: body.password ?? '',
  })
  if (error || !signed.user) return invalid()
  await checker.auth.signOut()

  const { data: who } = await admin
    .from('profiles')
    .select('id, name, role, active')
    .eq('id', signed.user.id)
    .maybeSingle()
  if (!who?.active || !['owner', 'developer', 'manager'].includes(who.role)) return invalid()

  const { data: approval, error: saveError } = await admin
    .from('discount_approvals')
    .insert({ amount, authorized_by: who.id, authorized_by_name: who.name })
    .select('id')
    .single()
  if (saveError || !approval) return reply(500, { error: 'No se pudo registrar la autorización.' })
  return reply(200, { approvalId: approval.id, authorizedByName: who.name })
})
