import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Minus, Package, Plus, ShoppingBag } from 'lucide-react'
import { Alert } from '@/components/ui/Alert'
import { buttonClass } from '@/components/ui/buttonClass'
import { Skeleton } from '@/components/ui/Skeleton'
import { business } from '@/config/business'
import type { PaymentMethod } from '@/domain/types'
import { addDays, capitalize, formatDay, formatTime12, localDate, localTime, money } from '@/lib/time'
import { useAdminAuth } from '../auth/AdminAuth'
import { errorMessage } from '../agenda/useAgendaActions'
import { methodLabels } from '../cash'
import { weekStart } from '../finance'
import { Segmented } from '../ui/controls'
import { Card, PageHeader, StatCard } from '../ui/Panel'
import { Select } from '../ui/Select'
import { SidePanel } from '../ui/SidePanel'
import { useToast } from '../ui/Toast'
import { WeekPicker } from '../ui/WeekPicker'

const tz = business.hours.timeZone

interface Ticket {
  id: string
  at: string
  kind: 'servicio' | 'producto'
  title: string
  detail: string
  staff: string
  method: PaymentMethod
  total: number
}

/** Ventas (phase-2 preview): every ticket of the week (paid appointments and counter sales of products). */
export default function Sales() {
  const { repo } = useAdminAuth()
  const current = weekStart(localDate(new Date(), tz))
  const [from, setFrom] = useState(current)
  const to = addDays(from, 6)
  const [open, setOpen] = useState(false)
  const { data } = useQuery({ queryKey: ['admin', 'finance', from, to], queryFn: () => repo.getFinance(from, to) })

  if (!data) {
    return (
      <div className="grid gap-4" aria-busy="true">
        <Skeleton className="h-24 rounded-lg" />
        <Skeleton className="h-72 rounded-lg" />
      </div>
    )
  }

  const name = (id: string | null) => data.staff.find((s) => s.id === id)?.name ?? 'Mostrador'
  const svcName = (id: string) => data.services.find((s) => s.id === id)?.name ?? 'Servicio'
  const tickets: Ticket[] = [
    ...data.appointments
      .filter((a) => a.status === 'completed' && a.payment)
      .map((a) => ({
        id: a.id,
        at: a.payment!.paidAt,
        kind: 'servicio' as const,
        title: a.customer.name,
        detail: a.serviceIds.map(svcName).join(' + ') + (a.payment!.tip ? ` · propina ${money(a.payment!.tip)}` : ''),
        staff: name(a.staffId),
        method: a.payment!.method,
        total: a.payment!.amount + a.payment!.tip,
      })),
    ...data.sales.map((s) => ({
      id: s.id,
      at: s.at,
      kind: 'producto' as const,
      title: 'Venta de productos',
      detail: s.items.map((i) => (i.qty > 1 ? `${i.qty} × ${i.name}` : i.name)).join(', '),
      staff: name(s.staffId),
      method: s.method,
      total: s.total,
    })),
  ].sort((a, b) => b.at.localeCompare(a.at))

  const services = tickets.filter((t) => t.kind === 'servicio').reduce((t, x) => t + x.total, 0)
  const products = data.sales.reduce((t, s) => t + s.total, 0)

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-6">
      <PageHeader
        description="Todo lo que se cobró: citas completadas y ventas de productos en mostrador."
        actions={
          <>
            <WeekPicker value={from} onChange={setFrom} current={current} />
            <button type="button" onClick={() => setOpen(true)} className={buttonClass({ size: 'sm' })}>
              <ShoppingBag className="size-4" strokeWidth={2} aria-hidden /> Registrar venta
            </button>
          </>
        }
      />
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Tickets" value={String(tickets.length)} />
        <StatCard label="Servicios y propinas" value={money(services)} />
        <StatCard label="Productos" value={money(products)} />
        <StatCard label="Total" value={money(services + products)} />
      </div>
      <Card title="Tickets de la semana" className="min-w-0" bodyClassName="p-0">
        {tickets.length ? (
          <ul className="divide-y divide-line" aria-label="Tickets">
            {tickets.map((t) => (
              <li
                key={t.id}
                className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-4 gap-y-1 px-5 py-3 text-sm sm:grid-cols-[120px_minmax(0,1fr)_140px_120px_100px] sm:items-center"
              >
                <span className="tabular text-fg-muted">
                  {capitalize(formatDay(localDate(t.at, tz), 'EEE d'))} · {formatTime12(localTime(t.at, tz))}
                </span>
                <span className="tabular text-right font-semibold sm:order-last">{money(t.total)}</span>
                <span className="col-span-2 min-w-0 sm:col-span-1">
                  <span className="flex items-center gap-1.5 font-medium">
                    {t.kind === 'producto' && <Package className="size-4 shrink-0 text-fg-muted" aria-hidden />}
                    <span className="truncate">{t.title}</span>
                  </span>
                  <span className="block truncate text-[13px] text-fg-muted">{t.detail}</span>
                </span>
                <span className="text-fg-muted">{t.staff}</span>
                <span className="text-fg-muted">{methodLabels[t.method]}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="p-5 text-sm text-fg-muted">Sin ventas esta semana.</p>
        )}
      </Card>
      <SalePanel open={open} onClose={() => setOpen(false)} staff={data.staff.filter((s) => s.active)} />
    </div>
  )
}

function SalePanel({
  open,
  onClose,
  staff,
}: {
  open: boolean
  onClose: () => void
  staff: { id: string; name: string }[]
}) {
  const { repo } = useAdminAuth()
  const qc = useQueryClient()
  const toast = useToast()
  const { data: products } = useQuery({
    queryKey: ['admin', 'products'],
    queryFn: () => repo.listProducts(),
    enabled: open,
  })
  const [qty, setQty] = useState<Record<string, number>>({})
  const [staffId, setStaffId] = useState('')
  const [method, setMethod] = useState<PaymentMethod>('cash')
  const [error, setError] = useState<string | null>(null)
  const items = Object.entries(qty).filter(([, n]) => n > 0)
  const total = items.reduce((t, [id, n]) => t + (products?.find((p) => p.id === id)?.price ?? 0) * n, 0)

  const reset = () => {
    setQty({})
    setStaffId('')
    setMethod('cash')
    setError(null)
  }
  const save = useMutation({
    mutationFn: () =>
      repo.createSale({
        items: items.map(([productId, n]) => ({ productId, qty: n })),
        staffId: staffId || null,
        method,
      }),
    onSuccess: async (s) => {
      await qc.invalidateQueries({ queryKey: ['admin', 'finance'] })
      toast(`Venta registrada · ${money(s.total)}`)
      reset()
      onClose()
    },
    onError: (e) => setError(errorMessage(e)),
  })
  const step = (id: string, d: number) => setQty((q) => ({ ...q, [id]: Math.max(0, Math.min(99, (q[id] ?? 0) + d)) }))

  return (
    <SidePanel
      open={open}
      onOpenChange={(o) => !o && onClose()}
      title="Registrar venta"
      description="Productos vendidos en mostrador."
      footer={
        <>
          <button type="button" onClick={onClose} className={buttonClass({ variant: 'secondary', size: 'sm' })}>
            Cancelar
          </button>
          <button
            type="button"
            disabled={!items.length || save.isPending}
            onClick={() => save.mutate()}
            className={buttonClass({ size: 'sm' })}
          >
            Cobrar {money(total)}
          </button>
        </>
      }
    >
      <div className="grid gap-5">
        {error && <Alert tone="danger" title={error} />}
        {!products ? (
          <Skeleton className="h-48 rounded-lg" />
        ) : products.filter((p) => p.active).length === 0 ? (
          <p className="text-sm text-fg-muted">
            No hay productos a la venta. Agrégalos en Servicios y precios › Productos.
          </p>
        ) : (
          <ul className="divide-y divide-line rounded-md border border-line" aria-label="Productos">
            {products
              .filter((p) => p.active)
              .map((p) => {
                const n = qty[p.id] ?? 0
                return (
                  <li key={p.id} className="flex items-center gap-3 px-4 py-2.5">
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">{p.name}</span>
                      <span className="tabular text-[13px] text-fg-muted">{money(p.price)}</span>
                    </span>
                    <button
                      type="button"
                      aria-label={`Quitar uno de ${p.name}`}
                      disabled={!n}
                      onClick={() => step(p.id, -1)}
                      className="grid size-10 place-items-center rounded-full border border-line hover:border-fg disabled:opacity-30"
                    >
                      <Minus className="size-4" aria-hidden />
                    </button>
                    <span className="tabular w-6 text-center font-semibold" aria-label={`Cantidad de ${p.name}`}>
                      {n}
                    </span>
                    <button
                      type="button"
                      aria-label={`Agregar uno de ${p.name}`}
                      onClick={() => step(p.id, 1)}
                      className="grid size-10 place-items-center rounded-full border border-line hover:border-fg"
                    >
                      <Plus className="size-4" aria-hidden />
                    </button>
                  </li>
                )
              })}
          </ul>
        )}
        <Select
          label="¿Quién lo vendió?"
          value={staffId}
          onValueChange={setStaffId}
          options={[
            { value: '', label: 'Sin barbero (mostrador)' },
            ...staff.map((s) => ({ value: s.id, label: s.name })),
          ]}
          hint="El barbero gana la comisión del producto, si está capturada."
        />
        <div className="grid gap-1.5">
          <p className="text-[13px] font-medium">Forma de pago</p>
          <Segmented<PaymentMethod>
            label="Forma de pago"
            value={method}
            onChange={setMethod}
            options={(['cash', 'card', 'transfer'] as const).map((m) => ({ value: m, label: methodLabels[m] }))}
            className="justify-self-start"
          />
        </div>
      </div>
    </SidePanel>
  )
}
