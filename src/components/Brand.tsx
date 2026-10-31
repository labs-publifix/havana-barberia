import { Link } from 'react-router-dom'

/** Logotipo en texto para barras de navegación (el JPG trae fondo blanco). */
export function Wordmark({ to = '/' }: { to?: string }) {
  return (
    <Link to={to} className="wordmark" aria-label="Havana Barbería, inicio">
      <span className="wm-main">HAVANA</span>
      <span className="wm-sub">BARBERÍA</span>
    </Link>
  )
}

export const logoUrl = `${import.meta.env.BASE_URL}logo.jpg`
