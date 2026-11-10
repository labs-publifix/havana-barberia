/**
 * Cloudflare Turnstile without touching the booking screens: when a booking is
 * sent, an invisible check runs; Cloudflare only shows a box (bottom of the
 * screen) in the rare case it needs the person to tap it.
 */
interface TurnstileApi {
  render(
    el: HTMLElement,
    opts: {
      sitekey: string
      action?: string
      appearance?: 'always' | 'execute' | 'interaction-only'
      language?: string
      callback: (token: string) => void
      'error-callback'?: () => void
      'expired-callback'?: () => void
      'timeout-callback'?: () => void
    },
  ): string
  remove(id: string): void
}

declare global {
  interface Window {
    turnstile?: TurnstileApi
  }
}

const SCRIPT = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit'
let loading: Promise<TurnstileApi> | null = null

function load(): Promise<TurnstileApi> {
  if (window.turnstile) return Promise.resolve(window.turnstile)
  loading ??= new Promise((resolve, reject) => {
    const s = document.createElement('script')
    s.src = SCRIPT
    s.async = true
    s.onload = () => (window.turnstile ? resolve(window.turnstile) : reject(new Error('turnstile')))
    s.onerror = () => {
      loading = null
      reject(new Error('turnstile'))
    }
    document.head.appendChild(s)
  })
  return loading
}

export class HumanCheckError extends Error {
  constructor() {
    super('No pudimos confirmar que eres una persona. Revisa tu conexión e intenta de nuevo.')
  }
}

/** A one-time Turnstile token for `action`. */
export async function humanCheck(siteKey: string, action: string): Promise<string> {
  const api = await load().catch(() => {
    throw new HumanCheckError()
  })
  const host = document.createElement('div')
  host.setAttribute('role', 'region')
  host.setAttribute('aria-label', 'Verificación de seguridad')
  host.style.cssText =
    'position:fixed;left:50%;bottom:calc(16px + env(safe-area-inset-bottom,0px));transform:translateX(-50%);z-index:9999'
  document.body.appendChild(host)
  try {
    return await new Promise<string>((resolve, reject) => {
      const id = api.render(host, {
        sitekey: siteKey,
        action,
        appearance: 'interaction-only',
        language: 'es',
        callback: resolve,
        'error-callback': () => reject(new HumanCheckError()),
        'expired-callback': () => reject(new HumanCheckError()),
        'timeout-callback': () => reject(new HumanCheckError()),
      })
      // Stop waiting after two minutes.
      setTimeout(() => {
        api.remove(id)
        reject(new HumanCheckError())
      }, 120_000)
    })
  } finally {
    host.remove()
  }
}
