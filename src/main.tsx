import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { AppProviders } from './app/AppProviders'
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

const repository = createBookingRepository()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AppProviders repository={repository}>
      <App />
    </AppProviders>
  </StrictMode>,
)
