import { render, screen, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AppProviders } from '@/app/AppProviders'
import type { Appointment } from '@/domain/types'
import { MockBookingRepository } from '@/data/mock/MockBookingRepository'
import { createSeed } from '@/data/mock/seed'
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
    customer: { name, phone: '4421234567', email: `c${n}@ejemplo.com` },
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

async function renderOverview(userId: string) {
  const db = {
    ...createSeed(NOW),
    blocks: [],
    appointments: [
      appt('leonardo', '10:00', 'completed', 'Bruno Peña'),
      appt('leonardo', '11:00', 'no_show', 'Raúl Ortega'),
      appt('leonardo', '13:30', 'booked', 'Mateo Campos'),
      appt('isaac', '12:15', 'confirmed', 'Pablo Ríos'),
      appt('isaac', '16:00', 'confirmed', 'Óscar Molina'),
    ],
  }
  const booking = new MockBookingRepository({ storage: null, initial: db, now: () => NOW })
  const admin = new MockAdminRepository({ storage: null, booking })
  await admin.demo.switchTo(userId)
  render(
    <AppProviders repository={booking}>
      <MemoryRouter initialEntries={['/admin/inicio']}>
        <Routes>
          <Route path="/admin/*" element={<AdminApp repository={admin} />} />
        </Routes>
      </MemoryRouter>
    </AppProviders>,
  )
  return screen.findByText('Siguiente cita')
}

describe('admin overview', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(NOW)
  })
  afterEach(() => vi.useRealTimers())

  it('shows the next appointment, the day count, occupancy and value for the owner', async () => {
    await renderOverview('u-owner')
    const next = screen.getByText('Siguiente cita').closest('div')!.parentElement!
    expect(within(next).getByText('1:30 p. m.')).toBeInTheDocument()
    expect(within(next).getByText(/Mateo Campos · con Leonardo/)).toBeInTheDocument()
    expect(within(next).getByText('1 cita en curso')).toBeInTheDocument()

    const count = screen.getByText('Citas de hoy').parentElement!.parentElement!
    expect(within(count).getByText('5')).toBeInTheDocument()
    expect(within(count).getByText('1 completada · 3 por atender')).toBeInTheDocument()
    expect(screen.getByRole('meter', { name: 'Ocupación del día' })).toBeInTheDocument()
    // 4 appointments count (no-show excluded) at $280.
    expect(screen.getByText('Valor de las citas').parentElement!.parentElement).toHaveTextContent('$1,120')
  })

  it('lists upcoming appointments and what needs attention', async () => {
    await renderOverview('u-reception')
    const upcoming = screen.getByRole('heading', { name: 'Próximas citas' }).closest('section')!
    const items = within(upcoming).getAllByRole('listitem')
    expect(items.map((li) => li.textContent)).toEqual([
      expect.stringContaining('Mateo Campos'),
      expect.stringContaining('Óscar Molina'),
    ])
    // One badge for phones and one for wider screens; CSS shows only one.
    expect(within(items[0]!).getAllByText('Sin confirmar').length).toBeGreaterThan(0)
    expect(within(items[1]!).queryByText('Sin confirmar')).not.toBeInTheDocument()

    const alerts = screen.getByRole('heading', { name: 'Pendientes y avisos' }).closest('section')!
    expect(alerts).toHaveTextContent('Por confirmar: Mateo Campos, 1:30 p. m. con Leonardo')
    expect(alerts).toHaveTextContent('Tel. 442 123 4567')
    expect(alerts).toHaveTextContent('No se presentó: Raúl Ortega, 11:00 a. m. con Leonardo')

    // Reception does not see money.
    expect(screen.queryByText('Valor de las citas')).not.toBeInTheDocument()
    expect(screen.getByText('Por confirmar')).toBeInTheDocument()
  })

  it('draws each barber on the timeline with accessible descriptions', async () => {
    await renderOverview('u-manager')
    const leo = screen.getByRole('list', { name: 'Citas de Leonardo Gómez' })
    expect(within(leo).getAllByRole('listitem')).toHaveLength(3)
    expect(leo).toHaveTextContent('11:00 a. m., Raúl Ortega, Corte de cabello adulto, no se presentó')
    const isaac = screen.getByRole('list', { name: 'Citas de Isaac Fuentes' })
    expect(isaac).toHaveTextContent('12:15 p. m., Pablo Ríos, Corte de cabello adulto, en curso')
  })

  it('a barber sees only their own day and no money', async () => {
    await renderOverview('u-isaac')
    expect(screen.getByText('Tus citas de hoy')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Tu día' })).toBeInTheDocument()
    expect(screen.queryByRole('list', { name: 'Citas de Leonardo Gómez' })).not.toBeInTheDocument()
    expect(screen.queryByText(/Mateo Campos/)).not.toBeInTheDocument()
    expect(screen.queryByText('Valor de las citas')).not.toBeInTheDocument()
    const next = screen.getByText('Siguiente cita').closest('div')!.parentElement!
    expect(within(next).getByText('4:00 p. m.')).toBeInTheDocument()
  })
})
