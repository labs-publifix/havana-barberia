import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import AdminApp from './AdminApp'
import { DEMO_PASSWORD, MockAdminRepository } from './data/mock/MockAdminRepository'

function renderAdmin(path: string, repo = new MockAdminRepository({ storage: null })) {
  const user = userEvent.setup()
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/admin/*" element={<AdminApp repository={repo} />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
  return { user, repo }
}

const nav = () => screen.getAllByRole('navigation', { name: 'Secciones del panel' })[0]!

describe('admin panel shell', () => {
  it('sends visitors without a session to sign in, then back to where they were going', async () => {
    const { user } = renderAdmin('/admin/agenda')
    expect(await screen.findByRole('heading', { name: 'Entra al panel' })).toBeInTheDocument()

    await user.type(screen.getByLabelText('Correo'), 'recepcion@havana.test')
    await user.type(screen.getByLabelText('Contraseña'), DEMO_PASSWORD)
    await user.click(screen.getByRole('button', { name: 'Entrar' }))

    expect(await screen.findByRole('heading', { level: 1, name: 'Agenda' })).toBeInTheDocument()
    expect(screen.getByText('Entrega 3 de 8')).toBeInTheDocument()
  })

  it('shows field errors and a clear message for wrong credentials', async () => {
    const { user } = renderAdmin('/admin/entrar')
    await user.click(await screen.findByRole('button', { name: 'Entrar' }))
    expect(screen.getByText('Escribe tu correo.')).toBeInTheDocument()
    expect(screen.getByText('Escribe tu contraseña.')).toBeInTheDocument()

    await user.type(screen.getByLabelText('Correo'), 'dueno@havana.test')
    await user.type(screen.getByLabelText('Contraseña'), 'equivocada')
    await user.click(screen.getByRole('button', { name: 'Entrar' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Correo o contraseña incorrectos.')
  })

  it('owner goes through two-step verification before entering', async () => {
    const { user } = renderAdmin('/admin/entrar')
    await user.click(await screen.findByRole('button', { name: /Dueño/ }))

    expect(await screen.findByRole('heading', { name: 'Verificación en dos pasos' })).toBeInTheDocument()
    await user.type(screen.getByLabelText('Código'), '12')
    await user.click(screen.getByRole('button', { name: 'Verificar y entrar' }))
    expect(screen.getByText('Escribe los 6 dígitos del código.')).toBeInTheDocument()

    await user.type(screen.getByLabelText('Código'), '3456')
    await user.click(screen.getByRole('button', { name: 'Verificar y entrar' }))
    expect(await screen.findByRole('heading', { level: 1, name: 'Vista general' })).toBeInTheDocument()
    expect(within(nav()).getByRole('link', { name: 'Cierre y nómina' })).toBeInTheDocument()
  })

  it('a barber sees only their sections and is stopped at finance pages', async () => {
    const repo = new MockAdminRepository({ storage: null })
    await repo.demo.switchTo('u-leonardo')
    renderAdmin('/admin/cierre', repo)

    expect(await screen.findByText('Esta sección no está disponible para tu rol')).toBeInTheDocument()
    const links = within(nav())
      .getAllByRole('link')
      .map((a) => a.textContent)
    expect(links).toEqual(['Vista general', 'Mi agenda', 'Mis comisiones'])
  })

  it('switching role from the account menu updates the navigation', async () => {
    const repo = new MockAdminRepository({ storage: null })
    await repo.demo.switchTo('u-owner')
    const { user } = renderAdmin('/admin/reportes', repo)

    await user.click(await screen.findByRole('button', { name: /Cuenta: Dueño/ }))
    await user.click(await screen.findByRole('menuitemradio', { name: /Recepción/ }))

    // Reception cannot open reports: back to the overview, finance links gone.
    expect(await screen.findByRole('heading', { level: 1, name: 'Vista general' })).toBeInTheDocument()
    expect(within(nav()).queryByRole('link', { name: 'Reportes' })).not.toBeInTheDocument()
  })

  it('signing out returns to the sign-in screen', async () => {
    const repo = new MockAdminRepository({ storage: null })
    await repo.demo.switchTo('u-reception')
    const { user } = renderAdmin('/admin/inicio', repo)

    await user.click(await screen.findByRole('button', { name: /Cuenta: Recepción/ }))
    await user.click(await screen.findByRole('menuitem', { name: 'Cerrar sesión' }))
    expect(await screen.findByRole('heading', { name: 'Entra al panel' })).toBeInTheDocument()
    await waitFor(async () => expect(await repo.getSession()).toBeNull())
  })

  it('workbench table sorts and opens a row in the side panel', async () => {
    const repo = new MockAdminRepository({ storage: null })
    await repo.demo.switchTo('u-owner')
    const { user } = renderAdmin('/admin/componentes', repo)

    const table = await screen.findByRole('table', { name: /Usuarios del panel/ })
    await waitFor(() => expect(within(table).getAllByRole('row')).toHaveLength(6))
    const names = () =>
      within(table)
        .getAllByRole('row')
        .slice(1)
        .map((r) => within(r).getAllByRole('cell')[0]!.textContent)
    expect(names()[0]).toBe('Dueño')

    await user.click(within(table).getByRole('button', { name: /Nombre/ }))
    expect(names()[0]).toBe('Recepción')

    await user.type(screen.getByLabelText('Buscar usuario'), 'gomez')
    expect(names()).toEqual(['Leonardo Gómez'])

    await user.click(within(table).getByRole('button', { name: 'Leonardo Gómez' }))
    const dialog = await screen.findByRole('dialog', { name: 'Leonardo Gómez' })
    expect(within(dialog).getByLabelText('Rol')).toHaveValue('barber')
  })
})
