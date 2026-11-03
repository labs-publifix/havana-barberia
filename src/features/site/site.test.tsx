import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { SiteNav } from './SiteNav'
import { ReviewsMarquee } from '@/features/home/Reviews'
import { reviews } from '@/config/reviews'

type IOCallback = (entries: Partial<IntersectionObserverEntry>[]) => void
const observers: { cb: IOCallback; targets: Element[] }[] = []

function installIO() {
  observers.length = 0
  vi.stubGlobal(
    'IntersectionObserver',
    class {
      targets: Element[] = []
      constructor(cb: IOCallback) {
        observers.push({ cb, targets: this.targets })
      }
      observe(el: Element) {
        this.targets.push(el)
      }
      unobserve() {}
      disconnect() {}
    },
  )
}

function mockMatchMedia(reduced: boolean) {
  vi.stubGlobal('matchMedia', (q: string) => ({
    matches: reduced && q.includes('prefers-reduced-motion'),
    media: q,
    addEventListener: () => {},
    removeEventListener: () => {},
  }))
}

afterEach(() => vi.unstubAllGlobals())

describe('SiteNav', () => {
  const renderNav = (startFloating = false) =>
    render(
      <MemoryRouter initialEntries={['/']}>
        <SiteNav startFloating={startFloating} />
      </MemoryRouter>,
    )

  it('starts transparent over the hero and floats after scrolling past the sentinel', () => {
    installIO()
    renderNav()
    const nav = screen.getByTestId('site-nav')
    expect(nav).toHaveAttribute('data-state', 'top')
    // The first observer watches the 24px sentinel: leaving the viewport means "scrolled".
    act(() => observers[0]!.cb([{ isIntersecting: false }]))
    expect(nav).toHaveAttribute('data-state', 'floating')
    act(() => observers[0]!.cb([{ isIntersecting: true }]))
    expect(nav).toHaveAttribute('data-state', 'top')
  })

  it('starts floating on inner pages', () => {
    installIO()
    renderNav(true)
    expect(screen.getByTestId('site-nav')).toHaveAttribute('data-state', 'floating')
  })

  it('has a single-line Reservar button and section links', () => {
    installIO()
    renderNav()
    const nav = screen.getByTestId('site-nav')
    expect(within(nav).getByRole('link', { name: 'Reservar' })).toHaveClass('whitespace-nowrap')
    for (const label of ['Reseñas', 'Tratamientos', 'Barberos', 'Galería', 'Ubicación'])
      expect(within(nav).getByRole('link', { name: label })).toBeInTheDocument()
  })

  it('opens a full-screen menu that closes with Escape', async () => {
    installIO()
    const user = userEvent.setup()
    renderNav()
    await user.click(screen.getByRole('button', { name: 'Abrir menú' }))
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })
})

describe('ReviewsMarquee', () => {
  it('becomes a manual list without duplicates under reduced motion', () => {
    mockMatchMedia(true)
    render(<ReviewsMarquee />)
    expect(screen.queryByTestId('reviews-marquee')).not.toBeInTheDocument()
    const list = screen.getByTestId('reviews-list')
    expect(within(list).getAllByRole('listitem')).toHaveLength(reviews.length)
  })

  it('animates two rows with duplicated, hidden copies and a pause button', async () => {
    mockMatchMedia(false)
    const user = userEvent.setup()
    const { container } = render(<ReviewsMarquee />)
    expect(screen.getByTestId('reviews-marquee')).toBeInTheDocument()
    const items = container.querySelectorAll('li')
    expect(items).toHaveLength(reviews.length * 2)
    expect(container.querySelectorAll('li[aria-hidden="true"]')).toHaveLength(reviews.length)
    const btn = screen.getByRole('button', { name: 'Pausar reseñas' })
    await user.click(btn)
    expect(screen.getByRole('button', { name: 'Reanudar reseñas' })).toHaveAttribute('aria-pressed', 'true')
    container.querySelectorAll('.marquee').forEach((m) => expect(m).toHaveAttribute('data-paused', 'true'))
  })

  it('marks every placeholder review as such', () => {
    expect(
      reviews.every((r) => !r.isPlaceholder || r.text.startsWith('Reseña de ejemplo: reemplazar por reseña real')),
    ).toBe(true)
  })
})
