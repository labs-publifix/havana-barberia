import { StrictMode, startTransition } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { AppProviders } from './app/AppProviders'
import { createQueryClient } from './app/queryClient'
import { mountPoint, whenReady } from './app/boot'
import { createBookingRepository } from './data'
import './styles/index.css'

// GitHub Pages serves one 404.html for every unknown path; for the real build
// under /app/ it redirects to /app/?p=<path> (keeping the #hash, where e-mail
// links carry the sign-in). Put the path back before the router starts.
const params = new URLSearchParams(window.location.search)
const deepPath = params.get('p')
if (deepPath?.startsWith('/')) {
  params.delete('p')
  const rest = params.toString()
  window.history.replaceState(
    null,
    '',
    import.meta.env.BASE_URL.replace(/\/$/, '') + deepPath + (rest ? `?${rest}` : '') + window.location.hash,
  )
}

// Account e-mails (invitation, password recovery) may land on the site root,
// e.g. when sent from the Supabase dashboard. Send them, and their errors
// (expired or used link), to the screen where the person sets a password.
const hash = new URLSearchParams(window.location.hash.slice(1))
const accountLink =
  ['invite', 'recovery', 'signup', 'magiclink'].includes(hash.get('type') ?? '') || hash.has('error_code')
const setPasswordPath = import.meta.env.BASE_URL + 'admin/contrasena'
if (accountLink && window.location.pathname !== setPasswordPath) {
  window.history.replaceState(null, '', setPasswordPath + window.location.hash)
}

const repository = createBookingRepository()
const client = createQueryClient()
const { container, swap, prerendered } = mountPoint()

const app = (
  <StrictMode>
    <AppProviders repository={repository} client={client}>
      <App />
    </AppProviders>
  </StrictMode>
)
const root = createRoot(container)
// Behind a prerendered page nothing waits on this render: let React split it
// into small chunks so taps and scrolls on the static page stay responsive.
if (prerendered) startTransition(() => root.render(app))
else root.render(app)

void whenReady(container, client).then((state) => {
  swap()
  // scripts/prerender.mjs waits for this before taking the snapshot.
  document.documentElement.dataset.ready = state
})
