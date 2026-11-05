import { act, render, screen, waitFor, within } from '@testing-library/react'
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
const DATE = '2026-11-04' // Wednesday
const NOW = zonedInstant(DATE, '09:30', TZ)

const appt = (staffId: string, time: string, name: string, notes = ''): Appointment => {
  const s = zonedInstant(DATE, time, TZ)
  return {
    id: `x-${time}`,
    token: `x-${time}`,
    customerId: `cx-${time}`,
    customer: { name, phone: '4421234567', email: '' },
    staffId,
    serviceIds: ['corte-adulto'],
    startsAt: s.toISOString(),
    endsAt: new Date(s.getTime() + 45 * 60000).toISOString(),
    durationMin: 45,
    totalPrice: 280,
    status: 'confirmed',
    notes,
    createdAt: s.toISOString(),
    loyaltyToken: null,
  }
}

async function setup(path: string, userId = 'u-reception') {
  const db: MockDb = {
    ...createSeed(NOW),
    blocks: [],
    appointments: [appt('leonardo', '11:00', 'Bruno Peña', 'Prefiere tijera, no máquina')],
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
  return { user, booking, admin }
}

const book = (booking: MockBookingRepository, staffId: string, time: string) =>
  booking.createAppointment({
    serviceIds: ['corte-adulto'],
    staffId,
    startsAt: zonedInstant(DATE, time, TZ).toISOString(),
    customer: { name: 'Gael Cordero', phone: '4427778899', email: 'gael@ejemplo.com' },
    notes: '',
    privacyAccepted: true,
  })

describe('live updates and notifications', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(NOW)
    window.localStorage.clear()
  })
  afterEach(() => vi.useRealTimers())

  it('an online booking pops a card, counts in the bell and appears in the agenda without reloading', async () => {
    const { user, booking } = await setup(`/admin/agenda?fecha=${DATE}`)
    const isaac = await screen.findByRole('list', { name: 'Agenda de Isaac Fuentes' })
    expect(within(isaac).queryByRole('button', { name: /Gael Cordero/ })).toBeNull()

    await act(() => book(booking, 'isaac', '12:00'))

    const region = screen.getByRole('region', { name: 'Avisos nuevos' })
    expect(await within(region).findByText('Nueva cita en línea')).toBeInTheDocument()
    expect(region).toHaveTextContent('Gael Cordero')
    expect(region).toHaveTextContent('Mié 4 de nov, 12:00 p. m. con Isaac')
    expect(screen.getByRole('button', { name: 'Avisos, 1 sin leer' })).toBeInTheDocument()
    await waitFor(() =>
      expect(
        within(screen.getByRole('list', { name: 'Agenda de Isaac Fuentes' })).getByRole('button', {
          name: /Gael Cordero/,
        }),
      ).toBeInTheDocument(),
    )

    // "Ver cita" opens it in the agenda.
    await user.click(within(region).getByRole('button', { name: 'Ver cita' }))
    expect(await screen.findByRole('dialog', { name: 'Gael Cordero' })).toBeInTheDocument()
    // Opening it marks it as read (the panel hides the rest of the page from assistive tech).
    expect(screen.getByRole('button', { name: 'Avisos', hidden: true })).toBeInTheDocument()
  })

  it('the bell lists bookings and, in the demo, can simulate one', async () => {
    const { user } = await setup('/admin/inicio')
    await user.click(await screen.findByRole('button', { name: 'Avisos' }))
    expect(screen.getByText(/Sin avisos por ahora/)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Simular reserva en línea (demo)' }))
    expect(await screen.findByText('Nueva cita en línea')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Avisos, 1 sin leer' }))
    const popover = await screen.findByRole('dialog')
    expect(within(popover).getByText(/Reservó en línea · hace un momento/)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Marcar como leídos' }))
    expect(screen.getByRole('button', { name: 'Avisos' })).toBeInTheDocument()
  })

  it('a barber is only told about their own new appointments', async () => {
    const { booking } = await setup('/admin/inicio', 'u-leonardo')
    await screen.findByText('Siguiente cita')
    await act(() => book(booking, 'isaac', '12:00'))
    await act(() => book(booking, 'leonardo', '13:00'))
    const region = screen.getByRole('region', { name: 'Avisos nuevos' })
    await within(region).findByText('Nueva cita en línea')
    expect(within(region).getAllByText('Nueva cita en línea')).toHaveLength(1)
    expect(region).toHaveTextContent('con Leonardo')
  })

  it('appointments show their details in a tooltip on focus', async () => {
    await setup(`/admin/agenda?fecha=${DATE}`)
    const leo = await screen.findByRole('list', { name: 'Agenda de Leonardo Gómez' })
    act(() =>
      within(leo)
        .getByRole('button', { name: /Bruno Peña/ })
        .focus(),
    )
    const tip = await screen.findByRole('tooltip')
    expect(tip).toHaveTextContent('11:00 a. m. – 11:45 a. m. · 45 min')
    expect(tip).toHaveTextContent('Tel. 442 123 4567')
    expect(tip).toHaveTextContent('“Prefiere tijera, no máquina”')
  })

  it('the sidebar collapses to icons, remembers it, and there is no demo bar', async () => {
    const { user } = await setup('/admin/inicio')
    await screen.findByText('Siguiente cita')
    expect(screen.queryByText(/con datos ficticios/)).toBeNull()
    await user.click(screen.getByRole('button', { name: 'Contraer menú' }))
    expect(screen.getByRole('button', { name: 'Expandir menú' })).toBeInTheDocument()
    expect(window.localStorage.getItem('havana:admin-sidebar')).toBe('collapsed')
    // Links keep their accessible names in the rail.
    const nav = screen.getAllByRole('navigation', { name: 'Secciones del panel' })[0]!
    expect(within(nav).getByRole('link', { name: 'Agenda' })).toBeInTheDocument()
    await user.keyboard('[[')
    expect(screen.getByRole('button', { name: 'Contraer menú' })).toBeInTheDocument()
  })
})

describe('MockBookingRepository change feed', () => {
  it('hears bookings made in another tab through the storage event', async () => {
    const store = new Map<string, string>()
    const storage = {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
      removeItem: (k: string) => void store.delete(k),
    }
    const now = () => NOW
    const db: MockDb = { ...createSeed(NOW), appointments: [], blocks: [] }
    const adminTab = new MockBookingRepository({ storage, initial: db, now })
    const siteTab = new MockBookingRepository({ storage, now })
    const heard: Appointment[][] = []
    const stop = adminTab.onChange((c) => heard.push(c.created))

    const made = await book(siteTab, 'isaac', '12:00')
    window.dispatchEvent(new StorageEvent('storage', { key: 'havana:mock-db', newValue: store.get('havana:mock-db')! }))
    expect(heard.at(-1)?.map((a) => a.id)).toEqual([made.id])
    expect(adminTab.snapshot().appointments.some((a) => a.id === made.id)).toBe(true)

    stop()
    window.dispatchEvent(new StorageEvent('storage', { key: 'havana:mock-db', newValue: store.get('havana:mock-db')! }))
    expect(heard).toHaveLength(1)
  })
})
