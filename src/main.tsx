import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './styles/index.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <main className="grid min-h-dvh place-items-center bg-inverse text-fg-inverse">
      <h1 className="t-display">Havana Barbería</h1>
    </main>
  </StrictMode>,
)
