import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import { AppProviders } from '@/app/AppProviders'
import { MockBookingRepository } from '@/data/mock/MockBookingRepository'
import AdminApp from './AdminApp'
import { MockAdminRepository } from './data/mock/MockAdminRepository'

// jsdom has no canvas: keep the photo as is instead of resizing it.
vi.mock('./ui/image', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./ui/image')>()),
  resizeImage: vi.fn(async (file: Blob) => file),
}))

async function renderProducts(userId = 'u-owner') {
  const booking = new MockBookingRepository({ storage: null })
  const admin = new MockAdminRepository({ storage: null, booking })
  await admin.demo.switchTo(userId)
  const user = userEvent.setup()
  render(
    <AppProviders repository={booking}>
      <MemoryRouter initialEntries={['/admin/catalogo?vista=productos']}>
        <Routes>
          <Route path="/admin/*" element={<AdminApp repository={admin} />} />
        </Routes>
      </MemoryRouter>
    </AppProviders>,
  )
  const table = await screen.findByRole('table', { name: 'Productos' })
  await waitFor(() => expect(within(table).getAllByRole('row').length).toBeGreaterThan(1))
  return { user, booking, table }
}

const row = (table: HTMLElement, name: string) =>
  within(table)
    .getAllByRole('row')
    .find((r) => r.textContent?.includes(name))!

describe('admin products', () => {
  it('shows a Productos tab with price, and cost/commission still to capture', async () => {
    const { table } = await renderProducts()
    expect(screen.getByRole('tab', { name: 'Productos', selected: true })).toBeInTheDocument()
    expect(row(table, 'Cera mate 100 g')).toHaveTextContent('$240')
    expect(row(table, 'Cera mate 100 g')).toHaveTextContent('Sin capturar')
    expect(screen.getByText(/sin costo o comisión capturados/)).toBeInTheDocument()
  })

  it('captures cost and commission and shows the margin as you type', async () => {
    const { user, table } = await renderProducts()
    await user.click(within(table).getByRole('button', { name: 'Cera mate 100 g' }))
    const panel = await screen.findByRole('dialog', { name: 'Cera mate 100 g' })
    await user.type(within(panel).getByLabelText('Costo'), '90')
    expect(panel).toHaveTextContent('Margen por pieza (estimado)')
    expect(panel).toHaveTextContent('Falta capturar la comisión.')
    await user.type(within(panel).getByLabelText('Comisión para el barbero'), '30')
    expect(panel).toHaveTextContent('Margen por pieza$120(50%)')
    await user.click(within(panel).getByRole('button', { name: 'Guardar cambios' }))

    expect(await screen.findByText('«Cera mate 100 g» actualizado')).toBeInTheDocument()
    await waitFor(() => expect(row(table, 'Cera mate 100 g')).toHaveTextContent('$120'))
  })

  it('warns when a product sells below its cost', async () => {
    const { user, table } = await renderProducts()
    await user.click(within(table).getByRole('button', { name: 'Shampoo para barba 120 ml' }))
    const panel = await screen.findByRole('dialog', { name: 'Shampoo para barba 120 ml' })
    await user.type(within(panel).getByLabelText('Costo'), '180')
    await user.type(within(panel).getByLabelText('Comisión para el barbero'), '20')
    expect(panel).toHaveTextContent('Se vende por debajo de su costo.')
  })

  it('creates a product with a photo', async () => {
    const { user, table, booking } = await renderProducts()
    await user.click(screen.getByRole('button', { name: /Nuevo producto/ }))
    const panel = await screen.findByRole('dialog', { name: 'Nuevo producto' })
    await user.type(within(panel).getByLabelText('Nombre del producto'), 'Gel fijación extrema')
    await user.type(within(panel).getByLabelText('Precio público'), '180')
    const photo = new File([new Uint8Array([137, 80, 78, 71])], 'gel.png', { type: 'image/png' })
    await user.upload(within(panel).getByLabelText('Foto'), photo)
    expect(await within(panel).findByRole('img', { name: 'Foto del producto' })).toHaveAttribute(
      'src',
      expect.stringMatching(/^data:image\/png;base64,/),
    )
    await user.click(within(panel).getByRole('button', { name: 'Crear producto' }))

    expect(await screen.findByText('«Gel fijación extrema» creado')).toBeInTheDocument()
    await waitFor(() => expect(row(table, 'Gel fijación extrema')).toBeTruthy())
    expect(booking.adminProducts().find((p) => p.name === 'Gel fijación extrema')?.imageUrl).toMatch(/^data:image/)
  })

  it('rejects files that are not photos', async () => {
    const { user, table } = await renderProducts()
    await user.click(within(table).getByRole('button', { name: 'Aceite para barba 30 ml' }))
    const panel = await screen.findByRole('dialog', { name: 'Aceite para barba 30 ml' })
    const pdf = new File(['%PDF'], 'factura.pdf', { type: 'application/pdf' })
    // Drag-and-drop skips the input's accept filter, so validate like the app does.
    await userEvent.setup({ applyAccept: false }).upload(within(panel).getByLabelText('Foto'), pdf)
    expect(await within(panel).findByRole('alert')).toHaveTextContent('Usa una foto JPG, PNG o WebP.')
  })

  it('reception sees products and prices but never cost, commission or margin', async () => {
    const { user, table } = await renderProducts('u-reception')
    expect(screen.getByText('Solo lectura')).toBeInTheDocument()
    expect(within(table).queryByText('Costo')).toBeNull()
    expect(within(table).queryByText('Margen')).toBeNull()
    await user.click(within(table).getByRole('button', { name: 'Cera mate 100 g' }))
    const panel = await screen.findByRole('dialog', { name: 'Cera mate 100 g' })
    expect(within(panel).queryByLabelText('Costo')).toBeNull()
    expect(panel).not.toHaveTextContent('Comisión')
    expect(within(panel).queryByRole('button', { name: /Subir foto/ })).toBeNull()
  })
})
