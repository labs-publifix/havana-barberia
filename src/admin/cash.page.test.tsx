import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import { AppProviders } from '@/app/AppProviders'
import { MockBookingRepository } from '@/data/mock/MockBookingRepository'
import { createSeed } from '@/data/mock/seed'
import { addDays, localDate, zonedInstant } from '@/lib/time'
import AdminApp from './AdminApp'
import { MockAdminRepository } from './data/mock/MockAdminRepository'

const TZ = 'America/Mexico_City'
const today = localDate(new Date(), TZ)
const yesterday = addDays(today, -1)
const twoDaysAgo = addDays(today, -2)

/** A paid appointment on a given day, built from the demo's first service. */
function paidOn(date: string, i: number) {
  const at = zonedInstant(date, '12:00', TZ).toISOString()
  return {
    id: `cash-${i}`,
    token: `cash-${i}`,
    customerId: `cc-${i}`,
    customer: { name: `Cliente ${i}`, phone: '', email: '' },
    staffId: 'isaac',
    serviceIds: ['corte-adulto'],
    startsAt: at,
    endsAt: at,
    durationMin: 45,
    totalPrice: 280,
    status: 'completed' as const,
    notes: '',
    createdAt: at,
    loyaltyToken: null,
    payment: { method: 'cash' as const, amount: 280, tip: 0, tipMethod: 'cash' as const, paidAt: at },
  }
}

async function renderCaja(query = 'vista=caja') {
  const seed = createSeed(new Date())
  const db = {
    ...seed,
    appointments: [paidOn(twoDaysAgo, 1), paidOn(yesterday, 2)],
    sales: [],
    cashMoves: [],
    // Two days ago was closed $50 short; yesterday was never closed.
    dailyCloses: [
      {
        date: twoDaysAgo,
        openingFund: 500,
        expected: 780,
        counted: 730,
        difference: -50,
        note: '',
        closedBy: 'Recepción',
        closedAt: zonedInstant(twoDaysAgo, '20:40', TZ).toISOString(),
      },
    ],
  }
  const booking = new MockBookingRepository({ storage: null, initial: db })
  const admin = new MockAdminRepository({ storage: null, booking })
  await admin.demo.switchTo('u-owner')
  const user = userEvent.setup()
  render(
    <AppProviders repository={booking}>
      <MemoryRouter initialEntries={[`/admin/ventas?${query}`]}>
        <Routes>
          <Route path="/admin/*" element={<AdminApp repository={admin} />} />
        </Routes>
      </MemoryRouter>
    </AppProviders>,
  )
  return { user }
}

describe('Ventas › Caja', () => {
  it('warns about the last week: a day without a close and a close that did not match', async () => {
    await renderCaja()
    const alert = await screen.findByText(/Atención: 1 día sin corte de caja y 1 cierre que no cuadró/)
    expect(alert).toBeInTheDocument()
  })

  it('a custom range shows each day with its status, flagged in red', async () => {
    await renderCaja(`vista=caja&periodo=rango&desde=${addDays(today, -3)}&hasta=${today}`)
    expect(await screen.findByRole('radio', { name: 'Personalizado', checked: true })).toBeInTheDocument()
    const table = await screen.findByRole('table')
    const row = (date: string) =>
      within(table)
        .getAllByRole('row')
        .find((r) => r.textContent?.includes(date))!
    const fmt = (d: string) => Number(d.slice(8)).toString()
    expect(within(table).getAllByRole('row')).toHaveLength(5) // header + 4 days
    expect(row(` ${fmt(yesterday)} de`)).toHaveTextContent('Sin corte')
    expect(row(` ${fmt(twoDaysAgo)} de`)).toHaveTextContent('No cuadró')
    expect(row(` ${fmt(twoDaysAgo)} de`)).toHaveTextContent('−$50')
    expect(row(` ${fmt(today)} de`)).toHaveTextContent('Abierta')
    expect(screen.getByText('Días con alerta').nextSibling).toHaveTextContent('2')
  })

  it('opening a day without a close says so in red', async () => {
    const { user } = await renderCaja()
    const alert = await screen.findByText(/Atención:/)
    const chip = within(alert.closest('[role="alert"], div')!.parentElement!).getAllByRole('button')
    await user.click(chip.find((b) => b.textContent?.includes('sin corte'))!)
    expect(await screen.findByText('No se hizo el corte de caja de este día.')).toBeInTheDocument()
  })
})
