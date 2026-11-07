import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Plus, Trash2 } from 'lucide-react'
import { Alert } from '@/components/ui/Alert'
import { buttonClass } from '@/components/ui/buttonClass'
import { Skeleton } from '@/components/ui/Skeleton'
import { DAY_NAMES } from '@/lib/schedule'
import { useAdminAuth } from '../auth/AdminAuth'
import { errorMessage } from '../agenda/useAgendaActions'
import type { BonusRule, FinanceSettings } from '../finance'
import { Input, Switch } from '../ui/controls'
import { Card } from '../ui/Panel'
import { Select } from '../ui/Select'
import { useToast } from '../ui/Toast'

const kindLabels: Record<BonusRule['kind'], string> = {
  manual: 'Se marca a mano cada semana',
  services: 'Meta de servicios en la semana',
  products: 'Productos vendidos en la semana',
}

interface Row {
  id: string
  name: string
  kind: BonusRule['kind']
  threshold: string
  amount: string
  active: boolean
}

const toRows = (f: FinanceSettings): Row[] =>
  f.bonuses.map((b) => ({
    id: b.id,
    name: b.name,
    kind: b.kind,
    threshold: b.threshold === null ? '' : String(b.threshold),
    amount: b.amount === null ? '' : String(b.amount),
    active: b.active,
  }))

const digits = (v: string) => v.replace(/\D/g, '').slice(0, 6)

/** Ajustes › Finanzas: payroll week, card terminal fee and fixed-amount bonuses. */
export function FinanceView() {
  const { repo } = useAdminAuth()
  const qc = useQueryClient()
  const toast = useToast()
  const { data } = useQuery({ queryKey: ['admin', 'finance-settings'], queryFn: () => repo.getFinanceSettings() })
  const [form, setForm] = useState<{ weekStartDay: string; fee: string; bonuses: Row[] } | null>(null)
  const [error, setError] = useState<string | null>(null)

  const base = data && {
    weekStartDay: String(data.weekStartDay),
    fee: data.cardFeePercent?.toString() ?? '',
    bonuses: toRows(data),
  }
  const f = form ?? base
  const dirty = !!form && JSON.stringify(form) !== JSON.stringify(base)

  const save = useMutation({
    mutationFn: () =>
      repo.saveFinanceSettings({
        weekStartDay: Number(f!.weekStartDay),
        cardFeePercent: f!.fee === '' ? null : Number(f!.fee),
        bonuses: f!.bonuses.map((b) => ({
          id: b.id,
          name: b.name,
          kind: b.kind,
          threshold: b.kind === 'manual' || b.threshold === '' ? null : Number(b.threshold),
          amount: b.amount === '' ? null : Number(b.amount),
          active: b.active,
        })),
      }),
    onSuccess: async (saved) => {
      qc.setQueryData(['admin', 'finance-settings'], saved)
      setForm(null)
      setError(null)
      await qc.invalidateQueries({ queryKey: ['admin'] })
      toast('Finanzas guardadas')
    },
    onError: (e) => setError(errorMessage(e)),
  })

  if (!f) return <Skeleton className="h-72 rounded-lg" aria-busy="true" />
  const set = (patch: Partial<typeof f>) => setForm({ ...f, ...patch })
  const setBonus = (i: number, patch: Partial<Row>) =>
    set({ bonuses: f.bonuses.map((b, k) => (k === i ? { ...b, ...patch } : b)) })

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-6">
      <Card title="Nómina" description="Cómo se arma la semana de pago.">
        <div className="grid gap-5 sm:grid-cols-2">
          <Select
            label="La semana de nómina empieza el"
            value={f.weekStartDay}
            onValueChange={(weekStartDay) => set({ weekStartDay })}
            options={[1, 2, 3, 4, 5, 6, 0].map((d) => ({ value: String(d), label: DAY_NAMES[d]! }))}
            hint="Comisiones, Cierre, Ventas y Reportes usan esta semana."
          />
          <Input
            label="Comisión de la terminal"
            suffix="%"
            inputMode="decimal"
            placeholder="Sin capturar"
            value={f.fee}
            onChange={(e) => set({ fee: e.target.value.replace(/[^\d.]/g, '').slice(0, 5) })}
            hint="La absorbe la barbería: las propinas con tarjeta llegan completas al barbero."
          />
        </div>
      </Card>

      <Card
        title="Bonos"
        description="Montos fijos que se suman a la nómina. Captura el monto para activarlos."
        actions={
          <button
            type="button"
            onClick={() =>
              set({
                bonuses: [
                  ...f.bonuses,
                  {
                    id: `bono-${Date.now().toString(36)}`,
                    name: '',
                    kind: 'manual',
                    threshold: '',
                    amount: '',
                    active: true,
                  },
                ],
              })
            }
            className={buttonClass({ variant: 'secondary', size: 'sm' })}
          >
            <Plus className="size-4" aria-hidden /> Agregar bono
          </button>
        }
        bodyClassName="p-0"
      >
        <ul className="divide-y divide-line" aria-label="Bonos">
          {f.bonuses.map((b, i) => (
            <li
              key={b.id}
              className="grid gap-3 px-5 py-4 md:grid-cols-[minmax(0,1.3fr)_minmax(0,1.6fr)_110px_120px_auto] md:items-end"
            >
              <Input label="Nombre del bono" value={b.name} onChange={(e) => setBonus(i, { name: e.target.value })} />
              <Select
                label="Cómo se gana"
                value={b.kind}
                onValueChange={(kind) => setBonus(i, { kind: kind as Row['kind'] })}
                options={(Object.keys(kindLabels) as Row['kind'][]).map((k) => ({ value: k, label: kindLabels[k] }))}
              />
              {b.kind === 'manual' ? (
                <span className="hidden md:block" />
              ) : (
                <Input
                  label={b.kind === 'services' ? 'Servicios' : 'Productos'}
                  inputMode="numeric"
                  placeholder="Meta"
                  value={b.threshold}
                  onChange={(e) => setBonus(i, { threshold: digits(e.target.value) })}
                />
              )}
              <Input
                label="Monto"
                prefix="$"
                inputMode="numeric"
                placeholder="—"
                value={b.amount}
                onChange={(e) => setBonus(i, { amount: digits(e.target.value) })}
              />
              <div className="flex items-center justify-between gap-3 md:justify-end md:pb-2">
                <Switch label="Activo" checked={b.active} onChange={(active) => setBonus(i, { active })} />
                <button
                  type="button"
                  onClick={() => set({ bonuses: f.bonuses.filter((_, k) => k !== i) })}
                  aria-label={`Quitar bono ${b.name || 'sin nombre'}`}
                  className="grid size-10 place-items-center rounded-full text-fg-muted hover:bg-fg/5 hover:text-fg focus-visible:outline focus-visible:outline-2 focus-visible:outline-focus"
                >
                  <Trash2 className="size-4" aria-hidden />
                </button>
              </div>
            </li>
          ))}
        </ul>
      </Card>

      <Card title="Reglas de comisión acordadas">
        <ul className="grid list-disc gap-2 pl-5 text-sm leading-relaxed">
          <li>Cada barbero tiene su propia comisión (Equipo › Comisión), en porcentaje o monto fijo.</li>
          <li>
            Combos: la comisión se calcula sobre el precio del combo con el porcentaje del barbero. Si un combo debe
            pagar distinto, ponle un monto propio en su comisión.
          </li>
          <li>El corte gratis de la tarjeta de lealtad no se cobra y no paga comisión.</li>
          <li>La comisión de la terminal la absorbe la barbería.</li>
        </ul>
      </Card>

      {error && (
        <Alert tone="danger" title="No se pudo guardar">
          {error}
        </Alert>
      )}
      {dirty && (
        <div
          role="region"
          aria-label="Cambios sin guardar en finanzas"
          className="sticky bottom-4 z-10 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-line bg-raised px-5 py-3 shadow-lg"
        >
          <p className="text-sm font-medium">Tienes cambios sin guardar.</p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setForm(null)}
              className={buttonClass({ variant: 'secondary', size: 'sm' })}
            >
              Descartar
            </button>
            <button
              type="button"
              disabled={save.isPending}
              onClick={() => save.mutate()}
              className={buttonClass({ size: 'sm' })}
            >
              Guardar cambios
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
