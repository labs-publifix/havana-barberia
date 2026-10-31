import { useState, type FormEvent } from 'react'
import { Plus } from 'lucide-react'
import { useData } from '../../data/DataContext'
import { newId, repo } from '../../data/store'
import type { Barber, Service } from '../../data/types'
import { dayName, money } from '../../lib/time'

const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0]

/* ---------------- Servicios ---------------- */

export function Services() {
  const { data, refresh } = useData()
  const [editing, setEditing] = useState<Service | null>(null)
  if (!data) return null

  const blank: Service = { id: newId(), name: '', description: '', durationMin: 30, price: 0, active: true }

  return (
    <>
      <div className="page-head">
        <h1>Servicios</h1>
        <button className="btn sm" onClick={() => setEditing(blank)}>
          <Plus size={16} aria-hidden /> Agregar servicio
        </button>
      </div>
      {editing && (
        <ServiceEditor
          key={editing.id}
          initial={editing}
          onClose={() => setEditing(null)}
          onSaved={async () => {
            await refresh()
            setEditing(null)
          }}
        />
      )}
      <div className="panel table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th>Servicio</th>
              <th>Duración</th>
              <th>Precio</th>
              <th>Visible</th>
              <th>
                <span className="visually-hidden">Acciones</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {data.services.map((s) => (
              <tr key={s.id}>
                <td>
                  {s.name}
                  <br />
                  <span style={{ color: 'var(--muted)' }}>{s.description}</span>
                </td>
                <td className="num">{s.durationMin} min</td>
                <td className="num">{money(s.price)}</td>
                <td>{s.active ? 'Sí' : 'Oculto'}</td>
                <td style={{ textAlign: 'right' }}>
                  <button className="btn quiet sm" onClick={() => setEditing(s)}>
                    Editar
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  )
}

function ServiceEditor({ initial, onClose, onSaved }: { initial: Service; onClose: () => void; onSaved: () => void }) {
  const { data } = useData()
  const [s, setS] = useState(initial)
  const [error, setError] = useState<string>()
  const exists = data?.services.some((x) => x.id === initial.id)
  const set = <K extends keyof Service>(k: K, v: Service[K]) => setS((p) => ({ ...p, [k]: v }))

  async function save(e: FormEvent) {
    e.preventDefault()
    if (!s.name.trim()) return setError('El servicio necesita un nombre.')
    if (s.durationMin < 5) return setError('La duración mínima es de 5 minutos.')
    await repo.saveService({ ...s, name: s.name.trim(), description: s.description.trim() })
    onSaved()
  }

  async function remove() {
    if (!confirm(`¿Eliminar "${initial.name}"? Las citas pasadas se conservan.`)) return
    await repo.deleteService(initial.id)
    onSaved()
  }

  return (
    <form className="panel" onSubmit={save} style={{ marginBottom: '1.5rem' }}>
      <div className="panel-head">
        <h2>{exists ? `Editar ${initial.name}` : 'Nuevo servicio'}</h2>
      </div>
      <div className="panel-body editor">
        <label className="field">
          <span>Nombre</span>
          <input className="input" value={s.name} onChange={(e) => set('name', e.target.value)} autoFocus />
        </label>
        <label className="field">
          <span>Duración (min)</span>
          <input className="input num" type="number" min={5} step={5} value={s.durationMin} onChange={(e) => set('durationMin', Number(e.target.value))} />
        </label>
        <label className="field">
          <span>Precio (MXN)</span>
          <input className="input num" type="number" min={0} step={10} value={s.price} onChange={(e) => set('price', Number(e.target.value))} />
        </label>
        <label className="field full">
          <span>Descripción</span>
          <input className="input" value={s.description} onChange={(e) => set('description', e.target.value)} />
        </label>
        <label className="check full">
          <input type="checkbox" checked={s.active} onChange={(e) => set('active', e.target.checked)} />
          Visible para reservar
        </label>
        {error && (
          <p className="error full" role="alert">
            {error}
          </p>
        )}
        <div className="editor-actions">
          <button className="btn sm" type="submit">
            Guardar
          </button>
          <button className="btn quiet sm" type="button" onClick={onClose}>
            Cancelar
          </button>
          {exists && (
            <button className="btn danger sm" type="button" onClick={remove} style={{ marginLeft: 'auto' }}>
              Eliminar
            </button>
          )}
        </div>
      </div>
    </form>
  )
}

/* ---------------- Barberos ---------------- */

export function Barbers() {
  const { data, refresh } = useData()
  const [editing, setEditing] = useState<Barber | null>(null)
  if (!data) return null

  const blank: Barber = { id: newId(), name: '', bio: '', active: true, workDays: [1, 2, 3, 4, 5, 6] }

  return (
    <>
      <div className="page-head">
        <h1>Barberos</h1>
        <button className="btn sm" onClick={() => setEditing(blank)}>
          <Plus size={16} aria-hidden /> Agregar barbero
        </button>
      </div>
      {editing && (
        <BarberEditor
          key={editing.id}
          initial={editing}
          onClose={() => setEditing(null)}
          onSaved={async () => {
            await refresh()
            setEditing(null)
          }}
        />
      )}
      <div className="panel table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th>Nombre</th>
              <th>Días</th>
              <th>Estado</th>
              <th>
                <span className="visually-hidden">Acciones</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {data.barbers.map((b) => (
              <tr key={b.id}>
                <td>
                  {b.name}
                  <br />
                  <span style={{ color: 'var(--muted)' }}>{b.bio}</span>
                </td>
                <td>
                  {WEEK_ORDER.filter((d) => b.workDays.includes(d))
                    .map((d) => dayName(d).slice(0, 3))
                    .join(', ') || '—'}
                </td>
                <td>{b.active ? 'Activo' : 'Inactivo'}</td>
                <td style={{ textAlign: 'right' }}>
                  <button className="btn quiet sm" onClick={() => setEditing(b)}>
                    Editar
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  )
}

function BarberEditor({ initial, onClose, onSaved }: { initial: Barber; onClose: () => void; onSaved: () => void }) {
  const { data } = useData()
  const [b, setB] = useState(initial)
  const [error, setError] = useState<string>()
  const exists = data?.barbers.some((x) => x.id === initial.id)

  const toggleDay = (d: number) =>
    setB((p) => ({ ...p, workDays: p.workDays.includes(d) ? p.workDays.filter((x) => x !== d) : [...p.workDays, d] }))

  async function save(e: FormEvent) {
    e.preventDefault()
    if (!b.name.trim()) return setError('Escribe el nombre del barbero.')
    await repo.saveBarber({ ...b, name: b.name.trim(), bio: b.bio.trim() })
    onSaved()
  }

  async function remove() {
    const pending = data?.appointments.some((a) => a.barberId === initial.id && a.status === 'confirmada')
    if (pending) {
      setError('Tiene citas pendientes. Márcalo como inactivo o cancela sus citas antes de eliminarlo.')
      return
    }
    if (!confirm(`¿Eliminar a ${initial.name}?`)) return
    await repo.deleteBarber(initial.id)
    onSaved()
  }

  return (
    <form className="panel" onSubmit={save} style={{ marginBottom: '1.5rem' }}>
      <div className="panel-head">
        <h2>{exists ? `Editar ${initial.name}` : 'Nuevo barbero'}</h2>
      </div>
      <div className="panel-body editor">
        <label className="field">
          <span>Nombre</span>
          <input className="input" value={b.name} onChange={(e) => setB({ ...b, name: e.target.value })} autoFocus />
        </label>
        <label className="field full">
          <span>Descripción corta</span>
          <input className="input" value={b.bio} onChange={(e) => setB({ ...b, bio: e.target.value })} placeholder="Especialidad, años de experiencia…" />
        </label>
        <fieldset className="full" style={{ border: 0, padding: 0, margin: 0 }}>
          <legend className="field" style={{ marginBottom: 6, fontWeight: 500, fontSize: '0.875rem' }}>
            Días que trabaja
          </legend>
          <div className="weekdays">
            {WEEK_ORDER.map((d) => (
              <label key={d} className="check">
                <input type="checkbox" checked={b.workDays.includes(d)} onChange={() => toggleDay(d)} />
                {dayName(d)}
              </label>
            ))}
          </div>
        </fieldset>
        <label className="check full">
          <input type="checkbox" checked={b.active} onChange={(e) => setB({ ...b, active: e.target.checked })} />
          Activo (recibe reservas)
        </label>
        {error && (
          <p className="error full" role="alert">
            {error}
          </p>
        )}
        <div className="editor-actions">
          <button className="btn sm" type="submit">
            Guardar
          </button>
          <button className="btn quiet sm" type="button" onClick={onClose}>
            Cancelar
          </button>
          {exists && (
            <button className="btn danger sm" type="button" onClick={remove} style={{ marginLeft: 'auto' }}>
              Eliminar
            </button>
          )}
        </div>
      </div>
    </form>
  )
}
