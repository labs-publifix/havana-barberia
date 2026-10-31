import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { AppProviders } from './app/AppProviders'
import { createBookingRepository } from './data'
import './styles/index.css'

const repository = createBookingRepository()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AppProviders repository={repository}>
      <App />
    </AppProviders>
  </StrictMode>,
)
