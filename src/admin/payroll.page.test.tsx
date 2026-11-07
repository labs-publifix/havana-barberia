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

const NOW = zonedInstant('2026-11-05', '21:00', 'America/Mexico_City')

describe('admin payroll', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(NOW)
  })
  afterEach(() => vi.useRealTimers())

  it('marks a manual bonus and adds it to the pay', async () => {
    const seed = createSeed(NOW)
    seed.finance.bonuses[0]!.amount = 200
    const db: MockDb = { ...seed, blocks: [] }
    const booking = new MockBookingRepository({ storage: null, initial: db, now: () => new Date() })
    const admin = new MockAdminRepository({ storage: null, booking })
    await admin.demo.switchTo('u-owner')
    const user = userEvent.setup()
    render(
      <AppProviders repository={booking}>
        <MemoryRouter initialEntries={['/admin/cierre']}>
          <Routes>
            <Route path="/admin/*" element={<AdminApp repository={admin} />} />
          </Routes>
        </MemoryRouter>
      </AppProviders>,
    )
    const bonuses = await screen.findByRole('list', { name: 'Bonos por barbero' })
    const leo = within(bonuses).getAllByRole('listitem')[0]!
    await user.click(within(leo).getByRole('switch', { name: 'Puntualidad' }))
    await waitFor(() => expect(within(leo).getByRole('switch', { name: 'Puntualidad' })).toBeChecked())
    const payroll = screen.getByRole('table', { name: 'Nómina por barbero' })
    expect(within(payroll).getByRole('row', { name: /Leonardo Gómez/ })).toHaveTextContent('$200')
  })
})
