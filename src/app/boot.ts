import type { QueryClient } from '@tanstack/react-query'

export type ReadyState = 'ok' | 'error' | 'timeout'

/**
 * Resolves once the app has painted its real content: no route chunk
 * pending and no query in flight, twice in a row (effects can start new
 * queries right after a commit). Gives up after `timeoutMs`.
 */
export function whenReady(container: HTMLElement, client: QueryClient, timeoutMs = 3000): Promise<ReadyState> {
  const started = performance.now()
  let calm = 0
  return new Promise((resolve) => {
    const check = () => {
      const idle =
        container.childElementCount > 0 &&
        !container.querySelector('[data-route-loading]') &&
        client.isFetching() === 0
      calm = idle ? calm + 1 : 0
      if (calm >= 2) {
        const failed = client
          .getQueryCache()
          .getAll()
          .some((q) => q.state.status === 'error')
        return resolve(failed ? 'error' : 'ok')
      }
      if (performance.now() - started > timeoutMs) return resolve('timeout')
      window.setTimeout(check, 40)
    }
    window.setTimeout(check, 40)
  })
}

/**
 * Prerendered pages (scripts/prerender.mjs) arrive with their HTML already in
 * #root, so they paint before any JavaScript. The app mounts in a hidden
 * container behind it and takes its place once it has its data: same layout,
 * no flash. Other pages mount straight into #root.
 */
export function mountPoint(): { container: HTMLElement; swap: () => void; prerendered: boolean } {
  const root = document.getElementById('root')!
  if (!root.hasAttribute('data-prerendered')) return { container: root, swap: () => undefined, prerendered: false }
  const html = document.documentElement
  html.setAttribute('data-prerendered', '')
  html.classList.add('booting')
  const live = document.createElement('div')
  live.setAttribute('style', 'position:absolute;top:0;left:0;right:0;visibility:hidden;pointer-events:none')
  root.after(live)
  return {
    prerendered: true,
    container: live,
    swap: () => {
      root.remove()
      live.removeAttribute('style')
      live.id = 'root'
      html.classList.remove('booting')
    },
  }
}
