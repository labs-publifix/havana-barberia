// Invite a panel user (owner only). Supabase Auth sends the invitation e-mail
// (through the project's SMTP, Resend) with a link to set a password; the
// profile is created here with the chosen role. Runs with the service role,
// which never leaves the server.
import { createClient } from 'npm:@supabase/supabase-js@2.118.0'
import { cors, isAllowedRedirect } from '../_shared/cors.ts'

const ROLES = ['owner', 'manager', 'reception', 'barber'] as const
type Role = (typeof ROLES)[number]

Deno.serve(async (req) => {
  const headers = { ...cors(req), 'Content-Type': 'application/json' }
  const reply = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers })
  if (req.method === 'OPTIONS') return new Response('ok', { headers })
  if (req.method !== 'POST') return reply(405, { error: 'Método no permitido.' })

  const url = Deno.env.get('SUPABASE_URL')!
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const admin = createClient(url, serviceKey, { auth: { persistSession: false } })

  // Who is asking: must be an active owner.
  const jwt = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '')
  const { data: caller } = await admin.auth.getUser(jwt)
  if (!caller.user) return reply(401, { error: 'Inicia sesión de nuevo.' })
  const { data: me } = await admin.from('profiles').select('role, active').eq('id', caller.user.id).maybeSingle()
  if (me?.role !== 'owner' || !me.active) return reply(403, { error: 'Solo la persona dueña administra usuarios.' })

  let body: {
    name?: string
    email?: string
    role?: string
    staffId?: string | null
    password?: string
    redirectTo?: string
  }
  try {
    body = await req.json()
  } catch {
    return reply(400, { error: 'Solicitud inválida.' })
  }
  const name = (body.name ?? '').trim().replace(/\s+/g, ' ')
  const email = (body.email ?? '').trim().toLowerCase()
  const role = body.role as Role
  const staffId = role === 'barber' ? (body.staffId ?? null) : null
  if (!name) return reply(400, { error: 'Escribe el nombre.' })
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return reply(400, { error: 'Revisa el correo.' })
  if (!ROLES.includes(role)) return reply(400, { error: 'Elige el rol.' })
  if (role === 'barber' && !staffId) return reply(400, { error: 'Elige el perfil del barbero en Equipo.' })
  const password = body.password ?? ''
  if (password && password.length < 10)
    return reply(400, { error: 'La contraseña temporal necesita al menos 10 caracteres.' })
  if (body.redirectTo && !isAllowedRedirect(body.redirectTo))
    return reply(400, { error: 'Dirección de regreso no permitida.' })

  const { data: taken } = await admin.from('profiles').select('id').ilike('email', email).maybeSingle()
  if (taken) return reply(409, { error: 'Ya hay un usuario con ese correo.' })
  if (staffId) {
    const { data: linked } = await admin.from('profiles').select('id').eq('staff_id', staffId).maybeSingle()
    if (linked) return reply(409, { error: 'Ese barbero ya tiene un usuario.' })
  }

  // With a temporary password the account is confirmed right away (no e-mail);
  // otherwise an invitation e-mail lets the person choose one.
  const { data: invited, error } = password
    ? await admin.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { name } })
    : await admin.auth.admin.inviteUserByEmail(email, { data: { name }, redirectTo: body.redirectTo })
  if (error || !invited.user)
    return reply(400, {
      error: password
        ? 'No se pudo crear el usuario. Revisa el correo.'
        : 'No se pudo enviar la invitación. Revisa el correo.',
    })

  const profile = { id: invited.user.id, name, email, role, staff_id: staffId, active: true }
  const { error: saveError } = await admin.from('profiles').insert(profile)
  if (saveError) {
    await admin.auth.admin.deleteUser(invited.user.id)
    return reply(400, { error: 'No se pudo guardar el usuario.' })
  }
  return reply(200, { user: profile })
})
