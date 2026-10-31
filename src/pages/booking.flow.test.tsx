import { describe, expect, it, vi, beforeEach } from 'vitest'
import { screen, waitFor, within } from '@testing-library/react'
import { zonedInstant } from '@/lib/time'
import { renderApp, emptyDb } from '@/test/renderApp'

const TZ = 'America/Mexico_City'
// Sunday Nov 1, 2026, 09:00 in Querétaro. Monday Nov 2 is a full working day for Isaac.
const NOW = zonedInstant('2026-11-01', '09:00', TZ)

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(NOW)
})

const continueBtn = () => screen.getByRole('button', { name: /continuar/i })

describe('booking flow', () => {
  it('books one service with a specific barber from start to finish', async () => {
    const { user } = renderApp('/reservar?servicios=corte-adulto', { db: emptyDb(NOW) })

    expect(await screen.findByRole('heading', { name: 'Elige tus servicios' })).toBeInTheDocument()
    expect(await screen.findByText('Corte de cabello adulto')).toBeInTheDocument()
    await user.click(continueBtn())

    await user.click(await screen.findByRole('radio', { name: /Isaac Fuentes/ }))
    await user.click(continueBtn())

    // Sunday (today) Isaac is off, so the step jumps to Monday automatically.
    expect(await screen.findByRole('heading', { name: 'Lunes 2 de noviembre' })).toBeInTheDocument()
    await user.click(await screen.findByRole('button', { name: '10:00 a. m.' }))
    await user.click(continueBtn())

    await user.type(screen.getByLabelText('Nombre'), 'Ana López')
    await user.type(screen.getByLabelText('Teléfono celular'), '(442) 123-4567')
    await user.type(screen.getByLabelText('Correo electrónico'), 'ana@correo.com')
    await user.click(screen.getByRole('checkbox'))
    await user.click(continueBtn())

    expect(await screen.findByRole('heading', { name: 'Revisa y confirma' })).toBeInTheDocument()
    expect(screen.getByText('442 123 4567')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Confirmar cita' }))

    expect(await screen.findByRole('heading', { name: /Tu cita está agendada/ })).toBeInTheDocument()
    expect(screen.getByText('Isaac Fuentes')).toBeInTheDocument()
    expect(await screen.findByText(/Ganas tu sello cuando completes esta cita/)).toBeInTheDocument()
  })

  it('books several services with "first available"', async () => {
    const { user } = renderApp('/reservar', { db: emptyDb(NOW) })
    await user.click(await screen.findByRole('button', { name: /Corte de cabello adulto/ }))
    await user.click(screen.getByRole('button', { name: /Arreglo de bigote/ }))
    expect(screen.getByText('2 servicios · 1 h')).toBeInTheDocument()
    expect(screen.getAllByText('$430').length).toBeGreaterThan(0)
    await user.click(continueBtn())
    await user.click(await screen.findByRole('radio', { name: /Primero disponible/ }))
    await user.click(continueBtn())
    // Sunday: only Leonardo works 10:00–15:00; a 60-minute booking can start at 14:00 at the latest.
    expect(await screen.findByRole('heading', { name: 'Domingo 1 de noviembre' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '2:00 p. m.' })).toBeEnabled()
    expect(screen.queryByRole('button', { name: '2:15 p. m.' })).not.toBeInTheDocument()
    // 09:00 + 1 h notice: 10:00 is the first bookable time.
    expect(screen.getByRole('button', { name: '10:00 a. m.' })).toBeEnabled()
  })

  it('validates contact details and keeps what was typed', async () => {
    const { user } = renderApp('/reservar?paso=3&servicios=corte-adulto&barbero=isaac&fecha=2026-11-02', {
      db: emptyDb(NOW),
    })
    await user.click(await screen.findByRole('button', { name: '11:00 a. m.' }))
    await user.click(continueBtn())
    await user.type(screen.getByLabelText('Nombre'), 'Ana')
    await user.type(screen.getByLabelText('Teléfono celular'), '442 123')
    await user.type(screen.getByLabelText('Correo electrónico'), 'ana@correo')
    await user.click(continueBtn())
    expect(await screen.findByText(/deben ser 10 dígitos/)).toBeInTheDocument()
    expect(screen.getByText(/Revisa el correo/)).toBeInTheDocument()
    expect(screen.getByText(/Acepta el aviso de privacidad/)).toBeInTheDocument()
    expect(screen.getByLabelText('Nombre')).toHaveValue('Ana')
  })

  it('shows taken times as unavailable and a few-slots warning', async () => {
    const db = emptyDb(NOW)
    // Fill Monday for Isaac except 19:45.
    const iso = (t: string) => zonedInstant('2026-11-02', t, TZ).toISOString()
    db.appointments.push(
      ...[
        ['10:00', '14:00'],
        ['15:00', '19:45'],
      ].map(([s, e], i) => ({
        id: `x${i}`,
        token: `x${i}`,
        customerId: 'c',
        customer: { name: 'x', phone: '4420000000', email: 'x@x.com' },
        staffId: 'isaac',
        serviceIds: ['corte-adulto'],
        startsAt: iso(s!),
        endsAt: iso(e!),
        durationMin: 0,
        totalPrice: 0,
        status: 'booked' as const,
        notes: '',
        createdAt: '',
        loyaltyToken: null,
      })),
    )
    renderApp('/reservar?paso=3&servicios=corte-adulto&barbero=isaac&fecha=2026-11-02', { db })
    expect(await screen.findByText('Pocos horarios.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '10:00 a. m., no disponible' })).toBeDisabled()
    expect(screen.getByRole('button', { name: '7:45 p. m.' })).toBeEnabled()
  })

  it('redirects deep links with missing choices to the right step', async () => {
    renderApp('/reservar?paso=4&servicios=corte-adulto', { db: emptyDb(NOW) })
    expect(await screen.findByRole('heading', { name: 'Elige tu barbero' })).toBeInTheDocument()
  })
})

describe('manage appointment', () => {
  it('cancels with confirmation when more than 4 hours away', async () => {
    const { user } = renderApp('/cita/demo-cita')
    await user.click(await screen.findByRole('button', { name: 'Cancelar cita' }))
    const dialog = await screen.findByRole('dialog')
    await user.click(within(dialog).getByRole('button', { name: 'Sí, cancelar cita' }))
    await waitFor(() => expect(screen.getByText('Cancelada')).toBeInTheDocument())
    expect(screen.getByRole('link', { name: 'Reservar otra cita' })).toBeInTheDocument()
  })

  it('blocks online changes within 4 hours and offers a call', async () => {
    const seedNow = NOW
    renderApp('/cita/demo-cita', { now: seedNow })
    await screen.findByRole('heading', { name: 'Tu cita' })
    // Move the clock to 3 hours before the demo appointment.
    const start = Date.parse(
      (await import('@/data/mock/seed')).createSeed(seedNow).appointments.find((a) => a.token === 'demo-cita')!
        .startsAt,
    )
    vi.setSystemTime(new Date(start - 3 * 3600_000))
    const { unmount } = renderApp('/cita/demo-cita', { now: seedNow })
    expect(await screen.findAllByText(/Faltan menos de 4 horas/)).not.toHaveLength(0)
    expect(screen.getAllByRole('link', { name: /Llamar al 442 537 7844/ })[0]).toHaveAttribute(
      'href',
      'tel:+524425377844',
    )
    unmount()
  })
})

describe('home', () => {
  it('shows "Abierto ahora" during business hours', async () => {
    vi.setSystemTime(zonedInstant('2026-11-02', '11:00', TZ))
    renderApp('/')
    expect(await screen.findByText(/Abierto ahora/)).toBeInTheDocument()
    expect(await screen.findAllByRole('button', { name: /Corte de cabello adulto/ })).toHaveLength(1)
  })

  it('shows when it opens next when closed', async () => {
    vi.setSystemTime(zonedInstant('2026-11-01', '16:00', TZ)) // Sunday after closing
    renderApp('/')
    expect(await screen.findByText('Cerrado · abre mañana a las 10:00 a. m.')).toBeInTheDocument()
  })
})

describe('not found', () => {
  it('offers a way back to booking', async () => {
    renderApp('/no-existe')
    expect(await screen.findByRole('heading', { name: 'Esta página no existe' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Reservar cita' })).toBeInTheDocument()
  })
})
