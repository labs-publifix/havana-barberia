import { useState, type KeyboardEvent } from 'react'
import { ArrowLeftRight, Banknote, CreditCard, type LucideIcon } from 'lucide-react'
import { Alert } from '@/components/ui/Alert'
import { buttonClass } from '@/components/ui/buttonClass'
import { Dialog } from '@/components/ui/Dialog'
import type { Appointment, PaymentMethod, Service } from '@/domain/types'
import { cn } from '@/lib/cn'
import { money } from '@/lib/time'
import { methodLabels } from '../cash'
import type { PaymentInput } from '../domain'
import { Input, Segmented, Switch } from '../ui/controls'

const METHODS: { value: PaymentMethod; icon: LucideIcon }[] = [
  { value: 'cash', icon: Banknote },
  { value: 'card', icon: CreditCard },
  { value: 'transfer', icon: ArrowLeftRight },
]
const QUICK_TIPS = [20, 50, 100]

/**
 * Completing = charging: how the customer paid and whether they left a tip
 * (and how). Feeds the daily cash count and, later, finance.
 */
export function CompleteDialog({
  appointment: a,
  open,
  busy,
  error,
  onCancel,
  onConfirm,
  reward,
}: {
  /** Loyalty free cut the customer can use on this visit (the haircut it covers). */
  reward?: Service | null
  appointment: Appointment
  open: boolean
  busy: boolean
  error: string | null
  onCancel: () => void
  onConfirm: (payment: PaymentInput) => void
}) {
  const [method, setMethod] = useState<PaymentMethod | null>(null)
  const [hasTip, setHasTip] = useState(false)
  const [tip, setTip] = useState('')
  const [tipMethod, setTipMethod] = useState<PaymentMethod | null>(null)
  const [local, setLocal] = useState<string | null>(null)
  const [useReward, setUseReward] = useState(false)
  const [openFor, setOpenFor] = useState<string | null>(null)
  if (open && openFor !== a.id) {
    setOpenFor(a.id)
    setMethod(null)
    setHasTip(false)
    setTip('')
    setTipMethod(null)
    setLocal(null)
    setUseReward(false)
  }
  if (!open && openFor) setOpenFor(null)

  const tipAmount = hasTip ? Number(tip || 0) : 0
  const charge = a.totalPrice - (useReward && reward ? reward.price : 0)
  const total = charge + tipAmount

  const onKey = (e: KeyboardEvent<HTMLButtonElement>, i: number) => {
    const d =
      e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 0
    if (!d) return
    e.preventDefault()
    const next = METHODS[(i + d + METHODS.length) % METHODS.length]!.value
    setMethod(next)
    ;(e.currentTarget.parentElement?.querySelector(`[data-value="${next}"]`) as HTMLElement | null)?.focus()
  }

  const confirm = () => {
    // Nothing to charge (free cut, no tip): no payment method needed.
    const m = method ?? (total === 0 ? 'cash' : null)
    if (!m) return setLocal('Elige cómo pagó.')
    if (hasTip && tipAmount <= 0) return setLocal('Escribe el monto de la propina o desactívala.')
    setLocal(null)
    onConfirm({
      method: m,
      tip: tipAmount,
      tipMethod: hasTip ? (tipMethod ?? m) : m,
      ...(useReward && reward ? { useReward: true } : {}),
    })
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => !o && onCancel()}
      title="Completar y cobrar"
      description={`${a.customer.name} · servicios ${money(a.totalPrice)}`}
      footer={
        <>
          <button type="button" onClick={onCancel} className={buttonClass({ variant: 'secondary', size: 'sm' })}>
            Volver
          </button>
          <button type="button" onClick={confirm} disabled={busy} className={buttonClass({ size: 'sm' })}>
            {busy ? 'Guardando…' : `Completar · ${money(total)}`}
          </button>
        </>
      }
    >
      <div className="grid gap-5">
        {(local || error) && <Alert tone="danger" title={(local || error)!} />}

        {reward && (
          <div className="rounded-lg border-[1.5px] border-aqua-800/40 bg-aqua-500/10 p-4">
            <Switch
              label="Usar su corte gratis"
              description={`Tarjeta de lealtad completa: no se cobra ${reward.name} (${money(reward.price)}) y no genera comisión.`}
              checked={useReward}
              onChange={setUseReward}
            />
          </div>
        )}

        <div className="grid gap-2">
          <p id="pay-method" className="text-[13px] font-medium">
            ¿Cómo pagó?
          </p>
          <div role="radiogroup" aria-labelledby="pay-method" className="grid grid-cols-3 gap-2">
            {METHODS.map(({ value, icon: Icon }, i) => {
              const on = method === value
              return (
                <button
                  key={value}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  data-value={value}
                  tabIndex={on || (!method && i === 0) ? 0 : -1}
                  onClick={() => {
                    setMethod(value)
                    setLocal(null)
                  }}
                  onKeyDown={(e) => onKey(e, i)}
                  className={cn(
                    'grid h-[72px] place-items-center content-center gap-1.5 rounded-lg border-[1.5px] text-sm font-semibold transition-colors duration-fast',
                    'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus',
                    on ? 'border-ink-950 bg-ink-950 text-white' : 'border-line-strong bg-raised hover:border-fg',
                  )}
                >
                  <Icon className="size-5" strokeWidth={1.75} aria-hidden />
                  {methodLabels[value]}
                </button>
              )
            })}
          </div>
        </div>

        <div className="grid gap-3 rounded-lg border border-line p-4">
          <Switch label="Dejó propina" checked={hasTip} onChange={setHasTip} />
          {hasTip && (
            <>
              <div className="flex flex-wrap items-end gap-2">
                <div className="w-28">
                  <Input
                    label="Propina"
                    inputMode="numeric"
                    prefix="$"
                    placeholder="0"
                    value={tip}
                    onChange={(e) => setTip(e.target.value.replace(/[^\d]/g, ''))}
                    autoFocus
                  />
                </div>
                {QUICK_TIPS.map((q) => (
                  <button
                    key={q}
                    type="button"
                    onClick={() => setTip(String(q))}
                    className={buttonClass({ variant: 'secondary', size: 'sm', className: 'tabular' })}
                  >
                    {money(q)}
                  </button>
                ))}
              </div>
              <p className="-mb-1 text-[13px] font-medium" aria-hidden>
                La propina se pagó con
              </p>
              <Segmented<PaymentMethod>
                label="La propina se pagó con"
                value={tipMethod ?? method ?? 'cash'}
                onChange={setTipMethod}
                options={METHODS.map((m) => ({ value: m.value, label: methodLabels[m.value] }))}
                className="max-w-full justify-self-start overflow-x-auto"
              />
            </>
          )}
        </div>

        <dl className="grid gap-1 rounded-lg bg-surface px-4 py-3 text-sm">
          <div className="flex justify-between">
            <dt className="text-fg-muted">Servicios</dt>
            <dd className="tabular">{money(a.totalPrice)}</dd>
          </div>
          {useReward && reward && (
            <div className="flex justify-between">
              <dt className="text-fg-muted">Corte gratis</dt>
              <dd className="tabular">−{money(reward.price)}</dd>
            </div>
          )}
          <div className="flex justify-between">
            <dt className="text-fg-muted">Propina</dt>
            <dd className="tabular">{money(tipAmount)}</dd>
          </div>
          <div className="flex justify-between border-t border-line pt-1.5 text-base font-semibold">
            <dt>Total cobrado</dt>
            <dd className="tabular">{money(total)}</dd>
          </div>
        </dl>
      </div>
    </Dialog>
  )
}
