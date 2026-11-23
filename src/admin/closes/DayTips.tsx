import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { ChevronRight } from 'lucide-react'
import { routes } from '@/app/routes'
import type { Appointment, PaymentMethod } from '@/domain/types'
import { money } from '@/lib/time'
import { useAdminAuth, useAdminSession } from '../auth/AdminAuth'
import { methodLabels } from '../cash'
import { isFinanceRole } from '../domain'
import { tipFee } from '../tips'
import { Card } from '../ui/Panel'

const METHODS: PaymentMethod[] = ['cash', 'card', 'transfer']

/**
 * Ventas › Caja (one day): the tips each barber earned that day, by how the
 * customer paid them, the card fee and what they get. Paying them is done in
 * Cierres › Propinas (owner and manager), where everything pending adds up.
 */
export function DayTips({ appointments }: { appointments: Appointment[] }) {
  const { repo } = useAdminAuth()
  const { user } = useAdminSession()
  const { data: settings } = useQuery({
    queryKey: ['admin', 'finance-settings'],
    queryFn: () => repo.getFinanceSettings(),
  })
  const { data: team } = useQuery({ queryKey: ['admin', 'team'], queryFn: () => repo.getTeam() })
  const rule = { fee: settings?.cardTipFee ?? 5, over: settings?.cardTipFeeOver ?? 25 }

  const rows = new Map<string, { name: string; by: Record<PaymentMethod, number>; fee: number; net: number }>()
  for (const a of appointments) {
    const p = a.payment
    if (a.status !== 'completed' || !p?.tip) continue
    const r = rows.get(a.staffId) ?? {
      name: team?.staff.find((s) => s.id === a.staffId)?.name ?? 'Barbero',
      by: { cash: 0, card: 0, transfer: 0 },
      fee: 0,
      net: 0,
    }
    const fee = tipFee(p.tip, p.tipMethod, rule)
    r.by[p.tipMethod] += p.tip
    r.fee += fee
    r.net += p.tip - fee
    rows.set(a.staffId, r)
  }
  if (!rows.size) return null
  const list = [...rows.values()]
  const total = list.reduce((t, r) => t + r.net, 0)

  return (
    <Card
      title="Propinas del día por barbero"
      description={`Lo que le toca a cada uno por las propinas de hoy, en todas las formas de pago. Con tarjeta, a las mayores a ${money(rule.over)} se les descuentan ${money(rule.fee)} por la terminal.`}
      actions={
        isFinanceRole(user.role) && (
          <Link
            to={`${routes.adminSection('cierre')}?vista=propinas`}
            className="inline-flex min-h-11 items-center gap-1 text-sm font-medium underline-offset-4 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-focus"
          >
            Pagar en Cierres › Propinas <ChevronRight className="size-4" aria-hidden />
          </Link>
        )
      }
      className="min-w-0"
    >
      <div className="overflow-x-auto">
        <table className="w-full min-w-[560px] text-sm">
          <thead>
            <tr className="border-b border-line text-left text-[12px] text-fg-muted">
              <th className="py-2 pr-3 font-medium">Barbero</th>
              {METHODS.map((m) => (
                <th key={m} className="py-2 pr-3 text-right font-medium">
                  {methodLabels[m]}
                </th>
              ))}
              <th className="py-2 pr-3 text-right font-medium">Terminal</th>
              <th className="py-2 text-right font-medium">Le toca</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {list.map((r) => (
              <tr key={r.name}>
                <td className="py-2 pr-3 font-medium">{r.name}</td>
                {METHODS.map((m) => (
                  <td key={m} className="tabular py-2 pr-3 text-right">
                    {r.by[m] ? money(r.by[m]) : '—'}
                  </td>
                ))}
                <td className="tabular py-2 pr-3 text-right">{r.fee ? `−${money(r.fee)}` : '—'}</td>
                <td className="tabular py-2 text-right font-semibold">{money(r.net)}</td>
              </tr>
            ))}
            <tr className="bg-surface">
              <td className="py-2 pr-3 font-semibold">Total</td>
              <td colSpan={4} />
              <td className="tabular py-2 text-right font-semibold">{money(total)}</td>
            </tr>
          </tbody>
        </table>
      </div>
      <p className="mt-3 text-[13px] text-fg-muted">
        Al pagarlas, salen de la caja como «Pago de propinas» a nombre del barbero (no es gasto del negocio).
      </p>
    </Card>
  )
}
