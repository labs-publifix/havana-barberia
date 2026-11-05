import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AppProviders } from '@/app/AppProviders'
import type { Appointment } from '@/domain/types'
import { MockBookingRepository } from '@/data/mock/MockBookingRepository'
import { createSeed, type MockDb } from '@/data/mock/seed'
import { zonedInstant } from '@/lib/time'
import AdminApp from './AdminApp'
import { MockAdminRepository } from './data/mock/MockAdminRepository'

const TZ = 'America/Mexico_City'
const DATE = '2026-11-04' // Wednesday: both barbers work
const NOW = zonedInstant(DATE, '12:30', TZ)

let n = 0
const appt = (staffId: string, time: string, status: Appointment['status'], name: string): Appointment => {
  const s = zonedInstant(DATE, time, TZ)
  n++
  return {
    id: `t-${n}`,
    token: `t-${n}`,
    customerId: `c-${n}`,
    customer: { name, phone: '4421234567', email: '' },
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

async function renderAgenda(userId: string, query = `fecha=${DATE}`) {
  const seed = createSeed(NOW)
  const db: MockDb = {
    ...seed,
    blocks: [],
    customers: [],
    loyalty: [],
    appointments: [
      appt('leonardo', '13:30', 'booked', 'Mateo Campos'),
      appt('isaac', '12:15', 'confirmed', 'Pablo Ríos'),
      appt('isaac', '16:00', 'confirmed', 'Óscar Molina'),
    ],
  }
  db.customers = db.appointments.map((a) => ({ id: a.customerId, ...a.customer, createdAt: a.createdAt }))
  const booking = new MockBookingRepository({ storage: null, initial: db, now: () => new Date() })
  const admin = new MockAdminRepository({ storage: null, booking })
  await admin.demo.switchTo(userId)
  const user = userEvent.setup()
  render(
    <AppProviders repository={booking}>
      <MemoryRouter initialEntries={[`/admin/agenda?${query}`]}>
        <Routes>
          <Route path="/admin/*" element={<AdminApp repository={admin} />} />
        </Routes>
      </MemoryRouter>
    </AppProviders>,
  )
  await screen.findAllByRole('list', { name: /Agenda de|Leonardo Gómez,/ })
  return { user, booking }
}

/** Open a dropdown by its label and pick an option (Radix Select). */
async function choose(user: ReturnType<typeof userEvent.setup>, scope: HTMLElement, label: string, option: string) {
  await user.click(within(scope).getByLabelText(label))
  await user.click(await screen.findByRole('option', { name: option }))
}

const column = (name: string) => screen.findByRole('list', { name })
const openAppointment = async (user: ReturnType<typeof userEvent.setup>, col: string, who: RegExp) => {
  await user.click(within(await column(col)).getByRole('button', { name: who }))
  return screen.findByRole('dialog')
}

describe('admin agenda', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(NOW)
  })
  afterEach(() => vi.useRealTimers())

  it('day view: one column per barber with their appointments', async () => {
    await renderAgenda('u-reception')
    expect(screen.getByRole('heading', { level: 2, name: 'Miércoles 4 de noviembre' })).toBeInTheDocument()
    expect(
      within(await column('Agenda de Leonardo Gómez')).getByRole('button', { name: /Mateo Campos/ }),
    ).toBeInTheDocument()
    const isaac = await column('Agenda de Isaac Fuentes')
    expect(within(isaac).getByRole('button', { name: /Pablo Ríos.*en curso/ })).toBeInTheDocument()
  })

  it('confirms an upcoming appointment; completing waits until it starts', async () => {
    const { user } = await renderAgenda('u-reception')
    const panel = await openAppointment(user, 'Agenda de Leonardo Gómez', /Mateo Campos/)
    expect(within(panel).getByRole('button', { name: 'Completar' })).toBeDisabled()
    expect(within(panel).getByRole('button', { name: 'No se presentó' })).toBeDisabled()
    await user.click(within(panel).getByRole('button', { name: 'Confirmar' }))
    expect(await screen.findByText('Cita confirmada')).toBeInTheDocument()
    await waitFor(() => expect(within(panel).getByText('Confirmada')).toBeInTheDocument())
  })

  it('completing an appointment in progress adds a loyalty stamp', async () => {
    const { user } = await renderAgenda('u-owner')
    const panel = await openAppointment(user, 'Agenda de Isaac Fuentes', /Pablo Ríos/)
    await user.click(within(panel).getByRole('button', { name: 'Completar' }))
    expect(await screen.findByText('Cita completada · sello 1 de 10')).toBeInTheDocument()
    await waitFor(() => expect(within(panel).getByRole('img', { name: '1 de 10 sellos' })).toBeInTheDocument())
  })

  it('cancels after confirming in a dialog and frees the slot', async () => {
    const { user } = await renderAgenda('u-manager')
    const panel = await openAppointment(user, 'Agenda de Isaac Fuentes', /Óscar Molina/)
    await user.click(within(panel).getByRole('button', { name: 'Cancelar cita' }))
    const dialog = await screen.findByRole('dialog', { name: '¿Cancelar esta cita?' })
    await user.click(within(dialog).getByRole('button', { name: 'Sí, cancelar' }))
    expect(await screen.findByText('Cita cancelada')).toBeInTheDocument()
    await waitFor(() => expect(within(panel).getByText('Cancelada')).toBeInTheDocument())
    await user.keyboard('{Escape}')
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    await waitFor(async () =>
      expect(
        within(await column('Agenda de Isaac Fuentes')).queryByRole('button', { name: /Óscar Molina/ }),
      ).toBeNull(),
    )
  })

  it('books a new appointment for a new customer from the panel', async () => {
    const { user, booking } = await renderAgenda('u-reception')
    await user.click(screen.getByRole('button', { name: /Nueva cita/ }))
    const panel = await screen.findByRole('dialog', { name: 'Nueva cita' })
    await user.click(within(panel).getByRole('checkbox', { name: /Corte de cabello adulto/ }))
    await choose(user, panel, 'Barbero', 'Isaac Fuentes')
    await waitFor(() => expect(within(panel).getByLabelText('Hora')).toBeEnabled())
    await choose(user, panel, 'Hora', '1:15 p. m.')
    await user.type(within(panel).getByLabelText('Nombre'), 'Tomás Peña')
    await user.type(within(panel).getByLabelText('Teléfono'), '4425550101')
    await user.click(within(panel).getByRole('button', { name: 'Agendar cita' }))

    expect(await screen.findByText('Cita agendada: 1:15 p. m. con Isaac')).toBeInTheDocument()
    const made = booking.snapshot().appointments.find((a) => a.customer.name === 'Tomás Peña')
    expect(made).toMatchObject({ staffId: 'isaac', status: 'confirmed', source: 'panel' })
  })

  it('refuses to block time that has appointments', async () => {
    const { user } = await renderAgenda('u-owner')
    await user.click(screen.getByRole('button', { name: 'Bloquear' }))
    const panel = await screen.findByRole('dialog', { name: 'Bloquear horario' })
    await choose(user, panel, 'Para', 'Leonardo Gómez')
    await choose(user, panel, 'Desde', '1:00 p. m.')
    await choose(user, panel, 'Hasta', '2:00 p. m.')
    await user.click(within(panel).getByRole('button', { name: 'Bloquear horario' }))
    expect(await within(panel).findByText(/Hay 1 cita en ese horario/)).toBeInTheDocument()
  })

  it('week view shows one barber across seven days', async () => {
    await renderAgenda('u-owner', `fecha=${DATE}&vista=semana&barbero=leonardo`)
    expect(await screen.findByRole('heading', { level: 2, name: 'Semana del 2 al 8 de noviembre' })).toBeInTheDocument()
    const lists = await screen.findAllByRole('list', { name: /^Leonardo Gómez, / })
    expect(lists).toHaveLength(7)
  })

  it('a barber sees only their column and cannot create or cancel', async () => {
    const { user } = await renderAgenda('u-isaac')
    await column('Agenda de Isaac Fuentes')
    expect(screen.queryByRole('list', { name: 'Agenda de Leonardo Gómez' })).toBeNull()
    expect(screen.queryByRole('button', { name: /Nueva cita/ })).toBeNull()
    const panel = await openAppointment(user, 'Agenda de Isaac Fuentes', /Pablo Ríos/)
    expect(within(panel).getByRole('button', { name: 'Completar' })).toBeEnabled()
    expect(within(panel).queryByRole('button', { name: 'Cancelar cita' })).toBeNull()
  })
})
