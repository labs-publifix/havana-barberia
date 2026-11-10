// Sends what is waiting in public.email_outbox through Resend. Woken every
// minute by pg_cron (app.mailer_tick) with a shared secret that the deploy
// workflow rotates; it takes no input, so calling it only sends what is due.
//
// Test mode (settings.customer_emails = false): every e-mail goes only to
// EMAIL_BCC with "[Prueba]" in the subject, so the shop can review them before
// customers receive anything.
import { createClient } from 'npm:@supabase/supabase-js@2.118.0'
import { compose, isCustomerEmail, type EmailKind } from '../_shared/emails.ts'

const MAX_ATTEMPTS = 3

interface Outbox {
  id: number
  kind: EmailKind
  appointment_id: string
  attempts: number
}

Deno.serve(async (req) => {
  const reply = (status: number, body: unknown) =>
    new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
  const secret = Deno.env.get('MAILER_SECRET')
  if (!secret || req.headers.get('x-mailer-secret') !== secret) return reply(401, { error: 'unauthorized' })

  const resendKey = Deno.env.get('RESEND_API_KEY')
  const from = Deno.env.get('EMAIL_FROM')
  const bcc = Deno.env.get('EMAIL_BCC') || null
  const site = (Deno.env.get('SITE_URL') || 'https://labs-publifix.github.io/havana-barberia/app').replace(/\/$/, '')
  const bookingOpen = Deno.env.get('BOOKING_OPEN') === 'true'
  if (!resendKey || !from) return reply(500, { error: 'Faltan RESEND_API_KEY o EMAIL_FROM.' })

  const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { persistSession: false },
  })

  const { data: batch, error } = await db.rpc('claim_emails', { p_limit: 20 })
  if (error) return reply(500, { error: error.message })
  const { data: settings } = await db
    .from('settings')
    .select('customer_emails, time_zone, tolerance_min, change_cutoff_min')
    .eq('id', 1)
    .single()
  const live = !!settings?.customer_emails

  const finish = (id: number, patch: Record<string, unknown>) => db.from('email_outbox').update(patch).eq('id', id)
  let sent = 0

  for (const row of (batch ?? []) as Outbox[]) {
    try {
      const { data: a } = await db
        .from('appointments')
        .select(
          'id, token, staff_id, service_ids, starts_at, duration_min, total_price, status, customers(name, email), staff(name)',
        )
        .eq('id', row.appointment_id)
        .maybeSingle()
      if (!a) {
        await finish(row.id, { status: 'skipped', error: 'La cita ya no existe.' })
        continue
      }
      const reminder = row.kind === 'reminder_24h' || row.kind === 'reminder_2h'
      if (reminder && (!['booked', 'confirmed'].includes(a.status) || Date.parse(a.starts_at) <= Date.now())) {
        await finish(row.id, { status: 'skipped', error: 'La cita ya no está activa.' })
        continue
      }

      const customer = (Array.isArray(a.customers) ? a.customers[0] : a.customers) as {
        name: string
        email: string
      } | null
      const staff = (Array.isArray(a.staff) ? a.staff[0] : a.staff) as { name: string } | null
      let to: string | null
      if (isCustomerEmail(row.kind)) {
        to = customer?.email || null
      } else {
        const { data: barber } = await db
          .from('profiles')
          .select('email')
          .eq('staff_id', a.staff_id)
          .eq('active', true)
          .maybeSingle()
        to = barber?.email ?? null
      }
      if (!to) {
        await finish(row.id, { status: 'skipped', error: 'Sin correo de destino.' })
        continue
      }

      const { data: services } = await db.from('services').select('id, name').in('id', a.service_ids)
      const names = (a.service_ids as string[]).map((id) => services?.find((s) => s.id === id)?.name ?? id)
      const email = compose({
        kind: row.kind,
        customerName: customer?.name ?? 'Cliente',
        staffName: staff?.name ?? 'tu barbero',
        services: names,
        startsAt: a.starts_at,
        durationMin: a.duration_min,
        totalPrice: a.total_price,
        timeZone: settings?.time_zone ?? 'America/Mexico_City',
        toleranceMin: settings?.tolerance_min ?? 10,
        changeCutoffMin: settings?.change_cutoff_min ?? 240,
        manageUrl: bookingOpen ? `${site}/cita/${a.token}` : null,
        panelUrl: `${site}/admin/agenda`,
        assetBase: site,
      })

      // Test mode: only the review copy, and it says who would have received it.
      const recipients = live ? [to] : bcc ? [bcc] : []
      if (!recipients.length) {
        await finish(row.id, { status: 'skipped', error: 'Modo prueba sin EMAIL_BCC.' })
        continue
      }
      const subject = live ? email.subject : `[Prueba · para ${to}] ${email.subject}`
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${resendKey}`,
          'Content-Type': 'application/json',
          'Idempotency-Key': `havana-outbox-${row.id}`,
        },
        body: JSON.stringify({
          from,
          to: recipients,
          ...(live && bcc ? { bcc: [bcc] } : {}),
          subject,
          html: email.html,
          text: email.text,
        }),
      })
      if (!res.ok) throw new Error(`Resend ${res.status}: ${(await res.text()).slice(0, 300)}`)
      await finish(row.id, {
        status: 'sent',
        sent_at: new Date().toISOString(),
        to_email: to,
        subject: email.subject,
        error: null,
      })
      sent++
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e)
      await finish(row.id, { status: row.attempts >= MAX_ATTEMPTS ? 'failed' : 'pending', error: message })
    }
  }
  return reply(200, { sent, taken: batch?.length ?? 0 })
})
