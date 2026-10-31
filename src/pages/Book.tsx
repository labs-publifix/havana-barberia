import { useMemo, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { useData } from '../data/DataContext'
import { repo, SlotTakenError } from '../data/store'
import { addDays, availableSlots, formatDateLong, formatTime, isoDate, money, parseDate } from '../lib/time'
import { SiteHeader } from '../components/SiteChrome'

const ANY = 'any'

export default function Book() {
  const { data, refresh } = useData()
  const nav = useNavigate()
  const [serviceId, setServiceId] = useState<string>()
  const [barberId, setBarberId] = useState<string>()
  const [date, setDate] = useState<string>()
  const [start, setStart] = useState<string>()
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [notes, setNotes] = useState('')
  const [error, setError] = useState<string>()
  const [sending, setSending] = useState(false)

  const services = data?.services.filter((s) => s.active) ?? []
  const barbers = data?.barbers.filter((b) => b.active) ?? []
  const service = services.find((s) => s.id === serviceId)

  const days = useMemo(() => {
    const n = data?.settings.bookingWindowDays ?? 14
    const today = isoDate(new Date())
    return Array.from({ length: n }, (_, i) => addDays(today, i))
  }, [data?.settings.bookingWindowDays])

  /** hora → barbero que la atendería */
  const slotsFor = useMemo(() => {
    return (d: string): Map<string, string> => {
      const out = new Map<string, string>()
      if (!data || !service || !barberId) return out
      const pool = barberId === ANY ? barbers : barbers.filter((b) => b.id === barberId)
      for (const b of pool) {
        const free = availableSlots({
          date: d,
          durationMin: service.durationMin,
          barber: b,
          settings: data.settings,
          appointments: data.appointments,
        })
        for (const t of free) if (!out.has(t)) out.set(t, b.id)
      }
      return new Map([...out].sort(([a], [b]) => a.localeCompare(b)))
    }
  }, [data, service, barberId, barbers])

  const slots = date ? slotsFor(date) : new Map<string, string>()
  const assignedBarber = start ? barbers.find((b) => b.id === slots.get(start)) : undefined
  const ready = Boolean(service && barberId && date && start && name.trim() && phone.replace(/\D/g, '').length >= 10)

  const pickService = (id: string) => {
    setServiceId(id)
    setStart(undefined)
  }
  const pickBarber = (id: string) => {
    setBarberId(id)
    setStart(undefined)
  }
  const pickDate = (d: string) => {
    setDate(d)
    setStart(undefined)
  }

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (!ready || !service || !date || !start || !assignedBarber) return
    setSending(true)
    setError(undefined)
    try {
      const a = await repo.book({
        serviceId: service.id,
        barberId: assignedBarber.id,
        date,
        start,
        customerName: name.trim(),
        customerPhone: phone.trim(),
        notes: notes.trim(),
      })
      await refresh()
      nav(`/cita/${a.id}`)
    } catch (err) {
      setError(err instanceof SlotTakenError ? err.message : 'No pudimos guardar tu cita. Inténtalo de nuevo.')
      if (err instanceof SlotTakenError) setStart(undefined)
      await refresh()
    } finally {
      setSending(false)
    }
  }

  if (!data) return null

  return (
    <>
      <SiteHeader cta={false} />
      <main className="wrap booking">
        <form onSubmit={submit} noValidate>
          <h1>Reserva tu cita</h1>

          <section className="step" aria-labelledby="s1">
            <div className="step-head">
              <h2 id="s1">Servicio</h2>
            </div>
            <div className="choices">
              {services.map((s) => (
                <button type="button" key={s.id} className="choice" aria-pressed={s.id === serviceId} onClick={() => pickService(s.id)}>
                  <span className="title">{s.name}</span>
                  <span className="num">{money(s.price)}</span>
                  <span className="sub">
                    {s.durationMin} min · {s.description}
                  </span>
                </button>
              ))}
            </div>
          </section>

          <section className={`step${service ? '' : ' locked'}`} aria-labelledby="s2">
            <div className="step-head">
              <h2 id="s2">Barbero</h2>
            </div>
            <div className="choices">
              <button type="button" className="choice" aria-pressed={barberId === ANY} disabled={!service} onClick={() => pickBarber(ANY)}>
                <span className="title">Cualquiera disponible</span>
                <span className="sub">Te mostramos todos los horarios libres.</span>
              </button>
              {barbers.map((b) => (
                <button type="button" key={b.id} className="choice" aria-pressed={b.id === barberId} disabled={!service} onClick={() => pickBarber(b.id)}>
                  <span className="title">{b.name}</span>
                  {b.bio && <span className="sub">{b.bio}</span>}
                </button>
              ))}
            </div>
          </section>

          <section className={`step${barberId ? '' : ' locked'}`} aria-labelledby="s3">
            <div className="step-head">
              <h2 id="s3">Día y hora</h2>
              {date && <span className="num">{formatDateLong(date)}</span>}
            </div>
            <div className="days" role="group" aria-label="Día">
              {days.map((d) => {
                const dt = parseDate(d)
                const open = barberId ? slotsFor(d).size > 0 : false
                return (
                  <button type="button" key={d} className="day" aria-pressed={d === date} disabled={!open} onClick={() => pickDate(d)} aria-label={formatDateLong(d)}>
                    <span className="dw">{dt.toLocaleDateString('es-MX', { weekday: 'short' }).replace('.', '')}</span>
                    <span className="dn num">{dt.getDate()}</span>
                  </button>
                )
              })}
            </div>
            {date && (
              <div className="slots" role="group" aria-label="Hora">
                {[...slots.keys()].map((t) => (
                  <button type="button" key={t} className="slot" aria-pressed={t === start} onClick={() => setStart(t)}>
                    {formatTime(t)}
                  </button>
                ))}
              </div>
            )}
            {date && slots.size === 0 && <p className="empty">No quedan horarios libres este día.</p>}
          </section>

          <section className={`step${start ? '' : ' locked'}`} aria-labelledby="s4">
            <div className="step-head">
              <h2 id="s4">Tus datos</h2>
            </div>
            <div className="form-grid">
              <label className="field">
                <span>Nombre</span>
                <input className="input" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" required disabled={!start} />
              </label>
              <label className="field">
                <span>Teléfono (WhatsApp)</span>
                <input className="input" value={phone} onChange={(e) => setPhone(e.target.value)} type="tel" inputMode="tel" autoComplete="tel" placeholder="10 dígitos" required disabled={!start} />
              </label>
              <label className="field full">
                <span>Notas para el barbero</span>
                <textarea className="input" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Opcional" disabled={!start} />
              </label>
            </div>
          </section>

          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
        </form>

        <aside className="summary" aria-label="Resumen de la cita">
          <div className="pole" aria-hidden />
          <div className="summary-body">
            <dl>
              <div>
                <dt>Servicio</dt>
                <dd>{service ? `${service.name} · ${service.durationMin} min` : '—'}</dd>
              </div>
              <div>
                <dt>Barbero</dt>
                <dd>{assignedBarber?.name ?? (barberId === ANY ? 'Cualquiera disponible' : barbers.find((b) => b.id === barberId)?.name ?? '—')}</dd>
              </div>
              <div>
                <dt>Fecha</dt>
                <dd>{date ? formatDateLong(date) : '—'}</dd>
              </div>
              <div>
                <dt>Hora</dt>
                <dd className="num">{start ? formatTime(start) : '—'}</dd>
              </div>
            </dl>
            <div className="total">
              <span>Total</span>
              <span className="num">{service ? money(service.price) : '—'}</span>
            </div>
            <button className="btn" type="button" onClick={submit} disabled={!ready || sending}>
              {sending ? 'Guardando…' : 'Confirmar cita'}
            </button>
            {start && !ready && <small style={{ color: 'var(--muted)' }}>Escribe tu nombre y un teléfono de 10 dígitos.</small>}
          </div>
        </aside>
      </main>
    </>
  )
}
