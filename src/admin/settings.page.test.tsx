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
const NOW = zonedInstant('2026-11-01', '09:00', TZ)

async function renderSettings(
  path = '/admin/ajustes',
  userId = 'u-owner',
  prepare?: (b: MockBookingRepository) => Promise<unknown>,
) {
  const db: MockDb = { ...createSeed(NOW), appointments: [], blocks: [] }
  const booking = new MockBookingRepository({ storage: null, initial: db, now: () => new Date() })
  await prepare?.(booking)
  const admin = new MockAdminRepository({ storage: null, booking })
  await admin.demo.switchTo(userId)
  const user = userEvent.setup()
  render(
    <AppProviders repository={booking}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/admin/*" element={<AdminApp repository={admin} />} />
        </Routes>
      </MemoryRouter>
    </AppProviders>,
  )
  return { user, booking, admin }
}

const pick = async (user: ReturnType<typeof userEvent.setup>, label: string, option: string) => {
  await user.click(screen.getByRole('combobox', { name: label }))
  await user.click(await screen.findByRole('option', { name: option }))
}

describe('admin settings', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(NOW)
  })
  afterEach(() => vi.useRealTimers())

  it('changes booking rules, previews the customer text and saves them for the site', async () => {
    const { user, booking } = await renderSettings()
    await screen.findByText('Reservas en línea')
    expect(screen.queryByRole('region', { name: 'Cambios sin guardar' })).toBeNull()
    await pick(user, 'Cancelar o reprogramar hasta', '1 día antes')
    await pick(user, 'Tolerancia', '15 minutos')
    expect(screen.getByRole('complementary', { name: 'Así lo lee el cliente' })).toHaveTextContent(
      'Cancelan o reprograman en línea hasta 1 día antes. Se les espera 15 minutos',
    )
    const bar = screen.getByRole('region', { name: 'Cambios sin guardar' })
    await user.click(within(bar).getByRole('button', { name: 'Guardar cambios' }))
    expect(await screen.findByText('Ajustes guardados')).toBeInTheDocument()
    expect(await booking.getPolicy()).toMatchObject({ changeCutoffMin: 1440, toleranceMin: 15 })
    await waitFor(() => expect(screen.queryByRole('region', { name: 'Cambios sin guardar' })).toBeNull())
  })

  it('sets the loyalty goal and which services earn a stamp', async () => {
    const { user, booking } = await renderSettings('/admin/ajustes?vista=lealtad')
    await screen.findByText('Tarjeta de lealtad')
    await pick(user, 'Sellos para el corte gratis', '8 sellos')
    expect(screen.getByText('Pasarás de 10 a 8 sellos')).toBeInTheDocument()
    const eligible = () =>
      booking
        .adminSettings()
        .services.filter((s) => s.loyaltyEligible)
        .map((s) => s.id)
    const before = eligible()
    const sw = screen.getByRole('switch', { name: 'Barba premium' })
    expect(sw).toHaveAttribute('aria-checked', String(before.includes('barba-premium')))
    await user.click(sw)
    await user.click(screen.getByRole('button', { name: 'Guardar cambios' }))
    await waitFor(async () => expect((await booking.getPolicy()).loyaltyGoal).toBe(8))
    expect(eligible().includes('barba-premium')).toBe(!before.includes('barba-premium'))
    expect(eligible().length).toBe(before.length + (before.includes('barba-premium') ? -1 : 1))
  })

  it('the owner gives a barber access; the role matrix shows what each role sees', async () => {
    const { user, admin } = await renderSettings('/admin/ajustes?vista=usuarios', 'u-owner', (b) =>
      b.adminSaveStaff({
        name: 'Mario Peña',
        title: '',
        photoUrl: null,
        active: true,
        schedule: b.adminTeam().staff[0]!.schedule,
        serviceIds: ['corte-adulto'],
      }),
    )
    await screen.findByRole('list', { name: 'Usuarios' })
    await user.click(await screen.findByRole('button', { name: 'Dar acceso a Mario Peña' }))
    const panel = await screen.findByRole('dialog', { name: 'Nuevo usuario' })
    expect(within(panel).getByLabelText('Nombre')).toHaveValue('Mario Peña')
    expect(within(panel).getByRole('radio', { name: /Barbero/ })).toBeChecked()
    await user.type(within(panel).getByLabelText('Correo'), 'mario@havana.test')
    // With a temporary password the account is created without an invitation e-mail.
    await user.type(within(panel).getByLabelText(/Contraseña temporal/), 'Havana-2026!')
    await user.click(within(panel).getByRole('button', { name: 'Crear usuario' }))
    expect(await screen.findByText('Mario Peña ya puede entrar con su contraseña temporal')).toBeInTheDocument()
    const mario = (await admin.listUsers()).find((u) => u.email === 'mario@havana.test')
    expect(mario).toMatchObject({ role: 'barber', mfaRequired: false })

    const matrix = screen.getByRole('table', { name: 'Secciones del panel por rol' })
    const row = within(matrix).getByRole('row', { name: /Cierre y nómina/ })
    // Owner, developer and manager.
    expect(within(row).getAllByLabelText('Sí')).toHaveLength(3)
  })

  it('the manager edits rules but only sees users', async () => {
    const { user } = await renderSettings('/admin/ajustes', 'u-manager')
    await screen.findByText('Reservas en línea')
    await user.click(screen.getByRole('tab', { name: 'Usuarios y roles' }))
    await screen.findByRole('list', { name: 'Usuarios' })
    expect(screen.getByText('Solo la persona dueña los administra')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Invitar usuario|Editar a/ })).toBeNull()
  })

  it('reception cannot open Ajustes', async () => {
    await renderSettings('/admin/ajustes', 'u-reception')
    expect(await screen.findByText('Esta sección no está disponible para tu rol')).toBeInTheDocument()
  })
})
