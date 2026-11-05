import { screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { renderApp } from '@/test/renderApp'

describe('home hero video', () => {
  // Regression: some browsers (and jsdom) return nothing from play() instead of a
  // promise; the deferred video (300 ms after load) must not crash the page.
  it('survives play() not returning a promise once the video starts', async () => {
    renderApp('/')
    await new Promise((r) => setTimeout(r, 450))
    expect(await screen.findByRole('heading', { name: 'Corte de cabello adulto' })).toBeInTheDocument()
  })
})
