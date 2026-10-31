import { Link } from 'react-router-dom'
import { CalendarClock } from 'lucide-react'
import { useData } from '../data/DataContext'
import { dayName, formatTime, money } from '../lib/time'
import { logoUrl } from '../components/Brand'
import { SiteFooter, SiteHeader } from '../components/SiteChrome'

const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0]

export default function Home() {
  const { data } = useData()
  const services = data?.services.filter((s) => s.active) ?? []
  const barbers = data?.barbers.filter((b) => b.active) ?? []
  const today = new Date().getDay()

  return (
    <>
      <SiteHeader />
      <main>
        <section className="wrap hero">
          <img className="hero-logo" src={logoUrl} alt="Havana Barbería" width={2048} height={1303} />
          <div className="hero-copy">
            <h1>Tu corte, a la hora que tú elijas.</h1>
            <p>Escoge servicio, barbero y horario en menos de un minuto. Sin llamadas, sin esperar turno.</p>
            <div className="hero-actions">
              <Link to="/reservar" className="btn">
                <CalendarClock size={18} aria-hidden /> Reservar cita
              </Link>
              <a href="#servicios" className="btn ghost">
                Ver precios
              </a>
            </div>
          </div>
        </section>

        <div className="band pole" aria-hidden />

        <section id="servicios" className="section">
          <div className="wrap split">
            <div>
              <h2>Servicios</h2>
              <ul className="menu">
                {services.map((s) => (
                  <li key={s.id}>
                    <div className="menu-row">
                      <span>{s.name}</span>
                      <span className="price num">{money(s.price)}</span>
                    </div>
                    <p className="menu-meta">
                      {s.description} · {s.durationMin} min
                    </p>
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <h2>Horario</h2>
              <table className="hours">
                <tbody>
                  {WEEK_ORDER.map((wd) => {
                    const h = data?.settings.hours[wd]
                    return (
                      <tr key={wd} className={wd === today ? 'today' : undefined}>
                        <td>{dayName(wd)}</td>
                        <td className={h ? 'num' : 'closed'}>
                          {h ? `${formatTime(h.open)} – ${formatTime(h.close)}` : 'Cerrado'}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </section>

        {barbers.length > 0 && (
          <section className="section">
            <div className="wrap">
              <h2>El equipo</h2>
              <div className="team">
                {barbers.map((b) => (
                  <div key={b.id}>
                    <h3>{b.name}</h3>
                    <p>{b.bio}</p>
                  </div>
                ))}
              </div>
            </div>
          </section>
        )}
      </main>
      <SiteFooter />
    </>
  )
}
