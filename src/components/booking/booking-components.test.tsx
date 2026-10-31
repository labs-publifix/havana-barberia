import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { Slot, Staff } from '@/domain/types'
import { StaffPicker } from './StaffPicker'
import { SlotGrid } from './SlotGrid'
import { DayStrip } from './DayStrip'
import { LoyaltyCard } from './LoyaltyCard'
import { Button } from '@/components/ui/Button'

const staff: Staff[] = ['Isaac Fuentes', 'Leonardo Gómez'].map((name, i) => ({
  id: `s${i}`,
  name,
  role: 'barber',
  photoUrl: null,
  active: true,
  order: i,
  serviceIds: 'all',
  schedule: [],
}))

describe('StaffPicker', () => {
  it('is a radio group navigable with arrow keys', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<StaffPicker staff={staff} value="any" onChange={onChange} />)
    const any = screen.getByRole('radio', { name: /Primero disponible/ })
    expect(any).toHaveAttribute('aria-checked', 'true')
    any.focus()
    await user.keyboard('{ArrowDown}')
    expect(onChange).toHaveBeenLastCalledWith('s0')
  })
})

describe('SlotGrid', () => {
  const slot = (time: string, available: boolean): Slot => ({
    time,
    available,
    staffId: available ? 's0' : null,
    startsAt: time,
    endsAt: time,
  })

  it('groups times and disables unavailable ones', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(
      <SlotGrid
        slots={[slot('10:00', true), slot('10:15', false), slot('16:30', true)]}
        value={null}
        onChange={onChange}
      />,
    )
    expect(screen.getByRole('group', { name: 'Mañana' })).toBeInTheDocument()
    expect(screen.getByRole('group', { name: 'Tarde' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '10:15 a. m., no disponible' })).toBeDisabled()
    await user.click(screen.getByRole('button', { name: '4:30 p. m.' }))
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ time: '16:30' }))
  })
})

describe('DayStrip', () => {
  it('labels days for screen readers and disables closed days', () => {
    render(
      <DayStrip
        today="2026-11-01"
        value="2026-11-02"
        onChange={() => {}}
        days={[
          { date: '2026-11-01', disabled: true },
          { date: '2026-11-02', disabled: false },
        ]}
      />,
    )
    expect(screen.getByRole('button', { name: 'Hoy, domingo 1 de noviembre, cerrado' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'lunes 2 de noviembre' })).toHaveAttribute('aria-pressed', 'true')
  })
})

describe('LoyaltyCard', () => {
  it('announces progress and remaining visits', () => {
    render(
      <LoyaltyCard
        card={{ token: 't', customerId: 'c', customerFirstName: 'Ana', stamps: 6, goal: 10, rewardExpiresAt: null }}
      />,
    )
    expect(screen.getByText('6 de 10 sellos · te faltan 4 visitas')).toBeInTheDocument()
    expect(screen.getAllByRole('listitem', { name: /ganado/ })).toHaveLength(6)
  })
})

describe('Button', () => {
  it('ignores clicks while loading and keeps an accessible label', async () => {
    const user = userEvent.setup()
    const onClick = vi.fn()
    render(
      <Button loading onClick={onClick}>
        Confirmar cita
      </Button>,
    )
    await user.click(screen.getByRole('button', { name: /Confirmar cita/ }))
    expect(onClick).not.toHaveBeenCalled()
    expect(screen.getByRole('button')).toHaveAttribute('aria-busy', 'true')
  })
})
