import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AppProviders } from '@/app/AppProviders'
import type { Appointment, Customer } from '@/domain/types'
import { MockBookingRepository } from '@/data/mock/MockBookingRepository'
import { createSeed, type MockDb } from '@/data/mock/seed'
import { addDays, zonedInstant } from '@/lib/time'
import AdminApp from './AdminApp'
import { MockAdminRepository } from './data/mock/MockAdminRepository'

const TZ = 'America/Mexico_City'
const TODAY = '2026-11-04'
const NOW = zonedInstant(TODAY, '12:30', TZ)

const person = (id: string, name: string, phone: string, notes?: string): Customer => ({
  id,
  name,
  phone,
  email: `${id}@ejemplo.com`,
  createdAt: zonedInstant('2025-03-10', '10:00', TZ).toISOString(),
  notes,
})
let n = 0
const appt = (c: Customer, dayOffset: number, status: Appointment['status'], staffId = 'leonardo'): Appointment => {
  const s = zonedInstant(addDays(TODAY, dayOffset), '17:00', TZ)
  n++
  return {
    id: `h-${n}`,
    token: `h-${n}`,
    customerId: c.id,
    customer: { name: c.name, phone: c.phone, email: c.email },
    staffId,
    serviceIds: ['corte-adulto'],
    startsAt: s.toISOString(),
    endsAt: new Date(s.getTime() + 45 * 60000).toISOString(),
    durationMin: 45,
    totalPrice: 280,
    status,
    notes: '',
    createdAt: s.toISOString(),
    loyaltyToken: null,
  }
}

const ana = person('ana', 'Ana Ríos', '4421112233', 'Prefiere tijera.')
const beto = person('beto', 'Beto Gómez', '4429990000')
const caro = person('caro', 'Carolina Peña', '4425556677')

async function renderCustomers(userId = 'u-reception', path = '/admin/clientes') {
  const db: MockDb = {
    ...createSeed(NOW),
    blocks: [],
    customers: [ana, beto, caro],
    loyalty: [
      { token: 'card-ana', customerId: 'ana', customerFirstName: 'Ana', stamps: 7, goal: 10, rewardExpiresAt: null },
      {
        token: 'card-caro',
        customerId: 'caro',
        customerFirstName: 'Carolina',
        stamps: 10,
        goal: 10,
        rewardExpiresAt: zonedInstant('2027-01-03', '23:59', TZ).toISOString(),
      },
    ],
    appointments: [
      appt(ana, -40, 'completed'),
      appt(ana, -12, 'completed'),
      appt(ana, -3, 'completed', 'isaac'),
      appt(ana, 2, 'confirmed'),
      appt(beto, -60, 'no_show'),
      appt(beto, -30, 'no_show'),
      appt(beto, -5, 'no_show'),
      appt(caro, -20, 'completed'),
    ],
  }
  const booking = new MockBookingRepository({ storage: null, initial: db, now: () => new Date() })
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
  return { user, booking }
}

const names = (table: HTMLElement) =>
  within(table)
    .getAllByRole('row')
    .slice(1)
    .map((r) => within(r).getAllByRole('cell')[0]!.textContent)

describe('admin customers', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(NOW)
  })
  afterEach(() => vi.useRealTimers())

  it('lists customers by last visit and searches by name or phone', async () => {
    const { user } = await renderCustomers()
    const table = await screen.findByRole('table', { name: 'Clientes' })
    await waitFor(() => expect(names(table)).toEqual(['Ana Ríos', 'Carolina Peña', 'Beto Gómez']))
    expect(within(table).getByText('Hace 3 días')).toBeInTheDocument()

    await user.type(screen.getByLabelText('Buscar cliente'), 'gomez')
    expect(names(table)).toEqual(['Beto Gómez'])
    await user.clear(screen.getByLabelText('Buscar cliente'))
    await user.type(screen.getByLabelText('Buscar cliente'), '555 66')
    expect(names(table)).toEqual(['Carolina Peña'])
  })

  it('filters by upcoming, no-shows and free cut, with counts', async () => {
    const { user } = await renderCustomers()
    const table = await screen.findByRole('table', { name: 'Clientes' })
    await waitFor(() => expect(names(table)).toHaveLength(3))
    const filters = screen.getByRole('radiogroup', { name: 'Filtrar clientes' })
    expect(within(filters).getByRole('radio', { name: /Con no-shows/ })).toHaveTextContent('1')
    await user.click(within(filters).getByRole('radio', { name: /Con cita/ }))
    expect(names(table)).toEqual(['Ana Ríos'])
    await user.click(within(filters).getByRole('radio', { name: /Corte gratis/ }))
    expect(names(table)).toEqual(['Carolina Peña'])
    await user.click(within(filters).getByRole('radio', { name: /Frecuentes/ }))
    expect(names(table)).toEqual(['Ana Ríos'])
  })

  it('opens a profile with stats, loyalty, upcoming and history', async () => {
    const { user } = await renderCustomers()
    const table = await screen.findByRole('table', { name: 'Clientes' })
    await user.click(await within(table).findByRole('button', { name: 'Ana Ríos' }))
    const panel = await screen.findByRole('dialog', { name: 'Ana Ríos' })
    expect(panel).toHaveTextContent('Cliente desde marzo de 2025 · 3 visitas')
    expect(within(panel).getByRole('img', { name: '7 de 10 sellos' })).toBeInTheDocument()
    expect(panel).toHaveTextContent('Le faltan 3 para el corte gratis.')
    expect(panel).toHaveTextContent('Próximas citas (1)')
    expect(panel).toHaveTextContent('Historial (3)')
    expect(within(panel).getByRole('link', { name: /WhatsApp/ })).toHaveAttribute('href', 'https://wa.me/524421112233')
    expect(within(panel).getByLabelText(/Notas del cliente/)).toHaveValue('Prefiere tijera.')
    // Reception does not see spend; it sees cancellations instead.
    expect(panel).not.toHaveTextContent('Total gastado')
  })

  it('warns about 3 no-shows in 90 days', async () => {
    await renderCustomers('u-owner', '/admin/clientes?cliente=beto')
    const panel = await screen.findByRole('dialog', { name: 'Beto Gómez' })
    expect(await within(panel).findByText('3 no-shows en los últimos 90 días')).toBeInTheDocument()
    expect(panel).toHaveTextContent('Total gastado')
  })

  it('edits contact details and notes', async () => {
    const { user, booking } = await renderCustomers('u-manager', '/admin/clientes?cliente=ana')
    const panel = await screen.findByRole('dialog', { name: 'Ana Ríos' })
    const name = await within(panel).findByLabelText('Nombre')
    await user.clear(name)
    await user.type(name, 'Ana Ríos Lara')
    await user.click(within(panel).getByRole('button', { name: 'Guardar cambios' }))
    expect(await screen.findByText('Datos del cliente guardados')).toBeInTheDocument()
    expect(booking.snapshot().customers.find((c) => c.id === 'ana')?.name).toBe('Ana Ríos Lara')
  })

  it('"Agendar cita" from the profile opens the booking panel with the customer chosen', async () => {
    const { user } = await renderCustomers('u-reception', '/admin/clientes?cliente=caro')
    const panel = await screen.findByRole('dialog', { name: 'Carolina Peña' })
    await user.click(await within(panel).findByRole('button', { name: 'Agendar cita' }))
    const bookingPanel = await screen.findByRole('dialog', { name: 'Agendar cita' })
    expect(within(bookingPanel).getByRole('button', { name: 'Quitar cliente' })).toBeInTheDocument()
    expect(bookingPanel).toHaveTextContent('Carolina Peña')
  })

  it('barbers cannot open Clientes', async () => {
    await renderCustomers('u-leonardo')
    expect(await screen.findByText('Esta sección no está disponible para tu rol')).toBeInTheDocument()
  })
})
