import { Link, useParams } from 'react-router-dom'
import { useData } from '../data/DataContext'
import { formatDateLong, formatTime, money } from '../lib/time'
import { SiteHeader } from '../components/SiteChrome'

export default function Confirmation() {
  const { id } = useParams()
  const { data } = useData()
  if (!data) return null
  const a = data.appointments.find((x) => x.id === id)
  const service = data.services.find((s) => s.id === a?.serviceId)
  const barber = data.barbers.find((b) => b.id === a?.barberId)

  return (
    <>
      <SiteHeader />
      <main>
        <article className="ticket">
          <div className="pole" aria-hidden />
          <div className="ticket-body">
            {a ? (
              <>
                <h1>{a.status === 'cancelada' ? 'Cita cancelada' : '¡Listo! Tu cita está apartada.'}</h1>
                <dl className="facts">
                    <div>
                      <dt>Cuándo</dt>
                      <dd>
                        {formatDateLong(a.date)}, <span className="num">{formatTime(a.start)}</span>
                      </dd>
                    </div>
                    <div>
                      <dt>Servicio</dt>
                      <dd>
                        {service?.name ?? 'Servicio'} · {a.durationMin} min · <span className="num">{money(a.price)}</span>
                      </dd>
                    </div>
                    <div>
                      <dt>Barbero</dt>
                      <dd>{barber?.name ?? '—'}</dd>
                    </div>
                    <div>
                      <dt>A nombre de</dt>
                      <dd>{a.customerName}</dd>
                    </div>
                    <div>
                      <dt>Folio</dt>
                      <dd className="code">{a.id.toUpperCase()}</dd>
                    </div>
                </dl>
                <p style={{ color: 'var(--muted)' }}>Llega 5 minutos antes. Si no puedes venir, avísanos para liberar el horario.</p>
              </>
            ) : (
              <>
                <h1>No encontramos esa cita</h1>
                <p style={{ color: 'var(--muted)' }}>Revisa el enlace o haz una reserva nueva.</p>
              </>
            )}
            <div className="hero-actions">
              <Link to="/" className="btn ghost">
                Volver al inicio
              </Link>
              <Link to="/reservar" className="btn quiet">
                Otra reserva
              </Link>
            </div>
          </div>
        </article>
      </main>
    </>
  )
}
