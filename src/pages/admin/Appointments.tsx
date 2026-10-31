import { useState } from 'react'
import { useData } from '../../data/DataContext'
import { formatDateShort, formatTime, isoDate, money } from '../../lib/time'
import type { AppointmentStatus } from '../../data/types'
import { STATUS_LABEL, StatusActions, StatusBadge } from './status'

type Scope = 'proximas' | 'pasadas' | 'todas'

export default function Appointments() {
  const { data, refresh } = useData()
  const [scope, setScope] = useState<Scope>('proximas')
  const [status, setStatus] = useState<AppointmentStatus | ''>('')
  const [q, setQ] = useState('')

  if (!data) return null
  const today = isoDate(new Date())
  const needle = q.trim().toLowerCase()
  const rows = data.appointments
    .filter((a) => (scope === 'proximas' ? a.date >= today : scope === 'pasadas' ? a.date < today : true))
    .filter((a) => !status || a.status === status)
    .filter((a) => !needle || a.customerName.toLowerCase().includes(needle) || a.customerPhone.includes(needle) || a.id.includes(needle))
    .sort((a, b) => {
      const k = (a.date + a.start).localeCompare(b.date + b.start)
      return scope === 'pasadas' ? -k : k
    })

  const svc = (id: string) => data.services.find((s) => s.id === id)?.name ?? '—'
  const brb = (id: string) => data.barbers.find((b) => b.id === id)?.name ?? '—'

  return (
    <>
      <div className="page-head">
        <h1>Citas</h1>
        <div className="toolbar">
          <select className="input" value={scope} onChange={(e) => setScope(e.target.value as Scope)} style={{ width: 'auto' }} aria-label="Periodo">
            <option value="proximas">Próximas</option>
            <option value="pasadas">Pasadas</option>
            <option value="todas">Todas</option>
          </select>
          <select className="input" value={status} onChange={(e) => setStatus(e.target.value as AppointmentStatus | '')} style={{ width: 'auto' }} aria-label="Estado">
            <option value="">Todos los estados</option>
            {Object.entries(STATUS_LABEL).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
          <input className="input" type="search" placeholder="Nombre, teléfono o folio" value={q} onChange={(e) => setQ(e.target.value)} style={{ width: 220 }} aria-label="Buscar" />
        </div>
      </div>

      <div className="panel table-wrap">
        {rows.length === 0 ? (
          <p className="empty-state">No hay citas con estos filtros.</p>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>Fecha</th>
                <th>Cliente</th>
                <th>Servicio</th>
                <th>Barbero</th>
                <th>Estado</th>
                <th>
                  <span className="visually-hidden">Acciones</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((a) => (
                <tr key={a.id}>
                  <td className="num">
                    {formatDateShort(a.date)}
                    <br />
                    {formatTime(a.start)}
                  </td>
                  <td>
                    {a.customerName}
                    <br />
                    <span className="num" style={{ color: 'var(--muted)' }}>
                      {a.customerPhone}
                    </span>
                  </td>
                  <td>
                    {svc(a.serviceId)}
                    <br />
                    <span className="num" style={{ color: 'var(--muted)' }}>
                      {money(a.price)}
                    </span>
                  </td>
                  <td>{brb(a.barberId)}</td>
                  <td>
                    <StatusBadge status={a.status} />
                  </td>
                  <td>
                    <div className="toolbar" style={{ justifyContent: 'flex-end' }}>
                      <StatusActions a={a} onChange={refresh} />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  )
}
