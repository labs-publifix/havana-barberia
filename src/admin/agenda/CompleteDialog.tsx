import { useState, type KeyboardEvent } from 'react'
import { ArrowLeftRight, Banknote, CreditCard, Minus, Plus, type LucideIcon } from 'lucide-react'
import { Alert } from '@/components/ui/Alert'
import { buttonClass } from '@/components/ui/buttonClass'
import { SidePanel } from '../ui/SidePanel'
import type { Appointment, AppointmentPayment, PaymentMethod, Product, Service } from '@/domain/types'
import { cn } from '@/lib/cn'
import { durationLabel, money } from '@/lib/time'
import { methodLabels } from '../cash'
import type { PaymentInput } from '../domain'
import { Input, Segmented, Switch } from '../ui/controls'

const METHODS: { value: PaymentMethod; icon: LucideIcon }[] = [
  { value: 'cash', icon: Banknote },
  { value: 'card', icon: CreditCard },
  { value: 'transfer', icon: ArrowLeftRight },
]
const QUICK_TIPS = [20, 50, 100]
const PRINT_KEY = 'havana:print-ticket'
const num = (v: string) => Number(v || 0)
const digits = (v: string) => v.replace(/\D/g, '').slice(0, 6)

function readPrint() {
  try {
    return localStorage.getItem(PRINT_KEY) === '1'
  } catch {
    return false
  }
}

/**
 * Completing = charging, in one ticket: the services (minus the loyalty free
 * cut and an authorized discount), products sold with them, how it was paid
 * (one method or split) and the tip. Feeds the cash count and finance.
 */
export function CompleteDialog({
  appointment: a,
  open,
  busy,
  error,
  onCancel,
  onConfirm,
  reward,
  products = [],
  services = [],
  canAuthorize = false,
  correcting,
  onVoid,
}: {
  appointment: Appointment
  open: boolean
  busy: boolean
  error: string | null
  onCancel: () => void
  /** In correction mode the payment carries the final services and `reason` is set. */
  onConfirm: (payment: PaymentInput & { serviceIds?: string[] }, printTicket: boolean, reason?: string) => void
  /** Loyalty free cut available on this visit and what it covers. */
  reward?: { service: Service; amount: number } | null
  /** Products on sale. */
  products?: Product[]
  /** Catalog services (active ones can be added to the visit). */
  services?: Service[]
  /** The signed-in user is owner or manager (authorizes discounts themselves). */
  canAuthorize?: boolean
  /** «Corregir cobro»: the charge being corrected (owner/developer); the form starts with it. */
  correcting?: AppointmentPayment
  /** «Anular cobro» (correction mode only). */
  onVoid?: (reason: string) => void
}) {
  const [method, setMethod] = useState<PaymentMethod | null>(null)
  const [hasTip, setHasTip] = useState(false)
  const [tip, setTip] = useState('')
  const [tipMethod, setTipMethod] = useState<PaymentMethod | null>(null)
  const [local, setLocal] = useState<string | null>(null)
  const [useReward, setUseReward] = useState(false)
  const [qty, setQty] = useState<Record<string, number>>({})
  const [showProducts, setShowProducts] = useState(false)
  const [addQty, setAddQty] = useState<Record<string, number>>({})
  const [showServices, setShowServices] = useState(false)
  const [hasDiscount, setHasDiscount] = useState(false)
  const [discount, setDiscount] = useState({ amount: '', reason: '', email: '', password: '' })
  const [split, setSplit] = useState(false)
  const [parts, setParts] = useState<Record<PaymentMethod, string>>({ cash: '', card: '', transfer: '' })
  const [print, setPrint] = useState(readPrint)
  const [reason, setReason] = useState('')
  const [confirmVoid, setConfirmVoid] = useState(false)
  const [openFor, setOpenFor] = useState<string | null>(null)
  const fixing = !!correcting
  if (open && openFor !== a.id) {
    setOpenFor(a.id)
    const c = correcting
    setMethod(c && !c.splits?.length ? c.method : null)
    setHasTip(!!c?.tip)
    setTip(c?.tip ? String(c.tip) : '')
    setTipMethod(c?.tip ? c.tipMethod : null)
    setLocal(null)
    setUseReward(!!c?.rewardServiceId)
    setQty(Object.fromEntries((c?.products ?? []).map((i) => [i.productId, i.qty])))
    setShowProducts(!!c?.products?.length)
    // Correcting: the steppers hold every service charged (repeats included).
    setAddQty(c ? a.serviceIds.reduce<Record<string, number>>((m, id) => ({ ...m, [id]: (m[id] ?? 0) + 1 }), {}) : {})
    setShowServices(!!c)
    setHasDiscount(!!c?.discount)
    setDiscount({
      amount: c?.discount ? String(c.discount.amount) : '',
      reason: c?.discount?.reason ?? '',
      email: '',
      password: '',
    })
    setSplit(!!c?.splits?.length)
    setParts({
      cash: String(c?.splits?.find((x) => x.method === 'cash')?.amount ?? ''),
      card: String(c?.splits?.find((x) => x.method === 'card')?.amount ?? ''),
      transfer: String(c?.splits?.find((x) => x.method === 'transfer')?.amount ?? ''),
    })
    setReason('')
    setConfirmVoid(false)
  }
  if (!open && openFor) setOpenFor(null)

  const togglePrint = (on: boolean) => {
    setPrint(on)
    try {
      localStorage.setItem(PRINT_KEY, on ? '1' : '0')
    } catch {
      /* storage blocked: remember for this visit only */
    }
  }

  const rewardOff = useReward && reward ? reward.amount : 0
  const discountOff = hasDiscount ? num(discount.amount) : 0
  // Services added during the visit, at catalog price.
  // Any active service, also one already in the appointment (e.g. a second haircut for a brother).
  const extra = services.filter((s) => s.active || (fixing && a.serviceIds.includes(s.id)))
  const added = Object.entries(addQty).flatMap(([id, n]) => Array.from({ length: n }, () => id))
  const priceOf = (ids: string[]) => ids.reduce((t, id) => t + (services.find((s) => s.id === id)?.price ?? 0), 0)
  const addedTotal = priceOf(added)
  const stepService = (id: string, d: number) =>
    setAddQty((q) => ({ ...q, [id]: Math.max(0, Math.min(10, (q[id] ?? 0) + d)) }))
  // Correcting: the final list keeps the original order; unchanged keeps the price it was booked at.
  const finalIds = (() => {
    if (!fixing) return [...(a.serviceIds ?? []), ...added]
    const left = { ...addQty }
    const ordered: string[] = []
    for (const id of a.serviceIds)
      if ((left[id] ?? 0) > 0) {
        ordered.push(id)
        left[id] = left[id]! - 1
      }
    return [...ordered, ...Object.entries(left).flatMap(([id, n]) => Array.from({ length: n }, () => id))]
  })()
  const unchanged = finalIds.join() === (a.serviceIds ?? []).join()
  const base = fixing ? (unchanged ? a.totalPrice : priceOf(finalIds)) : a.totalPrice + addedTotal
  const servicesCharge = Math.max(0, base - rewardOff - discountOff)
  const sold = Object.entries(qty).filter(([, n]) => n > 0)
  const productsTotal = sold.reduce((t, [id, n]) => t + (products.find((p) => p.id === id)?.price ?? 0) * n, 0)
  const charge = servicesCharge + productsTotal
  const tipAmount = hasTip ? num(tip) : 0
  const total = charge + tipAmount
  const splitSum = num(parts.cash) + num(parts.card) + num(parts.transfer)

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
    if (fixing && !finalIds.length) return setLocal('Deja al menos un servicio.')
    if (fixing && !reason.trim()) return setLocal('Escribe el motivo de la corrección.')
    if (hasDiscount) {
      if (discountOff <= 0) return setLocal('Escribe el monto del descuento o desactívalo.')
      if (discountOff > base - rewardOff) return setLocal('El descuento no puede ser mayor a lo que se cobra.')
      if (!discount.reason.trim()) return setLocal('Escribe el motivo del descuento.')
      if (!canAuthorize && (!discount.email.trim() || !discount.password))
        return setLocal('El descuento necesita el correo y la contraseña del dueño o gerente.')
    }
    let splits: PaymentInput['splits']
    let m = method
    if (split) {
      splits = METHODS.map(({ value }) => ({ method: value, amount: num(parts[value]) })).filter((x) => x.amount > 0)
      if (splits.length < 2) return setLocal('Reparte el pago en al menos dos formas de pago.')
      if (splitSum !== charge) return setLocal(`El pago mixto debe sumar ${money(charge)}.`)
      m = [...splits].sort((x, y) => y.amount - x.amount)[0]!.method
    }
    // Nothing to charge (free cut, no tip): no payment method needed.
    m = m ?? (total === 0 ? 'cash' : null)
    if (!m) return setLocal('Elige cómo pagó.')
    if (hasTip && tipAmount <= 0) return setLocal('Escribe el monto de la propina o desactívala.')
    setLocal(null)
    onConfirm(
      {
        method: m,
        tip: tipAmount,
        tipMethod: hasTip ? (tipMethod ?? m) : m,
        ...(useReward && reward ? { useReward: true } : {}),
        ...(splits ? { splits } : {}),
        ...(sold.length ? { products: sold.map(([productId, n]) => ({ productId, qty: n })) } : {}),
        ...(fixing ? { serviceIds: finalIds } : added.length ? { addServiceIds: added } : {}),
        ...(hasDiscount
          ? {
              discount: {
                amount: discountOff,
                reason: discount.reason.trim(),
                ...(canAuthorize ? {} : { authorizer: { email: discount.email, password: discount.password } }),
              },
            }
          : {}),
      },
      print,
      fixing ? reason.trim() : undefined,
    )
  }

  const step = (id: string, d: number) => setQty((q) => ({ ...q, [id]: Math.max(0, Math.min(99, (q[id] ?? 0) + d)) }))
  const onSale = products.filter((p) => p.active)

  return (
    <SidePanel
      open={open}
      wide
      onOpenChange={(o) => !o && onCancel()}
      title={fixing ? 'Corregir cobro' : 'Completar y cobrar'}
      description={`${a.customer.name} · servicios ${money(base)}`}
      footer={
        <>
          {fixing && onVoid && (
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                if (!reason.trim()) return setLocal('Escribe el motivo para anular el cobro.')
                if (!confirmVoid) return setConfirmVoid(true)
                onVoid(reason.trim())
              }}
              className={buttonClass({
                variant: confirmVoid ? 'danger' : 'ghost',
                size: 'sm',
                className: 'sm:mr-auto',
              })}
            >
              {confirmVoid ? '¿Seguro? Anular cobro' : 'Anular cobro'}
            </button>
          )}
          <button type="button" onClick={onCancel} className={buttonClass({ variant: 'secondary', size: 'sm' })}>
            Volver
          </button>
          <button type="button" onClick={confirm} disabled={busy} className={buttonClass({ size: 'sm' })}>
            {busy ? 'Guardando…' : fixing ? `Guardar corrección · ${money(total)}` : `Completar · ${money(total)}`}
          </button>
        </>
      }
    >
      {/* One column that never grows past the panel: long product names truncate. */}
      <div className="grid grid-cols-[minmax(0,1fr)] gap-5">
        {(local || error) && <Alert tone="danger" title={(local || error)!} />}

        {fixing && (
          <div className="grid gap-2 rounded-lg border-[1.5px] border-warning-500/50 bg-warning-100/40 p-4">
            <p className="text-sm">
              Corriges lo que se cobró: cambia lo necesario y guarda. Se conserva la hora del cobro; los sellos, la
              caja, las comisiones y los reportes se ajustan solos. Para quitarlo por completo usa «Anular cobro».
            </p>
            <Input
              label="Motivo de la corrección"
              placeholder="Ej. se marcó tarjeta y fue efectivo"
              value={reason}
              onChange={(e) => {
                setReason(e.target.value)
                setConfirmVoid(false)
              }}
            />
          </div>
        )}

        {reward && (
          <div className="rounded-lg border-[1.5px] border-aqua-800/40 bg-aqua-500/10 p-4">
            <Switch
              label="Usar su corte gratis"
              description={
                reward.amount < reward.service.price
                  ? `Tarjeta completa: se descuenta un corte (${money(reward.amount)}) de ${reward.service.name} y se cobra la diferencia. Lo descontado no genera comisión.`
                  : `Tarjeta completa: no se cobra ${reward.service.name} (${money(reward.amount)}) y no genera comisión.`
              }
              checked={useReward}
              onChange={setUseReward}
            />
          </div>
        )}

        {extra.length > 0 && (
          <div className="grid grid-cols-[minmax(0,1fr)] gap-3 rounded-lg border border-line p-4">
            {fixing ? (
              <div>
                <p className="text-sm font-medium">Servicios cobrados</p>
                <p className="text-[13px] text-fg-muted">
                  Ajusta cantidades; si cambias la lista, se cobra a precio de lista.
                </p>
              </div>
            ) : (
              <Switch
                label="Agregar servicios"
                description={
                  added.length
                    ? `${added.length} ${added.length === 1 ? 'servicio agregado' : 'servicios agregados'} · ${money(addedTotal)}`
                    : 'Si pidió otro servicio (o el mismo otra vez, p. ej. para su hermano), agrégalo aquí; se cobra a precio de lista.'
                }
                checked={showServices}
                onChange={setShowServices}
              />
            )}
            {showServices && (
              <ul className="divide-y divide-line rounded-md border border-line" aria-label="Servicios para agregar">
                {extra.map((s) => {
                  const n = addQty[s.id] ?? 0
                  const inAppointment = a.serviceIds.includes(s.id)
                  return (
                    <li key={s.id} className="flex items-center gap-2 px-3 py-2">
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-medium [overflow-wrap:anywhere]">{s.name}</span>
                        <span className="tabular text-[13px] text-fg-muted">
                          {money(s.price)} · {durationLabel(s.durationMin)}
                          {!fixing && inAppointment ? ' · ya está en la cita' : ''}
                        </span>
                      </span>
                      <button
                        type="button"
                        aria-label={`Quitar uno de ${s.name}`}
                        disabled={!n}
                        onClick={() => stepService(s.id, -1)}
                        className="grid size-10 shrink-0 place-items-center rounded-full border border-line hover:border-fg disabled:opacity-30"
                      >
                        <Minus className="size-4" aria-hidden />
                      </button>
                      <span className="tabular w-6 text-center font-semibold" aria-label={`Agregados de ${s.name}`}>
                        {n}
                      </span>
                      <button
                        type="button"
                        aria-label={`Agregar uno de ${s.name}`}
                        onClick={() => stepService(s.id, 1)}
                        className="grid size-10 shrink-0 place-items-center rounded-full border border-line hover:border-fg"
                      >
                        <Plus className="size-4" aria-hidden />
                      </button>
                    </li>
                  )
                })}
              </ul>
            )}
          </div>
        )}

        {onSale.length > 0 && (
          <div className="grid grid-cols-[minmax(0,1fr)] gap-3 rounded-lg border border-line p-4">
            <Switch
              label="Agregar productos"
              description={
                productsTotal ? `${money(productsTotal)} en productos` : 'Productos vendidos en este mismo ticket.'
              }
              checked={showProducts}
              onChange={setShowProducts}
            />
            {showProducts && (
              <ul className="divide-y divide-line rounded-md border border-line" aria-label="Productos del ticket">
                {onSale.map((p) => {
                  const n = qty[p.id] ?? 0
                  return (
                    <li key={p.id} className="flex items-center gap-2 px-3 py-2">
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-medium [overflow-wrap:anywhere]">{p.name}</span>
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
                      <span className="tabular w-6 text-center font-semibold">{n}</span>
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
          </div>
        )}

        <div className="grid grid-cols-[minmax(0,1fr)] gap-3 rounded-lg border border-line p-4">
          <Switch
            label="Aplicar descuento"
            description="Sobre los servicios. Lo autoriza el dueño o el gerente."
            checked={hasDiscount}
            onChange={setHasDiscount}
          />
          {hasDiscount && (
            <div className="grid gap-3 sm:grid-cols-[120px_minmax(0,1fr)]">
              <Input
                label="Descuento"
                prefix="$"
                inputMode="numeric"
                value={discount.amount}
                onChange={(e) => setDiscount((d) => ({ ...d, amount: digits(e.target.value) }))}
              />
              <Input
                label="Motivo"
                value={discount.reason}
                onChange={(e) => setDiscount((d) => ({ ...d, reason: e.target.value }))}
              />
              {canAuthorize ? (
                <p className="text-[13px] text-fg-muted sm:col-span-2">
                  Lo autorizas tú; queda registrado en el ticket.
                </p>
              ) : (
                <>
                  <Input
                    label="Correo de quien autoriza"
                    type="email"
                    autoComplete="off"
                    value={discount.email}
                    onChange={(e) => setDiscount((d) => ({ ...d, email: e.target.value }))}
                  />
                  <Input
                    label="Contraseña"
                    type="password"
                    autoComplete="off"
                    value={discount.password}
                    onChange={(e) => setDiscount((d) => ({ ...d, password: e.target.value }))}
                  />
                </>
              )}
            </div>
          )}
        </div>

        <div className="grid gap-2">
          <div className="flex items-center justify-between gap-3">
            <p id="pay-method" className="text-[13px] font-medium">
              ¿Cómo pagó?
            </p>
            <Switch label="Pago mixto" checked={split} onChange={setSplit} />
          </div>
          {split ? (
            <div className="grid gap-2">
              <div className="grid grid-cols-3 gap-2">
                {METHODS.map(({ value }) => (
                  <Input
                    key={value}
                    label={methodLabels[value]}
                    prefix="$"
                    inputMode="numeric"
                    value={parts[value]}
                    onChange={(e) => setParts((p) => ({ ...p, [value]: digits(e.target.value) }))}
                  />
                ))}
              </div>
              <p
                className={cn('text-[13px]', splitSum === charge ? 'text-fg-muted' : 'text-fg-danger')}
                aria-live="polite"
              >
                {splitSum === charge
                  ? `Suma ${money(charge)}. La propina va aparte.`
                  : splitSum < charge
                    ? `Faltan ${money(charge - splitSum)} de ${money(charge)}.`
                    : `Sobran ${money(splitSum - charge)}: el total es ${money(charge)}.`}
              </p>
            </div>
          ) : (
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
          )}
        </div>

        <div className="grid grid-cols-[minmax(0,1fr)] gap-3 rounded-lg border border-line p-4">
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
                    onChange={(e) => setTip(digits(e.target.value))}
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

        <Switch
          label="Imprimir ticket al completar"
          description="Ticket de 80 mm en PDF. También puedes imprimirlo o descargarlo después desde la cita."
          checked={print}
          onChange={togglePrint}
        />

        <dl className="grid gap-1 rounded-lg bg-surface px-4 py-3 text-sm">
          <div className="flex justify-between">
            <dt className="text-fg-muted">Servicios{!fixing && addedTotal ? ' (con los agregados)' : ''}</dt>
            <dd className="tabular">{money(base)}</dd>
          </div>
          {rewardOff > 0 && (
            <div className="flex justify-between">
              <dt className="text-fg-muted">Corte gratis</dt>
              <dd className="tabular">−{money(rewardOff)}</dd>
            </div>
          )}
          {discountOff > 0 && (
            <div className="flex justify-between">
              <dt className="text-fg-muted">Descuento</dt>
              <dd className="tabular">−{money(discountOff)}</dd>
            </div>
          )}
          {productsTotal > 0 && (
            <div className="flex justify-between">
              <dt className="text-fg-muted">Productos</dt>
              <dd className="tabular">{money(productsTotal)}</dd>
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
    </SidePanel>
  )
}
