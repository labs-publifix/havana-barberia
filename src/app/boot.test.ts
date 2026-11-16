import { QueryClient } from '@tanstack/react-query'
import { mountPoint, whenReady } from './boot'

afterEach(() => {
  document.body.innerHTML = ''
  document.documentElement.removeAttribute('data-prerendered')
  document.documentElement.classList.remove('booting')
})

describe('mountPoint', () => {
  it('mounts straight into #root when the page is not prerendered', () => {
    document.body.innerHTML = '<div id="root"></div>'
    const m = mountPoint()
    expect(m.prerendered).toBe(false)
    expect(m.container.id).toBe('root')
  })

  it('mounts behind a prerendered page and takes its place on swap', () => {
    document.body.innerHTML = '<div id="root" data-prerendered=""><h1>Hola</h1></div>'
    const m = mountPoint()
    expect(m.prerendered).toBe(true)
    expect(m.container.style.visibility).toBe('hidden')
    expect(document.documentElement.classList.contains('booting')).toBe(true)
    m.container.innerHTML = '<h1>Hola</h1>'
    m.swap()
    expect(document.querySelectorAll('#root')).toHaveLength(1)
    expect(document.getElementById('root')).toBe(m.container)
    expect(m.container.getAttribute('style')).toBeNull()
    expect(document.documentElement.classList.contains('booting')).toBe(false)
  })
})

describe('whenReady', () => {
  it('waits for content and for queries to settle', async () => {
    const el = document.createElement('div')
    const client = new QueryClient()
    let release!: () => void
    void client.fetchQuery({ queryKey: ['x'], queryFn: () => new Promise<number>((ok) => (release = () => ok(1))) })
    const ready = whenReady(el, client, 2000)
    el.innerHTML = '<p>ok</p>'
    setTimeout(() => release(), 150)
    await expect(ready).resolves.toBe('ok')
  })

  it('gives up after the timeout', async () => {
    await expect(whenReady(document.createElement('div'), new QueryClient(), 100)).resolves.toBe('timeout')
  })
})
