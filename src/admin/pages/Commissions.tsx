import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { ChevronDown } from 'lucide-react'
import { routes } from '@/app/routes'
import { Alert } from '@/components/ui/Alert'
import { Avatar } from '@/components/booking/Avatar'
import { Badge } from '@/components/ui/Badge'
import { Skeleton } from '@/components/ui/Skeleton'
import { business } from '@/config/business'
import { cn } from '@/lib/cn'
import { addDays, capitalize, formatDay, money } from '@/lib/time'
import { useFinanceWeek } from '../useFinanceWeek'
import { useAdminAuth, useAdminSession } from '../auth/AdminAuth'
import { earnings, type BarberEarnings } from '../finance'
import { commissionLabel } from '../team/model'
import { PageHeader } from '../ui/Panel'
import { WeekPicker } from '../ui/WeekPicker'

const tz = business.hours.timeZone

/** Comisiones (phase-2 preview): what each barber earned in the week, service by service. */
export default function Commissions() {
  const { repo } = useAdminAuth()
  const { user } = useAdminSession()
  const isBarber = user.role === 'barber'
  const { from, setFrom, current } = useFinanceWeek()
  const to = addDays(from, 6)
  const { data } = useQuery({ queryKey: ['admin', 'finance', from, to], queryFn: () => repo.getFinance(from, to) })

  // A closed payroll week shows its frozen receipts.
  const rows = data?.close
    ? data.close.rows
    : data
      ? earnings({
          ...data,
          bonusRules: data.settings.bonuses,
          discountCommission: data.settings.discountCommission,
          from,
          to,
          timeZone: tz,
        }).filter((r) => r.services > 0 || data.staff.find((s) => s.id === r.staffId)?.active)
      : null

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-6">
      <PageHeader
        description={
          isBarber
            ? 'Tus servicios completados de la semana y lo que te toca por cada uno.'
            : 'Lo que gana cada barbero por los servicios completados, según la comisión capturada en Equipo.'
        }
        actions={<WeekPicker value={from} onChange={setFrom} current={current} />}
      />
      <Alert tone="info" title="Adelanto de la fase 2">
        Los cálculos se validan con la barbería antes de usarse para pagar.
      </Alert>
      {!rows || !data ? (
        <div className="grid gap-4 md:grid-cols-2" aria-busy="true">
          <Skeleton className="h-48 rounded-lg" />
          <Skeleton className="h-48 rounded-lg" />
        </div>
      ) : (
        <ul className="grid grid-cols-[minmax(0,1fr)] gap-4" aria-label="Comisiones por barbero">
          {rows.map((r) => (
            <EarningsCard
              key={r.staffId}
              r={r}
              photo={data.staff.find((s) => s.id === r.staffId)?.photoUrl ?? null}
              rule={commissionLabel(data.commissions.find((c) => c.staffId === r.staffId))}
              canEditRule={!isBarber}
            />
          ))}
        </ul>
      )}
    </div>
  )
}

function EarningsCard({
  r,
  photo,
  rule,
  canEditRule,
}: {
  r: BarberEarnings
  photo: string | null
  rule: string
  canEditRule: boolean
}) {
  const [open, setOpen] = useState(false)
  const stats: [string, string, string?][] = [
    ['Servicios', String(r.services)],
    ['Ventas', money(r.sales)],
    ['Comisión', money(r.commission), r.missing ? `${r.missing} sin capturar` : undefined],
    ['Propinas', money(r.tips)],
  ]
  return (
    <li className="rounded-lg border border-line bg-raised">
      <div className="flex flex-wrap items-center gap-4 p-5">
        <Avatar name={r.name} src={photo} size={48} />
        <div className="min-w-0 flex-1">
          <p className="text-base font-semibold">{r.name}</p>
          <p className="text-sm text-fg-muted">
            Comisión: {rule}
            {canEditRule && (
              <>
                {' · '}
                <Link to={routes.adminSection('equipo')} className="underline underline-offset-2 hover:text-fg">
                  Cambiar en Equipo
                </Link>
              </>
            )}
          </p>
        </div>
        <div className="text-right">
          <p className="text-[13px] text-fg-muted">Comisión + propinas</p>
          <p className="tabular text-2xl font-semibold tracking-[-0.02em]">{money(r.commission + r.tips)}</p>
        </div>
      </div>
      <dl className="grid grid-cols-2 gap-px border-y border-line bg-line sm:grid-cols-4">
        {stats.map(([label, value, note]) => (
          <div key={label} className="bg-raised px-5 py-3">
            <dt className="text-[13px] text-fg-muted">{label}</dt>
            <dd className="tabular text-lg font-semibold">
              {value}
              {note && (
                <Badge tone="warning" className="ml-2 align-middle">
                  {note}
                </Badge>
              )}
            </dd>
          </div>
        ))}
      </dl>
      {r.lines.length > 0 ? (
        <>
          <button
            type="button"
            aria-expanded={open}
            onClick={() => setOpen((o) => !o)}
            className="flex w-full items-center justify-between px-5 py-3 text-sm font-semibold hover:bg-fg/[0.03] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-focus"
          >
            {open ? 'Ocultar detalle' : `Ver detalle (${r.lines.length} ${r.lines.length === 1 ? 'cita' : 'citas'})`}
            <ChevronDown className={cn('size-4 transition-transform', open && 'rotate-180')} aria-hidden />
          </button>
          {open && (
            <div className="relative overflow-x-auto border-t border-line">
              <table className="w-full min-w-[560px] text-sm">
                <caption className="sr-only">Detalle de {r.name}</caption>
                <thead>
                  <tr className="text-left text-[13px] text-fg-muted">
                    <th scope="col" className="px-5 py-2 font-medium">
                      Día
                    </th>
                    <th scope="col" className="px-3 py-2 font-medium">
                      Cliente y servicios
                    </th>
                    <th scope="col" className="px-3 py-2 text-right font-medium">
                      Precio
                    </th>
                    <th scope="col" className="px-3 py-2 text-right font-medium">
                      Comisión
                    </th>
                    <th scope="col" className="px-5 py-2 text-right font-medium">
                      Propina
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {r.lines.map((l) => {
                    const missing = l.services.some((s) => s.commission === null)
                    const c = l.services.reduce((t, s) => t + (s.commission ?? 0), 0)
                    return (
                      <tr key={l.appointmentId}>
                        <td className="tabular whitespace-nowrap px-5 py-2.5">
                          {capitalize(formatDay(l.date, 'EEE d'))}
                        </td>
                        <td className="px-3 py-2.5">
                          <span className="block font-medium">{l.customer}</span>
                          <span className="text-[13px] text-fg-muted">{l.services.map((s) => s.name).join(' + ')}</span>
                        </td>
                        <td className="tabular px-3 py-2.5 text-right">{money(l.price)}</td>
                        <td className="tabular px-3 py-2.5 text-right">
                          {missing ? <span className="text-fg-muted">Sin capturar</span> : money(c)}
                        </td>
                        <td className="tabular px-5 py-2.5 text-right">{l.tip ? money(l.tip) : '—'}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </>
      ) : (
        <p className="px-5 py-3 text-sm text-fg-muted">Sin servicios completados esta semana.</p>
      )}
    </li>
  )
}
