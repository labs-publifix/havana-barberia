// Sends what is waiting in public.email_outbox through Resend. Woken every
// minute by pg_cron (app.mailer_tick) with a shared secret that the deploy
// workflow rotates; it takes no input, so calling it only sends what is due.
//
// Test mode (settings.customer_emails = false): every e-mail goes only to
// EMAIL_BCC with "[Prueba]" in the subject, so the shop can review them before
// customers receive anything.
import { createClient } from 'npm:@supabase/supabase-js@2.118.0'
import {
  compose,
  invitation,
  isCustomerEmail,
  routeEmail,
  shop,
  thankYou,
  ticketLines,
  type EmailKind,
} from '../_shared/emails.ts'

const MAX_ATTEMPTS = 3

interface Outbox {
  id: number
  kind: EmailKind
  appointment_id: string | null
  customer_id: string | null
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
  const site = (Deno.env.get('SITE_URL') || 'https://havanabarberia.com').replace(/\/$/, '')
  const bookingOpen = Deno.env.get('BOOKING_OPEN') === 'true'
  if (!resendKey || !from) return reply(500, { error: 'Faltan RESEND_API_KEY o EMAIL_FROM.' })

  const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { persistSession: false },
  })

  const { data: batch, error } = await db.rpc('claim_emails', { p_limit: 20 })
  if (error) return reply(500, { error: error.message })
  const { data: settings } = await db
    .from('settings')
    .select('customer_emails, team_emails, google_review_url, time_zone, tolerance_min, change_cutoff_min')
    .eq('id', 1)
    .single()
  const live = !!settings?.customer_emails

  const finish = (id: number, patch: Record<string, unknown>) => db.from('email_outbox').update(patch).eq('id', id)
  let sent = 0

  /** Route (test mode, review copy), send through Resend and record the result. */
  const deliver = async (
    row: Outbox,
    to: string,
    also: string[],
    forCustomer: boolean,
    email: { subject: string; html: string; text: string },
    headers?: Record<string, string>,
  ) => {
    const route = routeEmail({ forCustomer, live, to, also, reviewCopy: bcc })
    const recipients = route.to
    if (!recipients.length) {
      await finish(row.id, { status: 'skipped', error: 'Modo prueba sin EMAIL_BCC.' })
      return
    }
    const subject = route.test ? `[Prueba · para ${to}] ${email.subject}` : email.subject
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
        ...(route.bcc.length ? { bcc: route.bcc } : {}),
        subject,
        html: email.html,
        text: email.text,
        ...(headers ? { headers } : {}),
      }),
    })
    if (!res.ok) throw new Error(`Resend ${res.status}: ${(await res.text()).slice(0, 300)}`)
    await finish(row.id, {
      status: 'sent',
      sent_at: new Date().toISOString(),
      to_email: route.test ? to : recipients.join(', '),
      subject: email.subject,
      error: null,
    })
    sent++
  }

  /** Invitation to come back (by customer, not appointment). */
  const invite = async (row: Outbox) => {
    const { data: c } = await db
      .from('customers')
      .select('id, name, email, marketing_opt_out, optout_token')
      .eq('id', row.customer_id!)
      .maybeSingle()
    if (!c?.email) return finish(row.id, { status: 'skipped', error: 'Sin correo de destino.' })
    if (c.marketing_opt_out) return finish(row.id, { status: 'skipped', error: 'Pidió no recibir invitaciones.' })
    const [{ data: last }, { data: card }] = await Promise.all([
      db
        .from('appointments')
        .select('starts_at, staff_id, staff(name, active, archived_at)')
        .eq('customer_id', c.id)
        .eq('status', 'completed')
        .order('starts_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
      db.from('loyalty_cards').select('token, stamps, goal, reward_expires_at').eq('customer_id', c.id).maybeSingle(),
    ])
    const barber = (Array.isArray(last?.staff) ? last?.staff[0] : last?.staff) as
      { name: string; active: boolean; archived_at: string | null } | null | undefined
    // Book with the same barber when they still work here.
    const withBarber = barber?.active && !barber.archived_at ? last!.staff_id : null
    const bookUrl = `${site}/reservar${withBarber ? `?barbero=${encodeURIComponent(withBarber)}` : ''}`
    const unsubscribeUrl = `${site}/baja/${c.optout_token}`
    const email = invitation({
      kind: row.kind as 'winback' | 'new_system',
      customerName: c.name,
      lastVisit: last?.starts_at ?? null,
      staffName: withBarber ? (barber?.name ?? null) : null,
      timeZone: settings?.time_zone ?? 'America/Mexico_City',
      card: card ? { stamps: card.stamps, goal: card.goal, rewardExpiresAt: card.reward_expires_at } : null,
      bookUrl,
      loyaltyUrl: bookingOpen && card ? `${site}/lealtad/${card.token}` : null,
      unsubscribeUrl,
      assetBase: site,
    })
    await deliver(row, c.email, [], true, email, {
      'List-Unsubscribe': `<${unsubscribeUrl}>`,
    })
  }

  for (const row of (batch ?? []) as Outbox[]) {
    try {
      if (row.kind === 'winback' || row.kind === 'new_system') {
        await invite(row)
        continue
      }
      const { data: a } = await db
        .from('appointments')
        .select(
          'id, token, loyalty_token, customer_id, staff_id, service_ids, starts_at, duration_min, total_price, status, customers(name, email), staff(name)',
        )
        .eq('id', row.appointment_id!)
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
      const forCustomer = isCustomerEmail(row.kind)
      let to: string | null
      // The shop's own people who hear about every online booking (Ajustes › Correos).
      let also: string[] = []
      if (forCustomer) {
        to = customer?.email || null
      } else {
        also = ((settings?.team_emails as string[] | null) ?? []).filter(Boolean)
        // The barber's e-mail from Equipo; otherwise the one they sign in with.
        const { data: contact } = await db
          .from('staff_contacts')
          .select('email')
          .eq('staff_id', a.staff_id)
          .maybeSingle()
        const { data: barber } = contact?.email
          ? { data: null }
          : await db.from('profiles').select('email').eq('staff_id', a.staff_id).eq('active', true).maybeSingle()
        to = contact?.email || barber?.email || also[0] || null
      }
      if (!to) {
        await finish(row.id, { status: 'skipped', error: 'Sin correo de destino.' })
        continue
      }

      // "Gracias por tu visita": the payment as charged and the stamps card now.
      const thanks = async () => {
        const [{ data: pay }, { data: card }] = await Promise.all([
          db.from('payments').select('*').eq('appointment_id', a.id).maybeSingle(),
          db
            .from('loyalty_cards')
            .select('token, stamps, goal, reward_expires_at')
            .eq('customer_id', a.customer_id)
            .maybeSingle(),
        ])
        if (!pay) throw new Error('La cita no tiene cobro registrado.')
        const t = ticketLines(pay, (services ?? []) as { id: string; name: string; price: number }[], a.service_ids)
        return thankYou({
          customerName: customer?.name ?? 'Cliente',
          staffName: staff?.name ?? 'tu barbero',
          startsAt: a.starts_at,
          timeZone: settings?.time_zone ?? 'America/Mexico_City',
          lines: t.lines,
          tip: pay.tip,
          total: t.total,
          method: t.method,
          card: card
            ? {
                stamps: card.stamps,
                goal: card.goal,
                rewardExpiresAt: card.reward_expires_at,
                redeemedNow: !!pay.reward_amount,
              }
            : null,
          loyaltyUrl: bookingOpen && card ? `${site}/lealtad/${card.token}` : null,
          reviewUrl: (settings?.google_review_url as string) || shop.reviews,
          bookUrl: bookingOpen ? `${site}/reservar` : null,
          assetBase: site,
        })
      }
      const { data: services } = await db.from('services').select('id, name, price').in('id', a.service_ids)
      const names = (a.service_ids as string[]).map((id) => services?.find((s) => s.id === id)?.name ?? id)
      const email =
        row.kind === 'thank_you'
          ? await thanks()
          : compose({
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
              loyaltyUrl: bookingOpen && a.loyalty_token ? `${site}/lealtad/${a.loyalty_token}` : null,
              panelUrl: `${site}/admin/agenda`,
              assetBase: site,
            })

      // Test mode only holds back customers' e-mails (so nobody gets doubles while
      // AgendaPro still runs); notices to the team always go out.
      await deliver(row, to, also, forCustomer, email)
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e)
      await finish(row.id, { status: row.attempts >= MAX_ATTEMPTS ? 'failed' : 'pending', error: message })
    }
  }
  return reply(200, { sent, taken: batch?.length ?? 0 })
})
