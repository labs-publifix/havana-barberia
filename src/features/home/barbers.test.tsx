import { render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { AppProviders } from '@/app/AppProviders'
import type { BookingRepository } from '@/data'
import type { Staff } from '@/domain/types'
import { Barbers } from './Barbers'
import { HeroBarberPicker } from './HeroBarberPicker'

const week = Array.from({ length: 7 }, () => [{ start: '10:00', end: '20:00' }])
const barber = (id: string, name: string, extra: Partial<Staff> = {}): Staff => ({
  id,
  name,
  role: 'barber',
  photoUrl: null,
  active: true,
  order: 1,
  serviceIds: 'all',
  schedule: week,
  ...extra,
})

/** The repository returns only active barbers, as both real implementations do. */
function renderWith(staff: Staff[]) {
  const repo = { listStaff: () => Promise.resolve(staff) } as unknown as BookingRepository
  return render(
    <AppProviders repository={repo}>
      <MemoryRouter>
        <HeroBarberPicker />
        <Barbers />
      </MemoryRouter>
    </AppProviders>,
  )
}

describe('barbers on the site come from the panel', () => {
  it('shows every active barber with their title, description and link to book', async () => {
    renderWith([
      barber('leonardo', 'Leonardo Gómez', { title: 'Barbero senior', bio: 'Fades y barba clásica.' }),
      barber('b-nuevo', 'Carlos Ruiz', { photoUrl: 'https://example.test/carlos.webp' }),
    ])
    await screen.findByRole('heading', { name: 'Leonardo Gómez' })
    const list = screen.getByRole('list', { name: 'Barberos' })
    expect(within(list).getByText('Barbero senior')).toBeInTheDocument()
    expect(within(list).getByText('Fades y barba clásica.')).toBeInTheDocument()
    expect(within(list).getByAltText('Retrato de Carlos Ruiz')).toHaveAttribute('src', 'https://example.test/carlos.webp')
    expect(within(list).getByRole('link', { name: 'Reservar con Carlos' })).toHaveAttribute(
      'href',
      expect.stringContaining('b-nuevo'),
    )
    // Hero pills: the same people plus "Primero disponible".
    const pills = screen.getByRole('list', { name: '¿Con quién te sientas?' })
    expect(within(pills).getAllByRole('link')).toHaveLength(3)
    expect(screen.getByText('2', { selector: '.tabular' })).toBeInTheDocument()
  })

  it('a barber without photo shows initials; nobody else appears', async () => {
    renderWith([barber('b-ana', 'Ana Torres')])
    await screen.findByRole('heading', { name: 'Ana Torres' })
    const list = screen.getByRole('list', { name: 'Barberos' })
    expect(within(list).getAllByRole('listitem')).toHaveLength(1)
    expect(within(list).getByText('AT')).toBeInTheDocument()
    expect(screen.queryByText(/Isaac/)).toBeNull()
  })
})
