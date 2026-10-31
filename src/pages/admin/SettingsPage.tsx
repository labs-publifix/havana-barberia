import { useEffect, useState, type FormEvent } from 'react'
import { useData } from '../../data/DataContext'
import { repo } from '../../data/store'
import type { BusinessSettings } from '../../data/types'
import { dayName, toMin } from '../../lib/time'

const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0]

export default function SettingsPage() {
  const { data, refresh } = useData()
  const [s, setS] = useState<BusinessSettings | null>(null)
  const [msg, setMsg] = useState<{ ok: boolean; text: string }>()

  useEffect(() => {
    if (data && !s) setS(structuredClone(data.settings))
  }, [data, s])

  if (!s) return null

  const setDay = (wd: number, patch: Partial<{ open: string; close: string }> | null) =>
    setS((p) => {
      if (!p) return p
      const hours = [...p.hours]
      hours[wd] = patch === null ? null : { open: '10:00', close: '20:00', ...hours[wd], ...patch }
      return { ...p, hours }
    })

  async function save(e: FormEvent) {
    e.preventDefault()
    if (!s) return
    const bad = s.hours.findIndex((h) => h && toMin(h.close) <= toMin(h.open))
    if (bad !== -1) return setMsg({ ok: false, text: `${dayName(bad)}: la hora de cierre debe ser después de la de apertura.` })
    await repo.saveSettings(s)
    await refresh()
    setMsg({ ok: true, text: 'Cambios guardados.' })
  }

  async function reset() {
    if (!confirm('Esto borra TODAS las citas, servicios y barberos guardados en este navegador y vuelve a los datos de ejemplo. ¿Continuar?')) return
    await repo.reset()
    await refresh()
    setS(null)
    setMsg({ ok: true, text: 'Datos restablecidos.' })
  }

  return (
    <form onSubmit={save}>
      <div className="page-head">
        <h1>Ajustes</h1>
        <button className="btn sm" type="submit">
          Guardar cambios
        </button>
      </div>

      {msg && (
        <p className={msg.ok ? 'notice' : 'notice error'} role="status">
          {msg.text}
        </p>
      )}

      <div style={{ display: 'grid', gap: '1rem' }}>
        <section className="panel">
          <div className="panel-head">
            <h2>Negocio</h2>
          </div>
          <div className="panel-body editor">
            <label className="field">
              <span>Teléfono / WhatsApp</span>
              <input className="input" type="tel" value={s.phone} onChange={(e) => setS({ ...s, phone: e.target.value })} />
            </label>
            <label className="field full">
              <span>Dirección</span>
              <input className="input" value={s.address} onChange={(e) => setS({ ...s, address: e.target.value })} />
            </label>
          </div>
        </section>

        <section className="panel">
          <div className="panel-head">
            <h2>Horario de atención</h2>
          </div>
          <div className="panel-body hours-grid">
            {WEEK_ORDER.map((wd) => {
              const h = s.hours[wd]
              return (
                <div key={wd} style={{ display: 'contents' }}>
                  <span>{dayName(wd)}</span>
                  <label className="check">
                    <input type="checkbox" checked={!!h} onChange={(e) => setDay(wd, e.target.checked ? {} : null)} />
                    Abierto
                  </label>
                  <input className="input num" type="time" value={h?.open ?? ''} disabled={!h} onChange={(e) => setDay(wd, { open: e.target.value })} aria-label={`${dayName(wd)} abre`} />
                  <input className="input num" type="time" value={h?.close ?? ''} disabled={!h} onChange={(e) => setDay(wd, { close: e.target.value })} aria-label={`${dayName(wd)} cierra`} />
                </div>
              )
            })}
          </div>
        </section>

        <section className="panel">
          <div className="panel-head">
            <h2>Reglas de reserva</h2>
          </div>
          <div className="panel-body editor">
            <label className="field">
              <span>Intervalo entre horarios</span>
              <select className="input" value={s.slotStepMin} onChange={(e) => setS({ ...s, slotStepMin: Number(e.target.value) })}>
                {[10, 15, 20, 30, 60].map((n) => (
                  <option key={n} value={n}>
                    {n} min
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>Anticipación mínima</span>
              <select className="input" value={s.minNoticeMin} onChange={(e) => setS({ ...s, minNoticeMin: Number(e.target.value) })}>
                {[0, 30, 60, 120, 240, 1440].map((n) => (
                  <option key={n} value={n}>
                    {n === 0 ? 'Sin mínimo' : n < 60 ? `${n} min` : n === 1440 ? '1 día' : `${n / 60} h`}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>Reservar hasta</span>
              <select className="input" value={s.bookingWindowDays} onChange={(e) => setS({ ...s, bookingWindowDays: Number(e.target.value) })}>
                {[7, 14, 30, 60].map((n) => (
                  <option key={n} value={n}>
                    {n} días adelante
                  </option>
                ))}
              </select>
            </label>
          </div>
        </section>

        <section className="panel">
          <div className="panel-head">
            <h2>Datos de prueba</h2>
          </div>
          <div className="panel-body" style={{ display: 'grid', gap: '0.75rem', justifyItems: 'start' }}>
            <p style={{ color: 'var(--ink-2)', maxWidth: '65ch' }}>
              Por ahora la información se guarda solo en este navegador. Cuando se conecte la base de datos, las citas se compartirán entre todos los dispositivos.
            </p>
            <button className="btn danger sm" type="button" onClick={reset}>
              Restablecer datos de ejemplo
            </button>
          </div>
        </section>
      </div>
    </form>
  )
}
