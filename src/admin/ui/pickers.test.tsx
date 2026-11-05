import { useState } from 'react'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { DatePicker } from './DatePicker'
import { Select } from './Select'

function DateHarness({ initial = '2026-11-05', min }: { initial?: string; min?: string }) {
  const [v, setV] = useState(initial)
  return (
    <>
      <DatePicker label="Fecha" value={v} onChange={setV} today="2026-11-05" min={min} />
      <output data-testid="value">{v}</output>
    </>
  )
}

describe('DatePicker', () => {
  it('shows the date in Spanish and picks a day with the mouse', async () => {
    const user = userEvent.setup()
    render(<DateHarness />)
    const field = screen.getByLabelText('Fecha')
    expect(field).toHaveTextContent('Jue 5 de nov 2026')
    await user.click(field)
    expect(screen.getByRole('grid', { name: 'Noviembre de 2026' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Jueves 5 de noviembre de 2026, hoy' })).toHaveAttribute(
      'aria-current',
      'date',
    )
    await user.click(screen.getByRole('button', { name: 'Martes 17 de noviembre de 2026' }))
    expect(screen.getByTestId('value')).toHaveTextContent('2026-11-17')
    expect(screen.queryByRole('grid')).toBeNull()
  })

  it('moves with the keyboard across weeks and months, Monday first', async () => {
    const user = userEvent.setup()
    render(<DateHarness />)
    await user.click(screen.getByLabelText('Fecha'))
    expect(screen.getAllByRole('columnheader').map((h) => h.textContent)).toEqual(['L', 'M', 'M', 'J', 'V', 'S', 'D'])
    expect(document.activeElement).toHaveAttribute('data-date', '2026-11-05')
    await user.keyboard('{ArrowDown}{ArrowDown}{ArrowDown}{ArrowDown}') // 3 Dec
    expect(screen.getByRole('grid', { name: 'Diciembre de 2026' })).toBeInTheDocument()
    await user.keyboard('{Home}') // Monday 30 Nov
    expect(document.activeElement).toHaveAttribute('data-date', '2026-11-30')
    await user.keyboard('{PageDown}{Enter}')
    expect(screen.getByTestId('value')).toHaveTextContent('2026-12-30')
  })

  it('does not allow days before the minimum and "Hoy" jumps to today', async () => {
    const user = userEvent.setup()
    render(<DateHarness initial="2026-11-20" min="2026-11-05" />)
    await user.click(screen.getByLabelText('Fecha'))
    expect(screen.getByRole('button', { name: 'Miércoles 4 de noviembre de 2026' })).toBeDisabled()
    await user.click(screen.getByRole('button', { name: 'Hoy' }))
    expect(screen.getByTestId('value')).toHaveTextContent('2026-11-05')
  })
})

describe('Select', () => {
  function SelectHarness() {
    const [v, setV] = useState('')
    return (
      <>
        <Select
          label="Barbero"
          value={v}
          onValueChange={setV}
          options={[
            { value: '', label: 'Todos los barberos' },
            { value: 'leonardo', label: 'Leonardo Gómez' },
            { value: 'isaac', label: 'Isaac Fuentes' },
          ]}
        />
        <output data-testid="value">{v || '(vacío)'}</output>
      </>
    )
  }

  it('shows the label of the empty option and returns plain values', async () => {
    const user = userEvent.setup()
    render(<SelectHarness />)
    const field = screen.getByLabelText('Barbero')
    expect(field).toHaveTextContent('Todos los barberos')
    await user.click(field)
    await user.click(await screen.findByRole('option', { name: 'Isaac Fuentes' }))
    expect(screen.getByTestId('value')).toHaveTextContent('isaac')
    await user.click(field)
    await user.click(await screen.findByRole('option', { name: 'Todos los barberos' }))
    expect(screen.getByTestId('value')).toHaveTextContent('(vacío)')
  })
})
