import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { authTemplate, compose, when, type EmailFacts } from '../../supabase/functions/_shared/emails'

const base: EmailFacts = {
  kind: 'confirmation',
  customerName: 'Ana <Ríos>',
  staffName: 'Isaac',
  services: ['Corte adulto', 'Barba'],
  startsAt: '2026-11-12T22:00:00Z', // 4:00 p. m. in Querétaro
  durationMin: 60,
  totalPrice: 500,
  timeZone: 'America/Mexico_City',
  toleranceMin: 10,
  changeCutoffMin: 240,
  manageUrl: null,
  panelUrl: 'https://example.test/admin/agenda',
  assetBase: 'https://example.test/app/',
}

describe('transactional e-mails', () => {
  it('shows the local day and time', () => {
    const { day, time } = when(base.startsAt, base.timeZone)
    expect(day).toBe('jueves, 12 de noviembre')
    expect(time).toMatch(/^4:00 p\.\s?m\.$/)
  })

  it('confirmation: details, policy and contact while online changes are closed', () => {
    const e = compose(base)
    expect(e.subject).toMatch(/^Tu cita está confirmada · jueves, 12 de noviembre, 4:00/)
    expect(e.text).toContain('Listo, Ana. Te esperamos.')
    expect(e.text).toContain('Cuándo: Jueves, 12 de noviembre, 4:00')
    expect(e.text).toContain('Servicios: Corte adulto + Barba · 1\u00a0h')
    expect(e.text).toContain('Total: $500 · pagas en la barbería')
    expect(e.text).toContain('10 minutos de tolerancia')
    expect(e.text).toContain('llámanos al 442\u00a0537\u00a07844, hasta 4\u00a0h antes')
    expect(e.text).not.toContain('Cambiar o cancelar:')
    expect(e.html).toContain('src="https://example.test/app/email/logo-white.png"')
    expect(e.html).not.toContain('<Ríos>')
  })

  it('brand: aqua only on the main button', () => {
    const html = compose(base).html
    expect(html.match(/#14DDB6/g)).toHaveLength(2) // background and border of one button
    expect(html).toContain('>Cómo llegar</a>')
  })

  it('links to change or cancel once online booking opens', () => {
    const e = compose({ ...base, manageUrl: 'https://example.test/cita/abc' })
    expect(e.text).toContain('Cambiar o cancelar: https://example.test/cita/abc')
    expect(e.text).toContain('Puedes cambiar o cancelar hasta 4\u00a0h antes.')
  })

  it('cancellation: no total and no directions', () => {
    const e = compose({ ...base, kind: 'cancellation' })
    expect(e.subject).toMatch(/^Tu cita se canceló/)
    expect(e.text).toContain('(cancelada)')
    expect(e.text).not.toContain('Total')
    expect(e.text).not.toContain('Cómo llegar')
  })

  it('team notice: full name and link to the agenda, no customer policy', () => {
    const e = compose({ ...base, kind: 'team_new' })
    expect(e.subject).toContain('Nueva cita en línea · Ana <Ríos>')
    expect(e.html).toContain('Ana &lt;Ríos&gt; agendó contigo')
    expect(e.text).toContain('Ver agenda: https://example.test/admin/agenda')
    expect(e.text).not.toContain('tolerancia')
  })

  it('reminders', () => {
    expect(compose({ ...base, kind: 'reminder_24h' }).subject).toMatch(/^Te esperamos mañana · 4:00/)
    expect(compose({ ...base, kind: 'reminder_2h' }).subject).toMatch(/^Tu cita es hoy a las 4:00/)
  })

  it.each(['invite', 'recovery'] as const)('Supabase %s template is up to date in supabase/templates', (kind) => {
    const file = readFileSync(resolve(__dirname, `../../supabase/templates/${kind}.html`), 'utf8')
    expect(file).toBe(authTemplate(kind).html)
    expect(file).toContain('href="{{ .ConfirmationURL }}"')
  })
})
