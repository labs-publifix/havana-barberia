import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AppProviders } from '@/app/AppProviders'
import { MockBookingRepository } from '@/data/mock/MockBookingRepository'
import { createSeed, type MockDb } from '@/data/mock/seed'
import { zonedInstant } from '@/lib/time'
import AdminApp from './AdminApp'
import { MockAdminRepository } from './data/mock/MockAdminRepository'

const TZ = 'America/Mexico_City'
const NOW = zonedInstant('2026-11-01', '09:00', TZ) // Sunday
const MONDAY = '2026-11-02'

async function renderTeam(userId = 'u-owner') {
  const db: MockDb = { ...createSeed(NOW), appointments: [], blocks: [] }
  const booking = new MockBookingRepository({ storage: null, initial: db, now: () => new Date() })
  const admin = new MockAdminRepository({ storage: null, booking })
  await admin.demo.switchTo(userId)
  const user = userEvent.setup()
  render(
    <AppProviders repository={booking}>
      <MemoryRouter initialEntries={['/admin/equipo']}>
        <Routes>
          <Route path="/admin/*" element={<AdminApp repository={admin} />} />
        </Routes>
      </MemoryRouter>
    </AppProviders>,
  )
  await screen.findByRole('list', { name: 'Equipo' })
  return { user, booking }
}

const open = async (user: ReturnType<typeof userEvent.setup>, name: string) => {
  await user.click(screen.getByRole('button', { name: new RegExp(`(Editar|Ver) a ${name}`) }))
  return screen.findByRole('dialog', { name })
}

describe('admin team', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(NOW)
  })
  afterEach(() => vi.useRealTimers())

  it('lists the team with today, weekly hours, services and commission', async () => {
    await renderTeam()
    const cards = within(screen.getByRole('list', { name: 'Equipo' })).getAllByRole('listitem')
    expect(cards.map((c) => within(c).getAllByRole('button')[0]!.textContent)).toEqual([
      'Leonardo Gómez',
      'Isaac Fuentes',
    ])
    // Sunday: Leonardo works 10–3, Isaac rests.
    expect(cards[0]).toHaveTextContent('Hoy10:00 a. m. – 3:00 p. m.')
    expect(cards[1]).toHaveTextContent('HoyDescansa')
    expect(cards[0]).toHaveTextContent('ServiciosTodos')
    expect(cards[0]).toHaveTextContent('ComisiónSin capturar')
  })

  it('changes the schedule and lists appointments left outside it', async () => {
    const { user, booking } = await renderTeam()
    await booking.createAppointment({
      serviceIds: ['corte-adulto'],
      staffId: 'isaac',
      startsAt: zonedInstant(MONDAY, '10:00', TZ).toISOString(),
      customer: { name: 'Ana Ríos', phone: '4421112233', email: 'ana@ejemplo.com' },
      notes: '',
      privacyAccepted: true,
    })
    const panel = await open(user, 'Isaac Fuentes')
    await user.click(within(panel).getByRole('tab', { name: 'Horario' }))
    const monday = within(panel).getAllByRole('switch', { name: 'Trabaja' })[0]!
    await user.click(monday)
    await user.click(within(panel).getByRole('button', { name: 'Guardar cambios' }))

    expect(await within(panel).findByText('1 cita próxima queda fuera de su horario o servicios')).toBeInTheDocument()
    expect(within(panel).getByRole('link', { name: /Lun 2 de nov, 10:00 a\. m\. · Ana Ríos/ })).toBeInTheDocument()
    const slots = await booking.getAvailableSlots({ serviceIds: ['corte-adulto'], staffId: 'isaac', date: MONDAY })
    expect(slots.every((s) => !s.available)).toBe(true)
  })

  it('turns services on and off with a switch each', async () => {
    const { user, booking } = await renderTeam()
    const panel = await open(user, 'Leonardo Gómez')
    await user.click(within(panel).getByRole('tab', { name: 'Servicios (14)' }))
    await user.click(within(panel).getByRole('switch', { name: 'Tinte de cabello' }))
    expect(within(panel).getByRole('tab', { name: 'Servicios (13)' })).toBeInTheDocument()
    await user.click(within(panel).getByRole('button', { name: 'Guardar cambios' }))
    await waitFor(() => expect(booking.adminCatalog().staffFor['tinte-cabello']).toEqual(['isaac']))
  })

  it('sets a commission by percent with a per-service amount, previewing what he earns', async () => {
    const { user, booking } = await renderTeam()
    const panel = await open(user, 'Leonardo Gómez')
    await user.click(within(panel).getByRole('tab', { name: 'Comisión' }))
    await user.type(within(panel).getByLabelText('Porcentaje general'), '40')
    const rows = within(panel).getAllByRole('listitem')
    const corte = rows.find((r) => r.textContent?.includes('Corte de cabello adulto'))!
    expect(corte).toHaveTextContent('$112')
    await user.type(within(panel).getByLabelText('Comisión en Barba premium'), '50')
    expect(rows.find((r) => r.textContent?.includes('Barba premium'))).toHaveTextContent('$265')
    await user.click(within(panel).getByRole('button', { name: 'Guardar cambios' }))

    await waitFor(() =>
      expect(booking.adminTeam().commissions.find((c) => c.staffId === 'leonardo')).toEqual({
        staffId: 'leonardo',
        mode: 'percent',
        value: 40,
        overrides: { 'barba-premium': 50 },
      }),
    )
    const card = within(screen.getByRole('list', { name: 'Equipo' })).getAllByRole('listitem')[0]!
    await waitFor(() => expect(card).toHaveTextContent('40% por servicio · 1 personalizado'))
  })

  it('adds a new barber', async () => {
    const { user, booking } = await renderTeam()
    await user.click(screen.getByRole('button', { name: /Nuevo barbero/ }))
    const panel = await screen.findByRole('dialog', { name: 'Nuevo barbero' })
    await user.type(within(panel).getByLabelText('Nombre'), 'Mario Peña')
    await user.type(within(panel).getByLabelText(/Título/), 'Barbero junior')
    await user.click(within(panel).getByRole('button', { name: 'Agregar barbero' }))
    expect(await screen.findByText('Mario Peña agregado al equipo')).toBeInTheDocument()
    expect((await booking.listStaff()).map((s) => s.name)).toContain('Mario Peña')
  })

  it('registers time off that blocks booking those days', async () => {
    const { user, booking } = await renderTeam()
    const panel = await open(user, 'Isaac Fuentes')
    await user.click(within(panel).getByRole('tab', { name: 'Ausencias' }))
    await user.click(within(panel).getByLabelText('Desde'))
    await user.click(await screen.findByRole('button', { name: 'Lunes 2 de noviembre de 2026' }))
    await user.click(within(panel).getByRole('button', { name: /Bloquear esos días/ }))
    expect(await screen.findByText('Ausencia registrada')).toBeInTheDocument()
    expect(await within(panel).findByText('Lunes 2 de noviembre')).toBeInTheDocument()
    const slots = await booking.getAvailableSlots({ serviceIds: ['corte-adulto'], staffId: 'isaac', date: MONDAY })
    expect(slots.every((s) => !s.available)).toBe(true)
  })

  it('reception sees schedules read-only, no commission, and can still record time off', async () => {
    const { user } = await renderTeam('u-reception')
    const cards = within(screen.getByRole('list', { name: 'Equipo' })).getAllByRole('listitem')
    expect(cards[0]).not.toHaveTextContent('Comisión')
    const panel = await open(user, 'Leonardo Gómez')
    expect(within(panel).queryByRole('tab', { name: 'Comisión' })).toBeNull()
    expect(within(panel).getByLabelText('Nombre')).toBeDisabled()
    await user.click(within(panel).getByRole('tab', { name: 'Ausencias' }))
    expect(within(panel).getByRole('button', { name: /Bloquear esos días/ })).toBeEnabled()
  })
})
