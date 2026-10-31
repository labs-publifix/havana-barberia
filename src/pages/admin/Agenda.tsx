import { useMemo, useState, type FormEvent } from 'react'
import { ChevronLeft, ChevronRight, Plus } from 'lucide-react'
import { useData } from '../../data/DataContext'
import { repo, SlotTakenError } from '../../data/store'
import { addDays, availableSlots, formatDateLong, formatTime, isoDate, money, toHHMM, toMin } from '../../lib/time'
import type { Appointment } from '../../data/types'
import { StatusActions, StatusBadge } from './status'

const pendingLabel = (n: number) => (n === 1 ? '1 pendiente' : `${n} pendientes`)
const cap = (t: string) => t.charAt(0).toUpperCase() + t.slice(1)

export default function Agenda() {
  const { data, refresh } = useData()
  const [date, setDate] = useState(() => isoDate(new Date()))
  const [adding, setAdding] = useState(false)

  if (!data) return null
  const today = isoDate(new Date())
  const dayAppts = data.appointments.filter((a) => a.date === date).sort((a, b) => a.start.localeCompare(b.start))
  const active = dayAppts.filter((a) => a.status === 'confirmada' || a.status === 'completada')
  const revenue = active.reduce((s, a) => s + a.price, 0)
  const done = dayAppts.filter((a) => a.status === 'completada').length
  const barbers = data.barbers.filter((b) => b.active || dayAppts.some((a) => a.barberId === b.id))
  const closed = !data.settings.hours[new Date(date + 'T00:00').getDay()]

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Agenda</h1>
          <p className="sub">
            {cap(formatDateLong(date))}
            {date === today ? ' · hoy' : ''}
          </p>
        </div>
        <div className="toolbar">
          <button className="btn quiet sm" onClick={() => setDate(addDays(date, -1))} aria-label="Día anterior">
            <ChevronLeft size={18} />
          </button>
          <button className="btn ghost sm" onClick={() => setDate(today)} disabled={date === today}>
            Hoy
          </button>
          <button className="btn quiet sm" onClick={() => setDate(addDays(date, 1))} aria-label="Día siguiente">
            <ChevronRight size={18} />
          </button>
          <input className="input" type="date" value={date} onChange={(e) => e.target.value && setDate(e.target.value)} style={{ width: 'auto', minHeight: 36 }} aria-label="Elegir fecha" />
          <button className="btn sm" onClick={() => setAdding((v) => !v)} aria-expanded={adding}>
            <Plus size={16} aria-hidden /> Nueva cita
          </button>
        </div>
      </div>

      {adding && <NewAppointmentForm date={date} onDone={() => setAdding(false)} />}

      <p className="day-summary">
        <span>
          <strong>{active.length}</strong> {active.length === 1 ? 'cita' : 'citas'}
        </span>
        <span>
          <strong>{done}</strong> {done === 1 ? 'completada' : 'completadas'}
        </span>
        <span>
          <strong>{money(revenue)}</strong> estimado
        </span>
        {closed && <span>El negocio está cerrado este día.</span>}
      </p>

      <div className="cols">
        {barbers.map((b) => {
          const list = dayAppts.filter((a) => a.barberId === b.id)
          return (
            <section key={b.id} className="panel">
              <div className="panel-head">
                <h2>{b.name}</h2>
                <span className="num" style={{ color: 'var(--muted)', fontSize: '0.875rem' }}>
                  {pendingLabel(list.filter((a) => a.status === 'confirmada').length)}
                </span>
              </div>
              {list.length === 0 ? (
                <p className="empty-state">Sin citas.</p>
              ) : (
                <ul className="appt-list">
                  {list.map((a) => (
                    <AppointmentRow key={a.id} a={a} serviceName={data.services.find((s) => s.id === a.serviceId)?.name} onChange={refresh} />
                  ))}
                </ul>
              )}
            </section>
          )
        })}
      </div>
    </>
  )
}

function AppointmentRow({ a, serviceName, onChange }: { a: Appointment; serviceName?: string; onChange: () => void }) {
  const end = toHHMM(toMin(a.start) + a.durationMin)
  const wa = a.customerPhone.replace(/\D/g, '')
  return (
    <li className={`appt is-${a.status}`}>
      <div className="time">
        {formatTime(a.start)}
        <small>{formatTime(end)}</small>
      </div>
      <div>
        <div className="who">{a.customerName}</div>
        <div className="what">
          {serviceName ?? 'Servicio'} · <span className="num">{money(a.price)}</span> ·{' '}
          <a href={`https://wa.me/${wa.length === 10 ? '52' + wa : wa}`} target="_blank" rel="noreferrer">
            {a.customerPhone}
          </a>
        </div>
        {a.notes && <div className="what">“{a.notes}”</div>}
        <div style={{ marginTop: 4 }}>
          <StatusBadge status={a.status} />
        </div>
      </div>
      <div className="actions">
        <StatusActions a={a} onChange={onChange} />
      </div>
    </li>
  )
}

function NewAppointmentForm({ date, onDone }: { date: string; onDone: () => void }) {
  const { data, refresh } = useData()
  const services = data?.services.filter((s) => s.active) ?? []
  const barbers = data?.barbers.filter((b) => b.active) ?? []
  const [serviceId, setServiceId] = useState(services[0]?.id ?? '')
  const [barberId, setBarberId] = useState(barbers[0]?.id ?? '')
  const [start, setStart] = useState('')
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [error, setError] = useState<string>()

  const service = services.find((s) => s.id === serviceId)
  const barber = barbers.find((b) => b.id === barberId)
  const slots = useMemo(
    () =>
      data && service && barber
        ? availableSlots({ date, durationMin: service.durationMin, barber, settings: data.settings, appointments: data.appointments })
        : [],
    [data, service, barber, date],
  )

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (!start || !name.trim()) {
      setError('Elige una hora y escribe el nombre del cliente.')
      return
    }
    try {
      await repo.book({ serviceId, barberId, date, start, customerName: name.trim(), customerPhone: phone.trim(), notes: '' })
      await refresh()
      onDone()
    } catch (err) {
      setError(err instanceof SlotTakenError ? err.message : 'No se pudo guardar la cita.')
      await refresh()
    }
  }

  return (
    <form className="panel" onSubmit={submit} style={{ marginBottom: '1.5rem' }}>
      <div className="panel-head">
        <h2>Nueva cita · {formatDateLong(date)}</h2>
      </div>
      <div className="panel-body editor">
        <label className="field">
          <span>Servicio</span>
          <select className="input" value={serviceId} onChange={(e) => { setServiceId(e.target.value); setStart('') }}>
            {services.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name} ({s.durationMin} min)
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>Barbero</span>
          <select className="input" value={barberId} onChange={(e) => { setBarberId(e.target.value); setStart('') }}>
            {barbers.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>Hora</span>
          <select className="input" value={start} onChange={(e) => setStart(e.target.value)}>
            <option value="">{slots.length ? 'Elegir…' : 'Sin horarios libres'}</option>
            {slots.map((t) => (
              <option key={t} value={t}>
                {formatTime(t)}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>Cliente</span>
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} />
        </label>
        <label className="field">
          <span>Teléfono</span>
          <input className="input" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} />
        </label>
        {error && (
          <p className="error full" role="alert">
            {error}
          </p>
        )}
        <div className="editor-actions">
          <button className="btn sm" type="submit">
            Guardar cita
          </button>
          <button className="btn quiet sm" type="button" onClick={onDone}>
            Cancelar
          </button>
        </div>
      </div>
    </form>
  )
}
