import { Link } from 'react-router-dom'
import { useData } from '../data/DataContext'
import { Wordmark } from './Brand'

export function SiteHeader({ cta = true }: { cta?: boolean }) {
  return (
    <header className="site-header">
      <Wordmark />
      {cta && (
        <Link to="/reservar" className="btn sm">
          Reservar
        </Link>
      )}
    </header>
  )
}

export function SiteFooter() {
  const { data } = useData()
  const s = data?.settings
  return (
    <footer className="site-footer">
      <div className="wrap">
        <span>
          © {new Date().getFullYear()} Havana Barbería
          {s?.address ? ` · ${s.address}` : ''}
          {s?.phone ? ` · ${s.phone}` : ''}
        </span>
        <Link to="/admin">Acceso para el equipo</Link>
      </div>
    </footer>
  )
}
