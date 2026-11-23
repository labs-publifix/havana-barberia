import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AppProviders } from '@/app/AppProviders'
import { MockBookingRepository } from '@/data/mock/MockBookingRepository'
import { createSeed, type MockDb } from '@/data/mock/seed'
import { localDate, zonedInstant } from '@/lib/time'
import AdminApp from './AdminApp'
import { MockAdminRepository } from './data/mock/MockAdminRepository'

vi.mock('./tipReceipt', async (orig) => ({
  ...(await orig<typeof import('./tipReceipt')>()),
  printTipReceipt: vi.fn(() => Promise.resolve()),
}))

const TZ = 'America/Mexico_City'
const NOW = zonedInstant('2026-11-05', '21:00', TZ)

describe('admin · Cierres › Propinas', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(NOW)
  })
  afterEach(() => vi.useRealTimers())

  it('shows what each barber is owed and pays it from the drawer, in their name', async () => {
    const db: MockDb = { ...createSeed(NOW), blocks: [] }
    const today = localDate(NOW, TZ)
    // Two of today's appointments, still open, to be charged with a card tip.
    const [a1, a2] = db.appointments.filter((a) => localDate(a.startsAt, TZ) === today && a.status !== 'cancelled')
    for (const a of [a1, a2]) if (a) Object.assign(a, { status: 'confirmed', payment: undefined })
    expect(a1 && a2).toBeTruthy()
    const booking = new MockBookingRepository({ storage: null, initial: db, now: () => new Date() })
    await booking.adminSetStatus(a1!.id, 'completed', { method: 'cash', tip: 100, tipMethod: 'card' })
    await booking.adminSetStatus(a2!.id, 'completed', { method: 'cash', tip: 20, tipMethod: 'card' })
    const admin = new MockAdminRepository({ storage: null, booking })
    await admin.demo.switchTo('u-owner')
    const user = userEvent.setup()
    render(
      <AppProviders repository={booking}>
        <MemoryRouter initialEntries={['/admin/cierre?vista=propinas']}>
          <Routes>
            <Route path="/admin/*" element={<AdminApp repository={admin} />} />
          </Routes>
        </MemoryRouter>
      </AppProviders>,
    )

    // $100 by card loses $5 for the terminal; $20 by card goes in full.
    const total = (await screen.findAllByText('Total a pagarle'))[0]!
    expect(total).toBeInTheDocument()
    const pending = await admin.getTips()
    const line = (id: string) => pending.pending.find((l) => l.appointmentId === id)
    expect(line(a1!.id)).toMatchObject({ tip: 100, fee: 5, amount: 95, method: 'card' })
    expect(line(a2!.id)).toMatchObject({ tip: 20, fee: 0, amount: 20, method: 'card' })

    const pays = screen.getAllByRole('button', { name: 'Pagar propinas' })
    await user.click(pays[0]!)
    const dialog = await screen.findByRole('dialog')
    await user.click(within(dialog).getByRole('button', { name: /Confirmar pago/ }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())

    const moves = booking.adminCashDay(today).moves.filter((m) => m.tipPayoutId)
    expect(moves).toHaveLength(1)
    expect(moves[0]).toMatchObject({ kind: 'out', concept: expect.stringMatching(/^Pago de propinas · /) })
    const payouts = await admin.getTipPayouts(today, today)
    expect(payouts).toHaveLength(1)
    // Paying again isn't possible: nothing of that barber is pending.
    await expect(admin.payTips(payouts[0]!.staffId, payouts[0]!.amount)).rejects.toThrow(/No hay propinas/)
  })
})
