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

const NOW = zonedInstant('2026-11-04', '12:30', 'America/Mexico_City')

async function renderCatalog(userId = 'u-owner') {
  const seed = createSeed(NOW)
  // Keep a few appointments (so "corte-adulto" is in use) and drop the rest.
  const db: MockDb = { ...seed, appointments: seed.appointments.filter((a) => a.serviceIds[0] === 'corte-adulto') }
  const booking = new MockBookingRepository({ storage: null, initial: db, now: () => new Date() })
  const admin = new MockAdminRepository({ storage: null, booking })
  await admin.demo.switchTo(userId)
  const user = userEvent.setup()
  render(
    <AppProviders repository={booking}>
      <MemoryRouter initialEntries={['/admin/catalogo']}>
        <Routes>
          <Route path="/admin/*" element={<AdminApp repository={admin} />} />
        </Routes>
      </MemoryRouter>
    </AppProviders>,
  )
  await screen.findByRole('list', { name: 'Cortes' })
  return { user, booking }
}

const rowNames = (category: string) =>
  within(screen.getByRole('list', { name: category }))
    .getAllByRole('listitem')
    .map(
      (li) =>
        within(li)
          .getAllByRole('button')
          .find((b) => b.className.includes('font-semibold'))!.textContent,
    )

async function choose(user: ReturnType<typeof userEvent.setup>, scope: HTMLElement, label: string, option: string) {
  await user.click(within(scope).getByLabelText(label))
  await user.click(await screen.findByRole('option', { name: option }))
}

describe('admin catalog', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(NOW)
  })
  afterEach(() => vi.useRealTimers())

  it('lists services by category in the site order, with search and visibility filters', async () => {
    const { user } = await renderCatalog()
    expect(screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent)).toEqual([
      'Cortes',
      'Barba',
      'Combos',
      'Facial y cuidado',
      'Color',
    ])
    expect(rowNames('Cortes')).toEqual(['Corte de cabello adulto', 'Corte de niño', 'Delineado de corte'])
    await user.type(screen.getByLabelText('Buscar servicio'), 'tinte')
    expect(screen.queryByRole('list', { name: 'Cortes' })).toBeNull()
    expect(rowNames('Color')).toEqual(['Tinte de cabello', 'Tinte de barba'])
  })

  it('changes a price; the public catalog follows and past appointments keep theirs', async () => {
    const { user, booking } = await renderCatalog()
    const before = booking.snapshot().appointments.find((a) => a.serviceIds[0] === 'corte-adulto')!
    await user.click(screen.getByRole('button', { name: 'Editar Corte de cabello adulto' }))
    const panel = await screen.findByRole('dialog', { name: 'Corte de cabello adulto' })
    expect(panel).toHaveTextContent(/Usado en \d+ citas/)
    const price = within(panel).getByLabelText('Precio')
    await user.clear(price)
    await user.type(price, '300')
    await user.click(within(panel).getByRole('button', { name: 'Guardar cambios' }))

    expect(await screen.findByText('«Corte de cabello adulto» actualizado')).toBeInTheDocument()
    expect((await booking.listServices()).services.find((s) => s.id === 'corte-adulto')?.price).toBe(300)
    expect(booking.snapshot().appointments.find((a) => a.id === before.id)?.totalPrice).toBe(before.totalPrice)
    await waitFor(() => expect(screen.getByRole('list', { name: 'Cortes' })).toHaveTextContent('$300'))
  })

  it('creates a service in a category for one barber, with a live preview', async () => {
    const { user, booking } = await renderCatalog()
    await user.click(screen.getByRole('button', { name: /Nuevo servicio/ }))
    const panel = await screen.findByRole('dialog', { name: 'Nuevo servicio' })
    await user.type(within(panel).getByLabelText('Nombre'), 'Corte clásico')
    await choose(user, panel, 'Categoría', 'Cortes')
    await choose(user, panel, 'Duración', '45 min')
    await user.type(within(panel).getByLabelText('Precio'), '320')
    await user.click(within(panel).getByRole('button', { name: /Isaac Fuentes/ }))
    expect(within(panel).getByRole('button', { name: /Isaac Fuentes/ })).toHaveAttribute('aria-pressed', 'false')
    expect(panel).toHaveTextContent('Corte clásico')
    await user.click(within(panel).getByRole('button', { name: 'Crear servicio' }))

    expect(await screen.findByText('«Corte clásico» creado')).toBeInTheDocument()
    await waitFor(() => expect(rowNames('Cortes').at(-1)).toBe('Corte clásico'))
    expect(booking.adminCatalog().staffFor['corte-clasico']).toEqual(['leonardo'])
  })

  it('reorders services within a category', async () => {
    const { user } = await renderCatalog()
    await user.click(screen.getByRole('button', { name: 'Subir Corte de niño' }))
    await waitFor(() =>
      expect(rowNames('Cortes')).toEqual(['Corte de niño', 'Corte de cabello adulto', 'Delineado de corte']),
    )
  })

  it('hides a service: it stays in the admin and leaves the site', async () => {
    const { user, booking } = await renderCatalog()
    await user.click(screen.getByRole('button', { name: 'Editar Ritual facial' }))
    const panel = await screen.findByRole('dialog', { name: 'Ritual facial' })
    await user.click(within(panel).getByRole('switch', { name: 'Visible en el sitio y la reserva' }))
    await user.click(within(panel).getByRole('button', { name: 'Guardar cambios' }))
    await waitFor(() => expect(screen.getByRole('list', { name: 'Facial y cuidado' })).toHaveTextContent('Oculto'))
    expect((await booking.listServices()).services.some((s) => s.id === 'ritual-facial')).toBe(false)
  })

  it('only deletes services without appointments, after confirming', async () => {
    const { user } = await renderCatalog()
    await user.click(screen.getByRole('button', { name: 'Editar Corte de cabello adulto' }))
    let panel = await screen.findByRole('dialog', { name: 'Corte de cabello adulto' })
    expect(within(panel).getByRole('button', { name: 'Eliminar' })).toBeDisabled()
    await user.keyboard('{Escape}')

    await user.click(await screen.findByRole('button', { name: 'Editar Tinte de barba' }))
    panel = await screen.findByRole('dialog', { name: 'Tinte de barba' })
    await user.click(within(panel).getByRole('button', { name: 'Eliminar' }))
    const confirm = await screen.findByRole('dialog', { name: '¿Eliminar «Tinte de barba»?' })
    await user.click(within(confirm).getByRole('button', { name: 'Sí, eliminar' }))
    expect(await screen.findByText('Servicio eliminado')).toBeInTheDocument()
    await waitFor(() => expect(rowNames('Color')).toEqual(['Tinte de cabello']))
  })

  it('creates and renames categories', async () => {
    const { user } = await renderCatalog()
    await user.click(screen.getByRole('button', { name: /Nueva categoría/ }))
    let dialog = await screen.findByRole('dialog', { name: 'Nueva categoría' })
    await user.type(within(dialog).getByLabelText('Nombre'), 'Paquetes')
    await user.click(within(dialog).getByRole('button', { name: 'Crear categoría' }))
    expect(await screen.findByRole('heading', { level: 2, name: 'Paquetes' })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Renombrar Paquetes' }))
    dialog = await screen.findByRole('dialog', { name: 'Renombrar categoría' })
    const name = within(dialog).getByLabelText('Nombre')
    await user.clear(name)
    await user.type(name, 'Paquetes especiales')
    await user.click(within(dialog).getByRole('button', { name: 'Guardar' }))
    expect(await screen.findByRole('heading', { level: 2, name: 'Paquetes especiales' })).toBeInTheDocument()
    // Empty, so it can be deleted.
    expect(screen.getByRole('button', { name: 'Eliminar Paquetes especiales' })).toBeInTheDocument()
  })

  it('reception can look but not change', async () => {
    const { user } = await renderCatalog('u-reception')
    expect(screen.getByText('Solo lectura')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Nuevo servicio/ })).toBeNull()
    expect(screen.queryByRole('button', { name: /Subir/ })).toBeNull()
    await user.click(screen.getByRole('button', { name: 'Ver Corte de niño' }))
    const panel = await screen.findByRole('dialog', { name: 'Corte de niño' })
    expect(within(panel).getByLabelText('Nombre')).toBeDisabled()
    expect(within(panel).queryByRole('button', { name: 'Guardar cambios' })).toBeNull()
  })
})
