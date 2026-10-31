import { useState, type FormEvent } from 'react'
import { NavLink, Outlet } from 'react-router-dom'
import { CalendarDays, ListChecks, LogOut, Scissors, Settings, Users } from 'lucide-react'
import { Wordmark } from '../../components/Brand'

/*
 * ACCESO PROVISIONAL. Este PIN vive en el código del navegador, así que solo
 * evita que un cliente entre por accidente: no es seguridad real. Cuando se
 * conecte el backend se reemplaza por inicio de sesión con usuario y contraseña.
 */
const DEMO_PIN = '2468'
const SESSION_KEY = 'havana-admin'

const isAuthed = () => {
  try {
    return sessionStorage.getItem(SESSION_KEY) === '1'
  } catch {
    return false
  }
}

const NAV = [
  { to: '/admin', label: 'Agenda', icon: CalendarDays, end: true },
  { to: '/admin/citas', label: 'Citas', icon: ListChecks },
  { to: '/admin/servicios', label: 'Servicios', icon: Scissors },
  { to: '/admin/barberos', label: 'Barberos', icon: Users },
  { to: '/admin/ajustes', label: 'Ajustes', icon: Settings },
]

export default function AdminLayout() {
  const [authed, setAuthed] = useState(isAuthed)

  if (!authed) return <Login onOk={() => setAuthed(true)} />

  const logout = () => {
    try {
      sessionStorage.removeItem(SESSION_KEY)
    } catch {
      /* sin almacenamiento */
    }
    setAuthed(false)
  }

  return (
    <div className="admin">
      <aside className="admin-side">
        <Wordmark to="/admin" />
        <nav aria-label="Panel">
          {NAV.map(({ to, label, icon: Icon, end }) => (
            <NavLink key={to} to={to} end={end} className="admin-link">
              <Icon size={18} aria-hidden />
              <span>{label}</span>
            </NavLink>
          ))}
        </nav>
        <button className="admin-link logout" onClick={logout}>
          <LogOut size={18} aria-hidden />
          <span>Salir</span>
        </button>
      </aside>
      <main className="admin-main">
        <Outlet />
      </main>
    </div>
  )
}

function Login({ onOk }: { onOk: () => void }) {
  const [pin, setPin] = useState('')
  const [error, setError] = useState(false)

  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (pin === DEMO_PIN) {
      try {
        sessionStorage.setItem(SESSION_KEY, '1')
      } catch {
        /* sin almacenamiento: la sesión dura lo que la pestaña */
      }
      onOk()
    } else {
      setError(true)
    }
  }

  return (
    <main className="login">
      <form onSubmit={submit} className="login-card">
        <div className="pole" aria-hidden style={{ height: 10, borderBottom: '1px solid var(--ink)' }} />
        <div className="login-body">
          <Wordmark />
          <h1>Panel del equipo</h1>
          <label className="field">
            <span>PIN</span>
            <input
              className="input num"
              type="password"
              inputMode="numeric"
              autoComplete="current-password"
              value={pin}
              onChange={(e) => {
                setPin(e.target.value)
                setError(false)
              }}
              aria-invalid={error}
              aria-describedby="pin-help"
              autoFocus
            />
            {error ? (
              <span id="pin-help" className="error" role="alert">
                PIN incorrecto.
              </span>
            ) : (
              <small id="pin-help">PIN de prueba: {DEMO_PIN}</small>
            )}
          </label>
          <button className="btn" type="submit">
            Entrar
          </button>
        </div>
      </form>
    </main>
  )
}
